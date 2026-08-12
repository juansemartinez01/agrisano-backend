# Research: Lote de vermiculita

**Branch**: `020-lote-vermiculita` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)

Las decisiones de **negocio** (la vermiculita es un tercer tipo de lote; lleva un `grado`
seleccionable de 1 a 3; es opcional al sembrar; el `grado` es editable; `marca` y `batch` se
comportan igual que en sustrato) ya fueron cerradas explícitamente con el solicitante antes de
escribir `spec.md` y no se repiten aquí. Este documento cubre únicamente las decisiones
**técnicas** que quedaron abiertas, y las restricciones de Postgres y del código existente que
las condicionan.

---

## D1: Tercer valor del enum `lote_tipo` en la tabla `lotes`, no una tabla nueva

**Decisión**: extender el enum `lote_tipo` con `'vermiculita'` y seguir usando la tabla `lotes`
existente (herencia de tabla única con discriminador).

**Rationale**: el requisito del solicitante es que la vermiculita "siga exactamente el mismo
camino que el sustrato" y tenga "exactamente los mismos datos" más `grado`. La tabla `lotes` ya
implementa herencia de tabla única: las columnas exclusivas de semilla (`producto_id`,
`variedad_id`, `proveedor_semilla_id`) son nullables y solo aplican cuando `tipo = 'semilla'`.
Agregar un tercer discriminador es exactamente el caso de uso para el que la tabla ya está
diseñada, y hereda gratis:

- `BaseCrudTenantService` con `strictTenant: true` (aislamiento por tenant).
- Soft delete vía `@DeleteDateColumn`.
- El índice único parcial `UQ_lotes_tenant_tipo_numero (tenant_id, tipo, numero_lote) WHERE
  deleted_at IS NULL` — al incluir `tipo` en la clave, la vermiculita obtiene su propio espacio
  de numeración sin ningún cambio (FR-002).
- Los endpoints `consumir` / `rehabilitar` y el campo `estado` de la feature 019.
- Auditoría (`AuditService.write('admin', ...)`), roles, filtros, paginación y ordenamiento.

**Implicación de código**: `LoteTipo` en `lote.entity.ts` gana un miembro; `QueryLotesDto` ya
valida `tipo` con `@IsEnum(LoteTipo)`, así que el filtro `GET /lotes?tipo=vermiculita` funciona
sin tocar el DTO.

**Alternativas consideradas**:

- **Tabla `lotes_vermiculita` separada, con su módulo, servicio y controlador propios** —
  rechazada. Duplicaría ~800 líneas (entidad, DTOs, servicio, controlador, módulo, tests) para
  un conjunto de campos idéntico salvo uno, y obligaría a que cada consumidor (`siembra`,
  `trazabilidad`, `aplicaciones-quimicas`) haga un JOIN contra una tabla distinta con reglas
  distintas. Viola el principio I (Template First) del constitution.
- **Tabla de subtipo (`lotes_vermiculita_detalle` con FK 1:1 a `lotes` y solo `grado`)** —
  rechazada. Es la solución "correcta de libro" para herencia con campos exclusivos, pero un
  único campo `smallint` no justifica un JOIN adicional en cada lectura ni un segundo repositorio
  en el servicio. La tabla ya aceptó el trade-off de nullables exclusivos para semilla; ser
  consistente con esa decisión vale más que la pureza.
- **Reutilizar `tipo = 'sustrato'` con una marca booleana `es_vermiculita`** — rechazada.
  Rompería el espacio de numeración (FR-002: la vermiculita numera aparte) y haría que
  `GET /lotes?tipo=sustrato` devolviera vermiculita.

---

## D2: Dos migraciones separadas, por la restricción transaccional de Postgres

**Decisión**: dividir el cambio de esquema en dos archivos de migración:

1. `1774500000000-LoteTipoVermiculita.ts` — **únicamente** `ALTER TYPE "lote_tipo" ADD VALUE
   'vermiculita'`.
2. `1774500000001-LoteVermiculita.ts` — la columna `grado`, el CHECK, la columna
   `bandejas.lote_vermiculita_id`, su FK y su índice.

**Rationale**: Postgres no permite usar un valor de enum recién agregado dentro de la misma
transacción que lo agregó. TypeORM ejecuta cada migración dentro de una transacción por defecto.
La segunda migración necesita el literal `'vermiculita'` dentro del `CHECK` de `grado`, así que
**debe** correr en una transacción posterior.

Este no es un riesgo teórico: el repositorio ya tropezó con esto y lo resolvió con el mismo
patrón. `migrations/1772200000000-BandejaCoolingPeriod.ts` contiene solo el `ADD VALUE`, con un
comentario explícito que dice que la migración siguiente sí lo usa en un `DEFAULT` y que "deben
ir separadas". Se replica ese precedente al pie de la letra.

**Implicación de código**: el `down()` de la primera migración queda **vacío**, con un comentario.
Postgres no soporta `DROP VALUE` en un enum: una vez agregado `'vermiculita'` al tipo, el valor
queda ahí para siempre aunque se revierta todo lo demás. Esto ya está documentado en migraciones
previas del proyecto y es una asimetría aceptada. El rollback real de la feature lo hace la
segunda migración, que sí revierte por completo (borra el CHECK, la columna `grado`, el índice,
la FK y `lote_vermiculita_id`); con la columna `grado` fuera, el valor de enum huérfano es inerte.

**Alternativas consideradas**:

- **Un solo archivo de migración** — rechazada. Fallaría en tiempo de ejecución con
  `unsafe use of new value "vermiculita" of enum type lote_tipo`.
- **Un solo archivo desactivando la transacción de esa migración** — rechazada. Requiere
  configuración a nivel de `DataSource` que afectaría a todas las migraciones, y perdería la
  atomicidad del resto del DDL.
- **CHECK que no mencione el literal `'vermiculita'`** (por ejemplo, solo `grado BETWEEN 1 AND 3
  OR grado IS NULL`) — rechazada. Eso permitiría un lote de semilla con `grado = 2`, que es
  exactamente lo que FR-005 prohíbe. Perder la garantía en la base de datos para ahorrar un
  archivo de migración es un mal canje.

---

## D3: `grado` como `smallint` con CHECK, no como enum de Postgres ni como catálogo

**Decisión**: `grado smallint NULL`, con una restricción CHECK bicondicional que lo ata al tipo:

```sql
CHECK (
  (tipo =  'vermiculita' AND grado IS NOT NULL AND grado BETWEEN 1 AND 3) OR
  (tipo <> 'vermiculita' AND grado IS NULL)
)
```

**Rationale**: tres razones convergen.

1. **Un enum de Postgres sería irreversible**, igual que `lote_tipo` (ver D2). Si mañana el
   negocio agrega un grado 4, con `smallint` es cambiar el CHECK; con un enum es un `ADD VALUE`
   permanente. Y si el negocio quisiera *quitar* un grado, con enum es imposible.
2. **El repositorio ya se arrepintió de un enum de dominio.** La migración
   `1772000000000` migró el campo `producto` de enum a la tabla `productos` justamente porque el
   conjunto de valores resultó no ser fijo. No hay que repetir ese camino.
3. **Un catálogo (`grados_vermiculita`) sería over-engineering.** El solicitante definió el
   conjunto como cerrado y estable (tres valores, sin nombres ni atributos propios); una tabla
   para tres enteros literales agrega un JOIN, un CRUD, y un módulo entero sin ningún beneficio.
   Esto queda registrado como suposición en `spec.md` — si el conjunto se vuelve dinámico,
   migrar `smallint` → FK es un cambio acotado.

El CHECK bicondicional es lo que hace cumplir FR-004 y FR-005 **en la base de datos**, no solo en
el servicio. Hay precedente de CHECK en el esquema: `CHK_lotes_quimicos_cantidad_actual` en
`1771900000000-QuimicosLotesRefactor.ts`. Es el único, pero existe y el estilo está establecido.

**Implicación de código**: la validación de entrada sigue viviendo en el DTO y el servicio (para
devolver un error de negocio legible, no un 500 por violación de constraint); el CHECK es la red
de seguridad contra escrituras que esquiven el servicio.

**Alternativas consideradas**:

- **`CREATE TYPE vermiculita_grado AS ENUM ('1','2','3')`** — rechazada por irreversibilidad y
  porque forzaría el grado a viajar como string en la API cuando el solicitante lo describió como
  un valor numérico seleccionable.
- **Sin CHECK, validando solo en el servicio** — rechazada. Deja la invariante FR-005 sin ninguna
  garantía a nivel de datos; cualquier script, migración futura o escritura directa podría dejar
  un lote de semilla con grado.
- **`integer` en vez de `smallint`** — rechazada por trivial; `smallint` describe mejor el
  dominio 1–3 y el ahorro de bytes es irrelevante pero gratis.

---

## D4: Invertir las guardas de campos exclusivos de semilla (`=== SUSTRATO` → `!== SEMILLA`)

**Decisión**: reescribir las tres condiciones de `lotes.service.ts` que hoy preguntan por
`SUSTRATO` en positivo, para que pregunten por "no es semilla".

| Ubicación | Hoy | Debe quedar |
|---|---|---|
| `lotes.service.ts:99` (`createLote`) | `dto.tipo === LoteTipo.SUSTRATO && (...)` | `dto.tipo !== LoteTipo.SEMILLA && (...)` |
| `lotes.service.ts:160` (`updateLote`) | `current.tipo === LoteTipo.SUSTRATO` | `current.tipo !== LoteTipo.SEMILLA` |
| `lotes.service.ts:173` (`updateLote`) | `current.tipo === LoteTipo.SUSTRATO` | `current.tipo !== LoteTipo.SEMILLA` |

**Rationale**: estas guardas son las que rechazan `producto_id`, `variedad_id` y
`proveedor_semilla_id` en lotes que no son de semilla. Hoy funcionan porque solo hay dos tipos y
"es sustrato" equivale a "no es semilla". En el momento en que existe un tercer tipo, la
equivalencia se rompe: **un lote de vermiculita aceptaría silenciosamente un producto, una
variedad y un semillero**, guardándolos en la base sin error alguno. Es el fallo más peligroso de
toda la feature, porque no rompe nada visiblemente — solo corrompe datos de a poco.

Esto es lo que FR-006 captura como requisito funcional, precisamente para que quede cubierto por
tests y no dependa de que alguien recuerde la sutileza.

**Implicación de código**: para `semilla` y `sustrato` el comportamiento resultante es
**idéntico** al actual (mismos códigos de error, mismos 422). No es un cambio de contrato: es
hacer explícita una intención que hoy está escrita de una forma que no escala.

**Alternativas consideradas**:

- **Enumerar los tipos: `tipo === SUSTRATO || tipo === VERMICULITA`** — rechazada. Vuelve a fallar
  con el cuarto tipo. La forma negativa expresa la regla real ("estos campos son exclusivos de
  semilla") y es estable frente a nuevos tipos.
- **Un helper `esTipoSemilla(tipo)`** — considerada y descartada por ahora: para tres usos en un
  mismo archivo agrega indirección sin ganancia. Si aparece un cuarto consumidor, se extrae.

---

## D5: `bandejas.lote_vermiculita_id` nullable, sin backfill

**Decisión**: la columna se crea `uuid NULL`, sin valor por defecto y sin poblar registros
históricos.

**Rationale**: `lote_semilla_id` y `lote_sustrato_id` son `uuid NOT NULL` desde
`1770400000000-SiembraInit.ts`. La simetría tentaría a hacer `lote_vermiculita_id` también NOT
NULL, pero es imposible de forma honesta:

- Las bandejas ya sembradas **no llevaron vermiculita**. No existe ningún lote real al que
  apuntar.
- Asignarles un lote inventado o un lote "placeholder" fabricaría trazabilidad falsa: el reporte
  de trazabilidad diría que una cosecha usó una partida de vermiculita que nunca tocó.
- La vermiculita es opcional al sembrar por decisión del solicitante (FR-013), así que aun para
  bandejas futuras la columna tiene que admitir ausencia.

FR-022 y FR-023 formalizan esto: las siembras anteriores siguen siendo válidas y se informan sin
vermiculita, no con vermiculita vacía inventada.

**Implicación de código**: la asimetría (dos columnas NOT NULL y una nullable) se propaga a todo
el código de lectura, que debe manejar el caso ausente en vez de usar aserciones de no-nulo. En
concreto:

- `trazabilidad.service.ts` mapea hoy con `r.lote_sustrato_numero!` (aserción de no-nulo). Para
  vermiculita eso sería mentira y hay que mapear condicionalmente.
- `siembra.service.ts` usa `leftJoinAndMapOne` para los dos lotes actuales; el tercer join usa el
  mismo mecanismo y ya devuelve `undefined` cuando no hay match.
- `aplicaciones-quimicas.service.ts` **ya tiene** un helper `loteRefOrNull()` para exactamente
  esta forma. El caso nullable encaja ahí sin fricción.

**Alternativas consideradas**:

- **NOT NULL con backfill a un lote "sin vermiculita" por tenant** — rechazada. Es datos falsos en
  el sistema de trazabilidad, que es precisamente donde la falsedad tiene consecuencias
  regulatorias.
- **Tabla puente `bandeja_lotes` (N:M) para unificar los tres** — rechazada. Sería el diseño
  correcto si hubiera que soportar N insumos por bandeja, pero migrar dos columnas NOT NULL
  vivas, con FKs e índices, y reescribir todos los consumidores, es una refactorización de
  arquitectura que excede por completo el pedido. Queda registrada como camino futuro si aparece
  un cuarto insumo.

---

## D6: La validación de vermiculita en `createSiembra` corre bajo un guard de presencia

**Decisión**: en el bloque de validación de `createSiembra`, los chequeos de vermiculita se
ejecutan solo si el grupo trae `lote_vermiculita_id`. El orden queda: semilla → sustrato →
vermiculita.

**Rationale**: FR-013 permite omitir la vermiculita, así que su ausencia no es un error y no
puede entrar al mismo camino que los otros dos, que son obligatorios (FR-012). Cuando **sí**
viene, se le aplican exactamente las mismas cuatro validaciones que a los otros lotes (tipo
correcto, mismo establecimiento, no consumido, activo), más ninguna adicional — FR-014 a FR-016.

El orden semilla → sustrato → vermiculita mantiene el criterio ya establecido en la feature 019 y
en el servicio actual: se reporta el primer problema encontrado, no una lista. Poner vermiculita
al final significa que ningún mensaje de error existente cambia de contenido ni de orden para las
siembras que hoy funcionan — importante para no romper tests ni expectativas del frontend.

**Implicación de código**: el bucle de validación resuelve cada lote con
`lotesService.mustFindById` (una consulta por lote y por grupo). La vermiculita agrega **una
consulta más por grupo, solo cuando viene informada** — cero costo adicional para las siembras
que la omiten. Con el tope de 200 grupos por siembra que ya impone el DTO, el peor caso pasa de
400 a 600 lecturas puntuales por índice primario: mismo orden de magnitud, sin cambio de patrón.

**Alternativas consideradas**:

- **Validar vermiculita primero** — rechazada; cambiaría cuál error se reporta en payloads con
  múltiples problemas, alterando comportamiento observable sin motivo.
- **Requerir vermiculita cuando el tenant tenga al menos un lote de vermiculita cargado** —
  rechazada. Es magia implícita; el solicitante pidió opcionalidad simple y sin condiciones.

---

## D7: `grado` viaja en las lecturas mediante una referencia dedicada, no ensuciando las existentes

**Decisión**: definir un tipo de referencia propio para vermiculita — `{ id, numero_lote, grado }`
— en vez de agregar `grado` al tipo de referencia compartido que hoy usan semilla y sustrato.

**Rationale**: `grado` es `null` **por construcción** para semilla y sustrato (lo garantiza el
CHECK de D3). Agregarlo al tipo común obligaría a emitir `"grado": null` en cada lote de semilla y
de sustrato de cada respuesta de detalle de siembra, trazabilidad y aplicaciones químicas: ruido
permanente en el contrato a cambio de nada. FR-024 pide explícitamente que los lotes de semilla y
sustrato se sigan informando exactamente igual que hoy.

**Implicación de código**: hay tres lugares donde vive la forma de la referencia de lote y los
tres necesitan el tipo nuevo:

- `siembra.service.ts` — el tipo `LoteRef` local.
- `trazabilidad.service.ts` — las interfaces de fila cruda y de salida.
- `aplicaciones-quimicas/types/aplicacion-enriched.types.ts` — la forma enriquecida.

No se centralizan en un tipo compartido en esta feature: el principio IX del constitution
desaconseja importar tipos entre módulos de feature, y unificarlos sería una refactorización
transversal fuera de alcance.

Efecto secundario a vigilar en `aplicaciones-quimicas`: el helper `homogeneousLote` está firmado
contra `LoteRef`, así que si se le pasa una referencia de vermiculita devuelve `LoteRef` y
**descarta `grado` sin error de compilación**. Debe volverse genérico
(`<T extends { id: string }>`). Es el único lugar donde el tipo dedicado no basta por sí solo.

**Alternativas consideradas**:

- **`grado` en el tipo común, siempre presente** — rechazada por el ruido descrito y porque
  cambia la forma de objetos que hoy el frontend ya consume.
- **Exponer el objeto lote completo en vez de una referencia** — rechazada; multiplicaría el
  tamaño de las respuestas de trazabilidad y filtraría campos administrativos (proveedor, marca,
  observaciones) a superficies que hoy no los muestran.

---

## D8: `deleteLote` debe contar también las referencias de vermiculita

**Decisión**: extender la consulta SQL cruda de `lotes.service.ts:216` con
`OR lote_vermiculita_id = $1`.

**Rationale**: esa consulta cuenta bandejas que referencian el lote para devolver un 409 en vez de
dejar que explote la FK. Hoy cubre dos de las tres columnas. Sin el tercer `OR`, borrar un lote de
vermiculita en uso **pasa la validación** y luego falla contra la restricción de clave foránea:
el usuario recibe un **500** genérico en vez del **409** con explicación que FR-017 exige. Es un
fallo silencioso hasta que alguien intenta borrar, y entonces es incomprensible.

**Implicación de código**: se agrega el `OR` y nada más. El resto de la consulta se deja **como
está** — no filtra `deleted_at` ni `tenant_id`, lo que es deuda preexistente (una bandeja
borrada lógicamente sigue bloqueando el borrado del lote). Corregirlo cambiaría comportamiento
para semilla y sustrato, que está fuera del alcance de esta feature; queda anotado en
`spec.md` (Out of Scope).

**Alternativas consideradas**:

- **Reescribir la consulta con el QueryBuilder de TypeORM** (que aplicaría el filtro de soft
  delete automáticamente) — rechazada por ahora. Arreglaría la deuda, pero cambia el
  comportamiento observable de borrado para lotes de semilla y sustrato sin que nadie lo haya
  pedido ni verificado. Se registra como deuda separada.

---

## D9: Filtro por lote en `GET /bandejas`

**Decisión**: agregar `lote_vermiculita_id` a la lista `filterAllowed` de `bandeja.service.ts:31`
y, en el mismo movimiento, agregar también `lote_sustrato_id`, que falta hoy.

**Rationale**: FR-021 pide poder listar todas las bandejas que usaron una partida de vermiculita.
El mecanismo ya existe: `filterAllowed` en el servicio base. Hoy la lista incluye
`lote_semilla_id` pero **no** `lote_sustrato_id` — un hueco preexistente. Agregar solo vermiculita
dejaría el conjunto más asimétrico que ahora (semilla sí, sustrato no, vermiculita sí), lo que es
peor que cualquiera de los dos extremos.

**Nota de alcance**: `lote_sustrato_id` es una adición **no cubierta por ningún FR** del spec. Es
una palabra en un arreglo, sin riesgo (el servicio base ya sanea y valida los filtros permitidos)
y sin cambio para quien no la use. Se señala explícitamente aquí para que sea una decisión
visible y no un agregado silencioso: si se prefiere alcance estricto, se quita esa palabra y todo
lo demás queda igual.

**Alternativas consideradas**:

- **Solo `lote_vermiculita_id`** — viable, y es la opción de alcance estricto. Ver nota arriba.
- **Un endpoint dedicado `GET /lotes/:id/bandejas`** — rechazada. Duplica paginación, filtros y
  permisos que el listado de bandejas ya resuelve, para una consulta que es un filtro.

---

## D10: `marca_id` y `batch` sin validación nueva

**Decisión**: en lotes de vermiculita, `marca_id` y `batch` se aceptan exactamente con las mismas
reglas que en sustrato — es decir, sin ninguna validación cruzada por tipo.

**Rationale**: decisión explícita del solicitante ("igual que sustrato"). Consecuencia consciente:
se replica el comportamiento actual tal cual, incluyendo la falta de validación de `batch`, que
en el modelo mental del dominio pertenece a semilla pero hoy no está restringido para ningún tipo.
Corregirlo sería un cambio de comportamiento para sustrato, que nadie pidió.

**Implicación de código**: importa **no** arrastrar `batch` ni `marca_id` a la guarda invertida de
D4. Esa guarda cubre únicamente `producto_id`, `variedad_id` y `proveedor_semilla_id` — los tres
campos que hoy ya rechaza. Ampliarla "de paso" rompería lotes de sustrato existentes que usan
`batch`.

**Alternativas consideradas**:

- **Prohibir `batch` en no-semilla** — rechazada por el solicitante en la ronda de dudas. Sería un
  cambio incompatible para sustrato.
- **Prohibir `marca_id` en vermiculita** — rechazada; la vermiculita tiene marca comercial igual
  que el sustrato, es un dato legítimo.

---

## Resumen de artefactos afectados

| Archivo | Cambio |
|---|---|
| `migrations/1774500000000-LoteTipoVermiculita.ts` | **NUEVO** — solo `ALTER TYPE ... ADD VALUE`; `down()` vacío documentado |
| `migrations/1774500000001-LoteVermiculita.ts` | **NUEVO** — `grado` + CHECK + `bandejas.lote_vermiculita_id` + FK + índice |
| `src/modules/lotes/entities/lote.entity.ts` | `LoteTipo.VERMICULITA`; columna `grado` |
| `src/modules/lotes/dto/create-lote.dto.ts` | `grado` con `@ValidateIf` sobre `tipo` + `@IsIn([1,2,3])` |
| `src/modules/lotes/dto/update-lote.dto.ts` | `grado` opcional |
| `src/modules/lotes/dto/query-lotes.dto.ts` | Filtro `grado` (FR-010); el filtro por `tipo` ya funciona sin cambios |
| `src/modules/lotes/lotes.service.ts` | 3 guardas invertidas (D4); validación de `grado` por tipo; `'grado'` en `filterAllowed`; `OR lote_vermiculita_id` en `deleteLote` (D8) |
| `src/common/errors/error-codes.ts` | `LOTE_GRADO_NO_PERMITIDO` |
| `src/modules/siembra/entities/bandeja.entity.ts` | `lote_vermiculita_id` nullable + relación |
| `src/modules/siembra/dto/create-siembra.dto.ts` | `lote_vermiculita_id` opcional en `BandejaGroupDto` |
| `src/modules/siembra/siembra.service.ts` | Validación condicional (D6); persistencia; tercer join y tipo de referencia (D7) |
| `src/modules/siembra/bandeja.service.ts` | `filterAllowed` (D9) |
| `src/modules/trazabilidad/trazabilidad.service.ts` | SQL cruda: JOIN + columnas; 3 interfaces; mapeo condicional (D5, D7) |
| `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts` | JOIN + columnas; `homogeneousLote` genérico para no perder `grado` |
| `src/modules/aplicaciones-quimicas/types/aplicacion-enriched.types.ts` | `vermiculite_lot` en `NurserySeedingGroup` (D7) |
| `test/*` (unit) | Casos de `grado`, guardas invertidas, siembra con y sin vermiculita, borrado referenciado |
| `docs/handoff-frontend-lote-vermiculita.md` | **NUEVO** — contrato para el frontend |

**Total**: 2 migraciones, ~15 archivos de código, tests y 1 documento de handoff. Sin cambios
incompatibles: los cuatro contratos de API tocados (`POST /siembras`, `GET /siembras/:id`,
`GET /trazabilidad/cosecha/:id`, `GET /aplicaciones-quimicas`) se extienden de forma aditiva.
