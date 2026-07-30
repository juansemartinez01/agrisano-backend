# Feature Specification: Estado de consumido para lotes de semilla y sustrato

**Feature Branch**: `019-lote-estado-consumido`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "Bien, y quiero que asi quede, lo unico que quiero cambiar, es que para esto, se agregue un estado que se cambia de forma manual, que sea del tipo Consumido o algo por el estilo, que un operario pone cuando no hay mas de ese lote, entonces dejaria de mostrarlo en listados para crear siembras con esos lotes. Cuando se registra, se ingresa con un estado tipo Habilitado y ahi si permite crear todo, pero cuando un operador toca un boton, lo pone como consumido."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El operario marca un lote como consumido (Priority: P1)

Como operario que trabaja con lotes de semilla y sustrato, quiero poder marcar un lote como "consumido" cuando ya no queda nada de él, para que deje de aparecer como opción disponible al armar nuevas siembras.

**Why this priority**: Es el corazón del pedido. Sin esto, los operarios siguen viendo lotes agotados en el selector de siembras y pueden elegirlos por error, generando registros que no corresponden a la realidad del depósito.

**Independent Test**: Marcar un lote habilitado como consumido y verificar que el listado de lotes disponibles para crear una siembra ya no lo incluye, mientras que el lote sigue existiendo y consultable en el listado general.

**Acceptance Scenarios**:

1. **Given** un lote de semilla en estado habilitado, **When** un operario lo marca como consumido, **Then** el lote pasa a estado consumido, queda registrado quién y cuándo lo hizo, y deja de aparecer en el listado de lotes disponibles para siembras.
2. **Given** un lote de sustrato en estado habilitado, **When** un operario lo marca como consumido, **Then** el mismo comportamiento aplica: pasa a consumido y desaparece de las opciones disponibles.
3. **Given** un lote recién creado, **When** se consulta su estado, **Then** figura como habilitado sin que nadie lo haya marcado explícitamente.
4. **Given** un lote ya marcado como consumido, **When** un operario intenta marcarlo como consumido de nuevo, **Then** la operación se rechaza informando que ya estaba consumido, sin alterar la fecha ni el usuario del consumo original.

---

### User Story 2 - Un responsable revierte una marca de consumido hecha por error (Priority: P2)

Como supervisor, quiero poder revertir la marca de "consumido" de un lote cuando se marcó por equivocación o cuando llega mercadería adicional del mismo lote, para no tener que dar de alta un lote duplicado.

**Why this priority**: Es la salvaguarda del cambio principal. Sin una forma de revertir, un error de un operario deja un lote inutilizable para siempre y obliga a soluciones manuales fuera del sistema (como crear un lote nuevo con el mismo número).

**Independent Test**: Marcar un lote como consumido, revertirlo con un usuario de rol supervisor, y verificar que vuelve a aparecer entre los lotes disponibles para siembras.

**Acceptance Scenarios**:

1. **Given** un lote marcado como consumido, **When** un supervisor lo rehabilita, **Then** el lote vuelve a estado habilitado, vuelve a aparecer entre los disponibles para siembras, y ya no conserva la fecha ni el usuario del consumo que se revirtió.
2. **Given** un lote marcado como consumido, **When** un operario (no supervisor) intenta rehabilitarlo, **Then** la operación se rechaza por falta de permisos y el lote permanece consumido.
3. **Given** un lote que ya está habilitado, **When** alguien intenta rehabilitarlo igualmente, **Then** la operación se rechaza informando que no estaba consumido.

---

### User Story 3 - El sistema impide crear siembras con lotes no disponibles (Priority: P1)

Como responsable de la trazabilidad del vivero, quiero que el sistema rechace la creación de una siembra si alguno de los lotes elegidos no está disponible (porque está consumido o porque fue dado de baja administrativamente), para que ningún registro de siembra quede vinculado a un lote que ya no existe físicamente o que fue desactivado.

**Why this priority**: Es la garantía de que el estado nuevo realmente tiene efecto donde importa. Sin esta validación, marcar un lote como consumido sería solo un indicador visual sin consecuencias reales, y además persiste hoy un problema ya existente: un lote dado de baja administrativamente puede usarse en una siembra sin ningún aviso.

**Independent Test**: Intentar crear una siembra usando un lote de semilla marcado como consumido y verificar que se rechaza sin crear ningún registro; repetir con un lote de sustrato consumido y con un lote dado de baja administrativamente.

**Acceptance Scenarios**:

1. **Given** un lote de semilla marcado como consumido, **When** se intenta crear una siembra que lo usa, **Then** la operación se rechaza identificando que el lote de semilla no está disponible, y no se crea ninguna bandeja.
2. **Given** un lote de sustrato marcado como consumido, **When** se intenta crear una siembra que lo usa, **Then** la operación se rechaza identificando que el lote de sustrato no está disponible, y no se crea ninguna bandeja.
3. **Given** un lote (semilla o sustrato) dado de baja administrativamente pero no marcado como consumido, **When** se intenta crear una siembra que lo usa, **Then** la operación también se rechaza, cerrando el hueco que existe hoy donde esto se permitía sin aviso.
4. **Given** una siembra que combina un lote de semilla disponible con un lote de sustrato no disponible, **When** se intenta crearla, **Then** se rechaza identificando específicamente cuál de los dos lotes es el problema.

---

### User Story 4 - Filtrar el listado de lotes por disponibilidad (Priority: P2)

Como usuario que arma el listado de lotes para elegir en una siembra, quiero poder pedir explícitamente solo los lotes disponibles, para no tener que filtrar manualmente los consumidos o dados de baja del lado del cliente.

**Why this priority**: Facilita la experiencia de selección, pero el sistema ya es correcto sin esto gracias a la historia 3 (que impide el uso indebido); esta historia es sobre comodidad de listado, no sobre integridad de datos.

**Independent Test**: Pedir el listado de lotes disponibles y verificar que excluye tanto los consumidos como los dados de baja, mientras que el listado general sin filtros sigue mostrando todo como hasta ahora.

**Acceptance Scenarios**:

1. **Given** una mezcla de lotes habilitados, consumidos y dados de baja, **When** se pide el listado general sin filtros, **Then** se siguen mostrando todos, igual que antes de este cambio.
2. **Given** la misma mezcla, **When** se pide el listado filtrado por disponibilidad, **Then** solo aparecen los lotes habilitados y activos.
3. **Given** la misma mezcla, **When** se pide el listado filtrado explícitamente por estado consumido, **Then** solo aparecen los que fueron marcados como consumidos.

---

### Edge Cases

- **Lote consumido con historial**: si un lote ya fue usado en siembras antes de marcarse como consumido, esas siembras y sus bandejas no se ven afectadas; el estado nuevo solo rige hacia adelante.
- **Edición de datos de un lote consumido**: corregir el número de lote, observaciones u otros datos de un lote ya consumido sigue permitido; el estado de consumo no bloquea otras ediciones.
- **Baja administrativa y consumo son independientes**: un lote puede estar dado de baja y seguir habilitado como estado de consumo, o viceversa; solo la combinación de ambas condiciones determina si puede usarse en una siembra.
- **Doble clic accidental**: si dos solicitudes de "marcar consumido" llegan casi al mismo tiempo para el mismo lote, solo una tiene efecto; la otra se rechaza informando que ya estaba consumido, sin duplicar el registro de auditoría.
- **Lote eliminado**: intentar marcar como consumido o rehabilitar un lote que fue eliminado se rechaza como recurso no encontrado, igual que cualquier otra operación sobre un lote inexistente.
- **Motivo del consumo**: el operario puede dejar una nota explicando por qué se agotó el lote al momento de marcarlo, y esa nota queda visible junto con el estado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST registrar para cada lote de semilla o sustrato un estado de disponibilidad con dos valores posibles: habilitado o consumido.
- **FR-002**: Todo lote nuevo MUST nacer en estado habilitado, sin que el usuario pueda elegir otro valor al crearlo.
- **FR-003**: El sistema MUST permitir marcar un lote habilitado como consumido, y MUST registrar quién realizó la acción y en qué momento.
- **FR-004**: El sistema MUST permitir dejar una nota opcional explicando el motivo al marcar un lote como consumido, y MUST conservarla asociada a ese lote.
- **FR-005**: El sistema MUST rechazar el intento de marcar como consumido un lote que ya está consumido, sin alterar el registro de quién y cuándo lo consumió originalmente.
- **FR-006**: El sistema MUST permitir revertir un lote de consumido a habilitado, exclusivamente a roles de mayor jerarquía que el rol operativo estándar (supervisor o superior).
- **FR-007**: El sistema MUST rechazar el intento de un rol operativo estándar de revertir un consumo.
- **FR-008**: El sistema MUST rechazar el intento de revertir un lote que no está consumido.
- **FR-009**: Al revertir un consumo, el sistema MUST limpiar la fecha, el usuario y el motivo asociados al consumo revertido, ya que esos datos describen el consumo vigente y no un historial.
- **FR-010**: El sistema MUST tratar la baja administrativa de un lote (ya existente en el sistema) como independiente del estado de consumo: ambos pueden combinarse de cualquier forma.
- **FR-011**: El sistema MUST rechazar la creación de una siembra que use un lote de semilla o sustrato que no esté simultáneamente habilitado (no consumido) y activo (no dado de baja administrativamente).
- **FR-012**: El rechazo de FR-011 MUST identificar cuál de los dos lotes (semilla o sustrato) causó el rechazo y por cuál de las dos razones (consumido o dado de baja).
- **FR-013**: El sistema MUST ofrecer una forma de listar lotes filtrando explícitamente por estado de consumo (habilitado o consumido).
- **FR-014**: El sistema MUST ofrecer una forma de listar únicamente los lotes disponibles para uso en siembras (habilitados y activos a la vez), sin que el cliente deba aplicar esa combinación de reglas por su cuenta.
- **FR-015**: El listado general de lotes, sin ningún filtro de disponibilidad, MUST seguir devolviendo todos los lotes exactamente como lo hace hoy.
- **FR-016**: Marcar un lote como consumido o revertirlo MUST quedar registrado en la auditoría del sistema, incluyendo quién lo hizo y cuándo.
- **FR-017**: Marcar un lote como consumido o revertirlo MUST NOT afectar las siembras o registros ya existentes que hayan usado ese lote previamente.
- **FR-018**: Editar otros datos de un lote (número, observaciones, etc.) MUST seguir permitido sin importar su estado de consumo.
- **FR-019**: El estado de consumo de un lote MUST NOT poder modificarse a través de la edición general del lote; solo a través de las acciones dedicadas de marcar consumido y revertir.

### Key Entities

- **Lote**: entidad ya existente que representa un lote de semilla o sustrato. Suma un estado de disponibilidad (habilitado/consumido) independiente de su baja administrativa existente, más los datos de quién y cuándo lo marcó como consumido y el motivo informado.
- **Siembra**: entidad ya existente que consume lotes de semilla y sustrato al crearse. Es el único punto donde la disponibilidad de un lote tiene consecuencias reales.
- **Registro de auditoría**: registro ya existente en el sistema; suma dos acciones nuevas correspondientes a marcar consumido y revertir.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los lotes marcados como consumidos dejan de aparecer en el listado de lotes disponibles para siembras, verificable inmediatamente después de la acción.
- **SC-002**: El 100% de los intentos de crear una siembra con un lote no disponible (consumido o dado de baja) son rechazados sin crear ningún registro parcial.
- **SC-003**: El 100% de las reversiones de consumo realizadas por un rol autorizado devuelven el lote a la lista de disponibles de inmediato.
- **SC-004**: El 100% de los intentos de reversión por un rol no autorizado son rechazados sin cambiar el estado del lote.
- **SC-005**: Cero regresiones: el listado general de lotes sin filtros y los lotes, siembras y bandejas ya existentes no cambian de comportamiento ni de forma.
- **SC-006**: El 100% de las acciones de marcar consumido y revertir quedan identificables después en la auditoría, con quién y cuándo las realizó.

## Assumptions

- El rol operativo estándar (el mismo que hoy puede registrar siembras, cosechas, trasplantes, etc.) es quien marca los lotes como consumidos, porque es quien está en contacto directo con el estado físico del depósito.
- La reversión de un consumo requiere un rol de mayor jerarquía porque revertir es una decisión que corrige un error o refleja información nueva (llegó más mercadería del lote), y conviene que no quede en manos de cualquier operario.
- No existe ni se agrega ninguna noción de cantidad o stock numérico: el estado es binario (disponible o no), no una cantidad que se decrementa. Esto es consistente con que estos lotes nunca tuvieron esa noción.
- La nota que explica el motivo del consumo es un campo de texto libre y opcional, separado de las observaciones generales del lote, porque describe un evento distinto (por qué se agotó) y no una característica permanente del lote.
- El listado general de lotes debe seguir sin filtrar nada por defecto para no romper a ningún cliente existente que ya lo consume; el filtrado por disponibilidad se ofrece como opción adicional.
- La creación de la siembra sigue siendo la única operación de escritura del sistema que consume lotes de semilla o sustrato; ningún otro flujo (trasplante, cosecha, packing, aplicaciones químicas, trazabilidad) necesita conocer este estado.

## Out of Scope

- Cualquier noción de cantidad, stock numérico o unidad de medida para estos lotes.
- Consumo automático o alertas basadas en umbrales de uso.
- Vencimiento de lotes por fecha.
- Consumo parcial de un lote (el estado es binario, no hay grados intermedios).
- Un historial visible de cuántas veces se consumió y revirtió un lote (la auditoría general del sistema cubre esta trazabilidad, pero no se construye una vista dedicada).
- Cambios en los módulos de lotes de químicos, marcas, trazabilidad, cosecha, packing o trasplante.
