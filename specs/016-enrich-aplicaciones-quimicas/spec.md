# Feature Specification: Enriquecimiento de lectura de Aplicaciones Químicas

**Feature Branch**: `016-enrich-aplicaciones-quimicas`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Enriquecer los endpoints de lectura de aplicaciones químicas (GET /aplicaciones-quimicas y GET /aplicaciones-quimicas/:id) para que el listado paginado devuelva tarjetas completas (usuario enriquecido, target_count, target_summary con túneles o seedings resumidos, chemical_lines enriquecidas con químico, lote, marca y proveedor) y el detalle devuelva targets enriquecidos agrupados (mesas por túnel; bandejas por siembra), todo aditivo, sin N+1 y sin migraciones de esquema."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Historial de aplicaciones en una sola carga (Priority: P1)

Como usuario de la pantalla `/chemicals`, quiero ver el historial paginado de aplicaciones químicas con toda la información de cada tarjeta (quién aplicó, qué químicos y lotes se usaron, cuántas mesas o bandejas se afectaron y en qué túneles o siembras) sin esperas ni cargas parciales.

**Why this priority**: Es el problema central del ticket: hoy el listado no alcanza para pintar las tarjetas y el frontend tendría que hacer N requests adicionales por aplicación, degradando la pantalla completa.

**Independent Test**: Con datos de prueba (aplicaciones greenhouse y nursery existentes), llamar `GET /aplicaciones-quimicas?page=1&limit=10` y verificar que cada item trae `usuario`, `target_count`, `target_summary` y `chemical_lines` completos, sin necesidad de ningún otro request.

**Acceptance Scenarios**:

1. **Given** una aplicación greenhouse sobre 8 mesas repartidas en 2 túneles, **When** se consulta el listado, **Then** el item devuelve `target_count = 8`, ambos túneles con su `table_count` correcto, y no incluye el array completo de mesas.
2. **Given** una aplicación nursery sobre 71 bandejas de 2 siembras, **When** se consulta el listado, **Then** el item devuelve `target_count = 71`, ambas siembras con su `tray_count`, fecha de creación de cada siembra, y producto/variedad cuando el conjunto de bandejas afectadas es homogéneo.
3. **Given** una aplicación con un químico principal y 2 adicionales, **When** se consulta el listado, **Then** `chemical_lines` contiene exactamente 3 líneas (una por lote realmente usado), sin duplicar el principal, con nombre de químico, lote, marca y proveedor cuando existan.
4. **Given** una página de 10 aplicaciones, **When** se consulta el listado, **Then** la respuesta conserva el envelope `{ok, data, meta}` con `page`, `limit`, `total`, y todos los campos que existían antes siguen presentes sin renombrar.

---

### User Story 2 - Detalle completo bajo demanda (Priority: P2)

Como usuario, al abrir "View details" de una aplicación quiero ver los targets identificables y agrupados: mesas con nombre, posición y estado agrupadas por túnel (greenhouse), o bandejas con código y estado agrupadas por siembra con producto, variedad y lotes (nursery), en una sola request.

**Why this priority**: Completa la experiencia de la pantalla; depende de que el listado (P1) ya funcione pero es independiente en su implementación.

**Independent Test**: Llamar `GET /aplicaciones-quimicas/:id` para una aplicación greenhouse y una nursery, y verificar el bloque `targets` agrupado además de los campos actuales (`aplicacion`, `detalles`, `mesa_ids`/`bandeja_ids`).

**Acceptance Scenarios**:

1. **Given** una aplicación greenhouse, **When** se consulta el detalle, **Then** se devuelven `mesa_ids` (sin cambios) más `targets.tunnels[]` con las mesas enriquecidas (nombre estable, `posicion_actual`, `estado`) agrupadas por túnel y `targets.total` igual a la cantidad de mesas distintas.
2. **Given** una aplicación nursery, **When** se consulta el detalle, **Then** se devuelven `bandeja_ids` (sin cambios) más `targets.seedings[]` agrupados por siembra con `tray_count` exacto, producto, variedad, lote de semilla, lote de sustrato y bandejas con código y estado actual.
3. **Given** una aplicación nursery cuyas bandejas ya fueron trasplantadas, **When** se consulta el detalle, **Then** las bandejas aparecen con su estado actual (`trasplantada`) sin que eso las excluya del detalle histórico.
4. **Given** una mesa o túnel eliminado después de la aplicación, **When** se consulta el detalle, **Then** el ID se conserva y el enriquecimiento correspondiente es `null`, sin error 500.

---

### User Story 3 - Resiliencia ante datos faltantes (Priority: P3)

Como consumidor de la API, necesito que la ausencia de cualquier recurso relacionado (usuario eliminado, marca sin asignar, lote borrado, siembra heterogénea) degrade a `null` en el campo enriquecido sin eliminar la aplicación del resultado ni provocar errores.

**Why this priority**: Garantiza la estabilidad del contrato en datos reales e históricos; es transversal a P1 y P2.

**Independent Test**: Crear una aplicación cuyo usuario luego se elimina (o referenciar recursos inexistentes en datos de prueba) y verificar que el listado y el detalle responden 200 con `usuario: null` (y demás enriquecimientos en `null`).

**Acceptance Scenarios**:

1. **Given** una aplicación cuyo usuario fue eliminado, **When** se consulta listado o detalle, **Then** se devuelve `usuario_id` intacto y `usuario: null`.
2. **Given** un químico sin marca o un lote sin proveedor resoluble, **When** se consulta el listado, **Then** la línea química devuelve `brand: null` / `supplier: null` manteniendo el resto de los datos.
3. **Given** una siembra cuyas bandejas afectadas provienen de lotes de semilla distintos (productos heterogéneos), **When** se consulta listado o detalle, **Then** `product`, `variety`, `seed_lot` y `substrate_lot` de ese seeding devuelven `null`.

---

### Edge Cases

- Aplicación greenhouse cuyas mesas pertenecen a más de un túnel (nunca asumir un solo túnel).
- Aplicación nursery cuyas bandejas pertenecen a más de una siembra (nunca asumir un solo batch).
- Mesa que cambió de posición después de la aplicación: `posicion_actual` refleja el presente y no se presenta como posición histórica.
- El mismo lote químico aparece como principal y también en detalles adicionales: se muestran las líneas tal como fueron registradas, sin colapsarlas ni duplicar artificialmente.
- Usuario con `nombre`/`apellido` en `null`: se devuelven `null` junto con el email, sin fabricar valores.
- Valores decimales faltantes: nunca se convierten a cero; se devuelven `null`.
- Aplicación sin targets registrados (dato histórico anómalo): `target_count = 0` y `target_summary` con arrays vacíos, sin error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El listado `GET /aplicaciones-quimicas` MUST mantener su contrato actual (rutas, filtros, `page`, `limit`, `sortBy`, `sortOrder`, tope 200, orden default `fecha_hora DESC`, envelope `{ok, data, meta}`) y agregar campos únicamente de forma aditiva.
- **FR-002**: Cada item del listado MUST incluir `usuario` enriquecido (`id`, `nombre`, `apellido`, `email`) junto al `usuario_id` existente; `usuario: null` si no puede resolverse.
- **FR-003**: Cada item del listado MUST incluir `target_count` (cantidad exacta de mesas o bandejas distintas afectadas) y `target_summary` con `tunnels[]` (greenhouse: id, nombre, `table_count` por túnel) y `seedings[]` (nursery: id, `created_at`, `tray_count`, `product`, `variety`), sin devolver los arrays completos de `mesa_ids`/`bandeja_ids`.
- **FR-004**: Cada item del listado MUST incluir `chemical_lines[]` con una línea por lote químico registrado en los detalles de la aplicación: `lote_quimico_id`, `chemical_id`, `chemical_name`, `lot_name`, `quantity`, `unit`, `brand`, `supplier`; el químico principal no se duplica (ya existe como detalle) y lotes distintos del mismo químico son líneas separadas.
- **FR-005**: En `chemical_lines`, los campos `dose`, `dose_unit` y `withholding_period_days` MUST poblarse solo para la línea principal (aquella cuyo lote coincide con el lote principal de la aplicación) usando los valores snapshot de la aplicación; en las líneas adicionales son `null` porque no existe dosis por detalle.
- **FR-006**: El detalle `GET /aplicaciones-quimicas/:id` MUST conservar `aplicacion`, `detalles`, `mesa_ids` y `bandeja_ids` tal como hoy, y agregar `targets` con `context`, `total` y agrupamiento por túnel (greenhouse: mesas con `id`, `nombre`, `posicion_actual`, `estado`) o por siembra (nursery: `tray_count`, `product`, `variety`, `seed_lot`, `substrate_lot` y `trays[]` con `id`, `codigo`, `estado`).
- **FR-007**: `product`, `variety`, `seed_lot` y `substrate_lot` de cada seeding MUST derivarse de las bandejas afectadas de esa siembra; si el conjunto es heterogéneo (más de un valor distinto), el campo correspondiente es `null`.
- **FR-008**: Todo enriquecimiento cuyo recurso relacionado no exista o esté eliminado MUST devolver `null` sin provocar error 500 ni excluir la aplicación del resultado.
- **FR-009**: El número de consultas a base de datos por página del listado MUST ser constante (no proporcional a la cantidad de aplicaciones, mesas ni bandejas); el detalle MUST resolverse con consultas agregadas, nunca una consulta por target. La paginación, el orden y el `total` MUST ejecutarse en SQL.
- **FR-010**: El enriquecimiento de usuario MUST exponer exclusivamente `id`, `nombre`, `apellido`, `email` — nunca hash de contraseña ni otros campos sensibles — y MUST respetar el aislamiento por tenant en todas las consultas nuevas.
- **FR-011**: La creación de aplicaciones, el descuento de stock, las carencias, el historial de mesa, la trazabilidad, los permisos/roles y los endpoints `mesas/:id/aplicaciones` y `bandejas/:id/aplicaciones` MUST permanecer sin cambios de comportamiento.
- **FR-012**: No se requieren cambios de esquema de base de datos; los índices existentes cubren los accesos necesarios y no deben crearse índices duplicados.

### Key Entities

- **Aplicación Química**: evento inmutable de aplicación (contexto greenhouse/nursery, fecha, usuario, observaciones, lote principal con dosis snapshot).
- **Detalle de Aplicación**: línea por lote químico consumido (cantidad total y unidad); incluye al principal.
- **Target Greenhouse**: vínculo aplicación–mesa; la mesa pertenece a un túnel y tiene nombre estable, posición actual y estado.
- **Target Nursery**: vínculo aplicación–bandeja; la bandeja pertenece a una siembra y referencia lote de semilla (→ producto/variedad) y lote de sustrato.
- **Usuario responsable**: quien registró la aplicación; puede no existir ya.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La pantalla de historial puede pintarse completa con exactamente 1 request al listado; abrir un detalle requiere exactamente 1 request adicional.
- **SC-002**: Para una página de 10 aplicaciones, el backend ejecuta un número fijo de consultas (≤ 6) independientemente de cuántas mesas/bandejas tenga cada aplicación.
- **SC-003**: Los contadores son exactos en el 100% de los casos: `target_count`, `table_count` por túnel, `tray_count` por siembra y `targets.total` coinciden con los vínculos registrados.
- **SC-004**: Ningún consumidor existente se rompe: todos los campos previos del listado y del detalle siguen presentes con el mismo nombre y tipo (verificable comparando respuestas antes/después).
- **SC-005**: Con recursos relacionados eliminados o faltantes, el 100% de las respuestas siguen siendo 200 con los enriquecimientos en `null`.

## Assumptions

- La dosis por línea química adicional no existe en los datos históricos; se acepta `dose: null` en esas líneas (decisión tomada con el solicitante).
- Producto/variedad/lotes por seeding se derivan de las bandejas afectadas; heterogeneidad ⇒ `null` (decisión tomada con el solicitante).
- `posicion_actual` y `estado` de mesas/bandejas se muestran como valores actuales, no históricos; una posición histórica, si se necesitara, sería un campo futuro separado.
- El campo `withholding_period_days` de la línea principal proviene del snapshot guardado en la aplicación (histórico), no del valor vigente del químico.
- Los endpoints por mesa y por bandeja no se enriquecen en este ticket (pueden reutilizar el mecanismo después).
- No hay cambios frontend en este ticket.
