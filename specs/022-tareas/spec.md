# Feature Specification: Módulo de tareas (to-do list operativa)

**Feature Branch**: `022-tareas`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "necesito hacer un modulo que seria tipo una to do list, en la cual tenemos tareas, las tareas pueden tener distintos ambitos, como por ejemplo nursery y greenhouse por ahora, quizas en un futuro aparecen mas, y basicamente serian tareas a hacer, que van a tener estados, quiero mantenerlo simple en un principio"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Planificar el trabajo de un ámbito (Priority: P1)

Como supervisor que organiza la jornada, quiero anotar las tareas pendientes de un establecimiento separadas por ámbito (nursery, greenhouse), para que el equipo tenga en un solo lugar la lista de lo que hay que hacer.

**Why this priority**: Sin poder crear y ver tareas no existe el módulo. Es el mínimo que ya entrega valor: reemplaza el papel o el grupo de mensajería donde hoy se anotan los pendientes.

**Independent Test**: Crear varias tareas en un establecimiento, unas de nursery y otras de greenhouse, consultar la lista filtrando por ámbito y verificar que cada una aparece solo en el ámbito que le corresponde.

**Acceptance Scenarios**:

1. **Given** un supervisor autenticado y un establecimiento de su cliente, **When** crea una tarea indicando título y ámbito, **Then** la tarea queda registrada como pendiente y aparece en la lista de ese establecimiento y ámbito.
2. **Given** una tarea recién creada, **When** cualquier usuario autenticado consulta la lista, **Then** ve el título, la descripción, el ámbito, el estado, el responsable asignado (si tiene) y quién la creó.
3. **Given** tareas de varios ámbitos y establecimientos, **When** un usuario filtra por ámbito, por estado o por establecimiento, **Then** recibe solo las tareas que cumplen el filtro, paginadas.
4. **Given** un operario autenticado, **When** intenta crear una tarea, **Then** la operación se rechaza por falta de permisos.
5. **Given** una tarea de otro cliente (tenant), **When** un usuario la consulta o intenta operarla, **Then** el sistema responde como si no existiera.
6. **Given** un cliente que en el futuro incorpore un ámbito nuevo, **When** la aplicación cliente consulta la lista de ámbitos disponibles, **Then** recibe los ámbitos vigentes sin necesidad de tenerlos escritos en su propio código.

---

### User Story 2 - Avanzar y cerrar una tarea (Priority: P1)

Como operario que ejecuta el trabajo en el campo, quiero marcar que empecé una tarea y luego que la terminé, para que el supervisor vea el avance sin tener que preguntar.

**Why this priority**: Es la otra mitad del mínimo viable. Una lista que no se puede tachar no sirve; y sin el estado intermedio dos personas pueden arrancar la misma tarea.

**Independent Test**: Tomar una tarea pendiente, verificar que queda en curso, completarla y verificar que quedan registrados la fecha y el usuario que la completó.

**Acceptance Scenarios**:

1. **Given** una tarea pendiente, **When** un operario la marca como en curso, **Then** la tarea cambia de estado y el cambio queda registrado en la auditoría.
2. **Given** una tarea en curso, **When** un operario la marca como completada, **Then** la tarea queda completada y se registran la fecha/hora y el usuario que la completó.
3. **Given** una tarea pendiente, **When** un operario la completa directamente sin pasar por en curso, **Then** la operación se acepta.
4. **Given** una tarea en curso que el operario no va a poder hacer, **When** la devuelve a pendiente, **Then** la tarea vuelve a quedar disponible para cualquiera.
5. **Given** una tarea ya completada, **When** un operario intenta completarla otra vez, **Then** la operación se rechaza informando que la transición no es válida.
6. **Given** una tarea que ya no hay que hacer, **When** un supervisor la cancela, **Then** la tarea queda cancelada y deja de figurar entre las activas, sin borrarse.

---

### User Story 3 - Asignar un responsable (Priority: P2)

Como supervisor, quiero poder asignarle una tarea a un operario concreto, o dejarla sin asignar para que la tome quien esté libre, para repartir el trabajo sin ambigüedad cuando hace falta.

**Why this priority**: Mejora sustancialmente el uso diario, pero la lista ya funciona sin esto: sin asignación las tareas son del equipo.

**Independent Test**: Asignar una tarea a un usuario, consultar la lista filtrando por ese responsable y verificar que aparece; quitarle la asignación y verificar que deja de aparecer en ese filtro.

**Acceptance Scenarios**:

1. **Given** una tarea sin responsable, **When** un supervisor le asigna un usuario del mismo cliente, **Then** la tarea queda asignada a ese usuario.
2. **Given** una tarea asignada, **When** el usuario asignado consulta sus tareas, **Then** la ve en el listado filtrado por responsable.
3. **Given** una tarea asignada, **When** un supervisor le quita el responsable, **Then** la tarea vuelve a quedar disponible para todo el equipo.
4. **Given** un identificador de usuario que no existe o pertenece a otro cliente, **When** se intenta asignar la tarea a ese usuario, **Then** la operación se rechaza.
5. **Given** una tarea asignada a un usuario, **When** otro operario la toma y la completa, **Then** la operación se acepta y queda registrado quién la completó realmente.

---

### User Story 4 - Ordenar la lista por prioridad real (Priority: P2)

Como supervisor, quiero reordenar a mano las tareas de un ámbito, para que el equipo lea la lista de arriba hacia abajo y sepa qué es lo primero sin que yo tenga que explicarlo.

**Why this priority**: Es la forma de expresar prioridad elegida para esta versión. Requiere que exista la lista, pero no bloquea su uso.

**Independent Test**: Crear tres tareas en un ámbito, reordenarlas invirtiendo su secuencia, volver a consultar la lista y verificar que el orden persiste.

**Acceptance Scenarios**:

1. **Given** varias tareas creadas en un mismo establecimiento y ámbito, **When** un usuario consulta la lista sin indicar criterio de orden, **Then** las recibe en el orden manual definido.
2. **Given** una tarea nueva, **When** se crea, **Then** queda al final de la lista de su establecimiento y ámbito.
3. **Given** una lista ordenada, **When** un supervisor envía la nueva secuencia de tareas activas, **Then** la lista queda ordenada según esa secuencia y el cambio queda registrado en la auditoría.
4. **Given** una secuencia que no coincide con las tareas activas del ámbito (porque otro usuario agregó o cerró una tarea mientras tanto), **When** se intenta reordenar, **Then** la operación se rechaza para que el cliente vuelva a leer la lista actualizada.
5. **Given** un operario, **When** intenta reordenar la lista, **Then** la operación se rechaza por falta de permisos.

---

### User Story 5 - Corregir la lista (Priority: P3)

Como supervisor, quiero editar una tarea mal cargada, reabrir una que se cerró por error y eliminar las que nunca debieron existir, para que la lista refleje la realidad y no acumule ruido.

**Why this priority**: Higiene del módulo. Sin esto se convive con errores de carga, pero el trabajo diario no se detiene.

**Independent Test**: Editar el título de una tarea, reabrir una tarea completada y verificar que vuelve a pendiente sin datos de cierre, y eliminar una tarea verificando que desaparece de los listados.

**Acceptance Scenarios**:

1. **Given** una tarea con el título mal escrito, **When** un supervisor corrige el título o la descripción, **Then** la tarea queda actualizada.
2. **Given** una tarea completada por error, **When** un supervisor la reabre, **Then** vuelve a estado pendiente y se borran la fecha y el usuario de completado.
3. **Given** una tarea completada, **When** un operario intenta reabrirla, **Then** la operación se rechaza por falta de permisos.
4. **Given** una tarea cancelada, **When** un supervisor la reabre, **Then** vuelve a estado pendiente.
5. **Given** una tarea cargada por error, **When** un supervisor la elimina, **Then** deja de aparecer en todos los listados pero el registro se conserva para auditoría.
6. **Given** una tarea ya creada, **When** se intenta cambiar su ámbito o su establecimiento, **Then** la operación se rechaza.

---

### Edge Cases

- ¿Qué pasa si se pide una transición al mismo estado en el que ya está la tarea? → Se rechaza como transición inválida, para que el cliente detecte que su vista está desactualizada.
- ¿Qué pasa si dos usuarios crean una tarea en el mismo ámbito exactamente al mismo tiempo? → Ambas se crean y el orden mostrado sigue siendo estable y determinístico.
- ¿Qué pasa con el orden de las tareas completadas o canceladas? → Conservan la posición que tenían, pero no participan del reordenamiento ni condicionan el orden de las activas.
- ¿Qué pasa si el responsable asignado se desactiva o se elimina lógicamente? → La tarea conserva la asignación y el sistema sigue pudiendo identificar de quién se trata; no se reasigna sola.
- ¿Qué pasa si se intenta eliminar un establecimiento que tiene tareas? → No se permite dejar tareas huérfanas: el establecimiento sigue siendo requerido y existente para toda tarea.
- ¿Qué pasa si el título viene vacío o con solo espacios? → Se rechaza; el título es obligatorio.
- ¿Qué pasa si se envía a reordenar una secuencia con identificadores repetidos, ajenos al ámbito o inexistentes? → Se rechaza completa; no se aplica parcialmente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir a supervisores y admin_global crear tareas indicando establecimiento, ámbito y título; la descripción y el responsable son opcionales.
- **FR-002**: Toda tarea MUST pertenecer a exactamente un establecimiento y a exactamente un ámbito, y ambos MUST ser inmutables después de la creación.
- **FR-003**: El sistema MUST soportar los ámbitos `nursery` y `greenhouse`, y MUST permitir incorporar ámbitos nuevos sin cambiar el contrato de la API ni requerir cambios en las aplicaciones cliente.
- **FR-004**: El sistema MUST exponer la lista de ámbitos vigentes, de modo que las aplicaciones cliente no necesiten tenerlos escritos en su código.
- **FR-005**: Toda tarea MUST tener uno de estos estados: `pendiente`, `en_progreso`, `completada`, `cancelada`, y MUST nacer en `pendiente`.
- **FR-006**: El sistema MUST permitir a operarios, supervisores y admin_global cambiar el estado de una tarea entre `pendiente`, `en_progreso`, `completada` y `cancelada`.
- **FR-007**: El sistema MUST restringir la reapertura (volver a `pendiente` desde `completada` o `cancelada`) a supervisores y admin_global.
- **FR-008**: El sistema MUST rechazar toda transición de estado no contemplada, incluida la transición de un estado a sí mismo.
- **FR-009**: Al completarse una tarea, el sistema MUST registrar la fecha/hora de completado y el usuario que la completó, tomando la identidad de la sesión autenticada y nunca del cuerpo de la petición.
- **FR-010**: Al reabrirse una tarea, el sistema MUST limpiar la fecha/hora y el usuario de completado.
- **FR-011**: El sistema MUST registrar en cada tarea el usuario que la creó, tomado de la sesión autenticada.
- **FR-012**: El sistema MUST permitir asignar la tarea a un usuario del mismo cliente, dejarla sin asignar, o quitarle la asignación; MUST rechazar la asignación a un usuario inexistente o de otro cliente.
- **FR-013**: El sistema MUST permitir a supervisores y admin_global editar título, descripción y responsable de una tarea, y MUST rechazar cualquier otro campo en la edición.
- **FR-014**: El sistema MUST mantener un orden manual de las tareas dentro de cada combinación de establecimiento y ámbito; una tarea nueva MUST quedar al final de esa lista.
- **FR-015**: El sistema MUST permitir a supervisores y admin_global reordenar las tareas activas (`pendiente` y `en_progreso`) de un establecimiento y ámbito enviando la secuencia completa, y MUST rechazar la operación si la secuencia no coincide exactamente con las tareas activas de esa lista.
- **FR-016**: El listado de tareas MUST ser paginado y MUST poder filtrarse por establecimiento, ámbito, estado, responsable y texto libre sobre título y descripción.
- **FR-017**: El listado MUST devolver las tareas en el orden manual por defecto, y ese orden MUST ser estable entre páginas.
- **FR-018**: El sistema MUST permitir a supervisores y admin_global eliminar una tarea de forma lógica: deja de aparecer en los listados pero el registro se conserva.
- **FR-019**: El sistema MUST impedir el acceso a tareas de otro cliente en toda operación de lectura y escritura.
- **FR-020**: El sistema MUST registrar en la auditoría la creación, la edición, cada cambio de estado (con el estado de origen y el de destino), el reordenamiento y la eliminación de tareas.
- **FR-021**: Las lecturas MUST devolver, para creador, responsable y quien completó, datos suficientes para identificar a la persona sin exponer información sensible de su cuenta.
- **FR-022**: Todos los endpoints del módulo MUST requerir un usuario autenticado.

### Key Entities

- **Tarea**: una unidad de trabajo a realizar. Pertenece a un cliente y a un establecimiento, se clasifica por ámbito, tiene un título obligatorio y una descripción opcional, un estado, una posición dentro de su lista, un creador, un responsable opcional y los datos de cierre (cuándo y quién) cuando fue completada.
- **Ámbito**: la clasificación operativa de la tarea (`nursery`, `greenhouse`, y los que se incorporen). Es un valor cerrado y conocido por el sistema, no un texto libre.
- **Estado**: la situación de la tarea dentro de su ciclo de vida, con transiciones controladas.
- **Establecimiento** (existente): el lugar físico al que pertenece la tarea. El módulo lo referencia, no lo modifica.
- **Usuario** (existente): interviene como creador, responsable y ejecutor del cierre. El módulo lo referencia, no lo modifica.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un supervisor puede cargar una tarea nueva indicando solo establecimiento, ámbito y título, en una sola operación.
- **SC-002**: Un operario puede pasar una tarea de pendiente a completada en una sola acción.
- **SC-003**: El equipo puede ver, en una sola consulta, todas las tareas pendientes y en curso de un ámbito de un establecimiento, ordenadas según la prioridad que definió el supervisor.
- **SC-004**: El 100% de los cambios de estado queda registrado con usuario, fecha, estado de origen y estado de destino, y es recuperable desde la auditoría.
- **SC-005**: Incorporar un ámbito nuevo no requiere ningún cambio en las aplicaciones cliente ni rompe las tareas existentes.
- **SC-006**: Ninguna consulta ni operación puede alcanzar tareas de otro cliente, verificado explícitamente con dos clientes distintos.
- **SC-007**: El orden de la lista es idéntico en dos consultas consecutivas sin cambios de por medio, incluso al pasar de página.

## Assumptions

- Se reutilizan la autenticación, el esquema de roles (`operario`, `supervisor`, `admin_global`) y el aislamiento por cliente ya existentes; el módulo no introduce roles ni mecanismos de acceso nuevos.
- La visibilidad se resuelve por cliente, igual que en mesas, túneles y aplicaciones químicas: un usuario ve las tareas de todos los establecimientos de su cliente y filtra por establecimiento cuando lo necesita. No se aplica el filtrado por establecimientos vinculados al usuario que sí usa el módulo de establecimientos.
- La versión inicial no incluye prioridad como campo propio, fecha límite, notificaciones, recurrencia, plantillas, comentarios, adjuntos, subtareas ni múltiples responsables por tarea. La prioridad se expresa exclusivamente con el orden manual.
- La tarea no se vincula a una entidad concreta (mesa, túnel, siembra, bandeja): el ámbito es una clasificación, y el detalle va en el título y la descripción.
- Se asume un volumen de decenas de tareas activas por establecimiento y ámbito, compatible con un reordenamiento que envía la lista completa.
- Las tareas completadas y canceladas se conservan indefinidamente; no hay archivado ni purga automática en esta versión.
