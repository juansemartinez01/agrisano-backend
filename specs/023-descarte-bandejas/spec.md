# Feature Specification: Descarte de bandejas (registro de pérdida)

**Feature Branch**: `023-descarte-bandejas`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "cuando un operador, admin o quien sea, se le cae o desecha por alguna razon una bandeja, entonces debe registrar la perdida de esa bandeja, y quedar constatado que esa bandeja se perdio"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar la pérdida de una bandeja (Priority: P1)

Como operario que trabaja en el nursery o en el invernadero, cuando se me cae una bandeja o hay que desecharla, quiero registrar esa pérdida indicando el motivo, para que quede constancia de que esa bandeja ya no existe y nadie la siga contando como disponible.

**Why this priority**: Es el módulo entero. Sin esto la bandeja perdida sigue figurando como viva y puede ser trasplantada o tratada químicamente por otra persona, generando datos falsos aguas abajo.

**Independent Test**: Tomar una bandeja disponible, registrar su pérdida con un motivo, y verificar que deja de aparecer entre las bandejas disponibles y que el registro de la pérdida queda consultable con motivo, fecha y responsable.

**Acceptance Scenarios**:

1. **Given** una bandeja en cualquier situación de su ciclo (recién sembrada, en nursery, o ya trasplantada a una mesa), **When** un operario registra su pérdida indicando un motivo, **Then** la bandeja queda marcada como descartada y deja de estar disponible para cualquier operación posterior.
2. **Given** una pérdida registrada, **When** cualquier usuario la consulta, **Then** obtiene el motivo, las observaciones, la fecha de la pérdida, el usuario responsable y la situación en la que estaba la bandeja al momento de perderse.
3. **Given** varias bandejas perdidas en un mismo incidente, **When** el operario registra la pérdida de todas juntas, **Then** todas quedan descartadas con el mismo motivo, fecha y responsable, en una sola operación.
4. **Given** un conjunto en el que solo algunas de las bandejas indicadas son válidas, **When** se intenta registrar la pérdida del conjunto, **Then** no se descarta ninguna y el sistema informa cuáles son las bandejas conflictivas.
5. **Given** una bandeja de otro cliente (tenant), **When** un usuario intenta descartarla, **Then** el sistema responde como si no existiera.
6. **Given** el motivo genérico ("otro"), **When** se registra la pérdida sin explicación escrita, **Then** la operación se rechaza: el motivo genérico exige una observación.

---

### User Story 2 - Encontrar la bandeja que se perdió (Priority: P1)

Como operario que tiene la bandeja rota en la mano, quiero llegar a ella desde la mesa en la que estaba o desde la siembra a la que pertenece, para poder registrar la pérdida sin tener que identificarla por un código.

**Why this priority**: Sin una forma práctica de encontrar la bandeja, el registro de la pérdida no se puede ejecutar en el campo. Las bandejas no tienen un código legible ni escaneable, así que la única vía real es filtrar por su ubicación.

**Independent Test**: Consultar las bandejas de una mesa concreta, elegir una de la lista y registrar su pérdida; repetir el recorrido partiendo de la siembra.

**Acceptance Scenarios**:

1. **Given** una mesa con bandejas trasplantadas, **When** un usuario consulta las bandejas de esa mesa, **Then** recibe la lista de las bandejas que están en ella.
2. **Given** una siembra con bandejas, **When** un usuario consulta las bandejas de esa siembra, **Then** recibe la lista con la situación de cada una.
3. **Given** un listado de bandejas, **When** el usuario filtra por las descartadas, **Then** recibe solo las perdidas, con el dato de su pérdida incluido.
4. **Given** un listado de bandejas sin filtro de situación, **When** el usuario lo consulta, **Then** las descartadas no se mezclan con las disponibles.

---

### User Story 3 - Registrar una pérdida de un día anterior (Priority: P2)

Como supervisor que carga al sistema lo que pasó en el campo, quiero poder indicar que la pérdida ocurrió ayer o un día anterior, para que la constancia refleje la fecha real del incidente y no la fecha en que llegué a la computadora.

**Why this priority**: El registro sigue funcionando sin esto (se asume el día de carga), pero la fecha real es lo que hace utilizable el dato para analizar mermas. El proyecto ya resolvió este mismo problema para la entrada a nursery.

**Independent Test**: Registrar una pérdida indicando una fecha anterior, verificar que queda guardada con esa fecha, e intentar registrar una con fecha futura y verificar que se rechaza.

**Acceptance Scenarios**:

1. **Given** una bandeja disponible, **When** se registra su pérdida indicando una fecha anterior a hoy, **Then** la pérdida queda registrada con esa fecha.
2. **Given** una bandeja disponible, **When** se registra su pérdida sin indicar fecha, **Then** se asume el momento de la carga.
3. **Given** una fecha posterior a hoy, **When** se intenta registrar la pérdida, **Then** la operación se rechaza.
4. **Given** una fecha anterior al último hecho conocido de la bandeja (su siembra, su entrada a nursery o su trasplante), **When** se intenta registrar la pérdida, **Then** la operación se rechaza: una bandeja no puede perderse antes de existir o antes de haber sido movida por última vez.
5. **Given** una fecha que no existe en el calendario, **When** se intenta registrar la pérdida, **Then** la operación se rechaza.

---

### User Story 4 - Analizar las mermas (Priority: P2)

Como supervisor o administrador, quiero consultar las pérdidas registradas filtrando por motivo, establecimiento y período, para entender cuánto se pierde, por qué y en qué etapa del ciclo.

**Why this priority**: Es la razón de fondo por la que se registran las pérdidas. No bloquea el registro, pero sin esto la constancia queda escrita y nunca leída.

**Independent Test**: Registrar pérdidas con motivos distintos y en fechas distintas, y verificar que el listado permite acotarlas por motivo, por establecimiento y por rango de fechas.

**Acceptance Scenarios**:

1. **Given** pérdidas registradas con motivos diversos, **When** un usuario consulta el listado filtrando por un motivo, **Then** recibe solo las pérdidas de ese motivo, paginadas.
2. **Given** pérdidas de varios establecimientos, **When** se filtra por establecimiento, **Then** se reciben solo las de ese establecimiento.
3. **Given** pérdidas ocurridas en distintas fechas, **When** se filtra por un rango de fechas, **Then** se reciben solo las del rango.
4. **Given** pérdidas ocurridas en distintas etapas, **When** se filtra por la situación en la que estaba la bandeja al perderse, **Then** se puede distinguir lo que se pierde en el nursery de lo que se pierde ya en el invernadero.

---

### User Story 5 - Que la pérdida no rompa la trazabilidad (Priority: P1)

Como responsable de la trazabilidad, quiero que una bandeja perdida después de haber sido trasplantada siga apareciendo en el historial de la mesa y en la trazabilidad de su cosecha, para que un reporte ya emitido no pierda información y se entienda por qué esa bandeja no llegó al final del ciclo.

**Why this priority**: La constancia de la pérdida no puede lograrse borrando historia. Si registrar una pérdida vaciara la trazabilidad, el módulo sería peor que no tenerlo.

**Independent Test**: Trasplantar bandejas a una mesa, cosechar, descartar una de esas bandejas y verificar que la trazabilidad de la cosecha la sigue mostrando, ahora con su pérdida indicada.

**Acceptance Scenarios**:

1. **Given** una bandeja trasplantada a una mesa, **When** se registra su pérdida, **Then** su vínculo con la mesa y su historial de aplicaciones químicas se conservan intactos.
2. **Given** una cosecha ya registrada de esa mesa, **When** se consulta su trazabilidad, **Then** la bandeja perdida sigue formando parte del ciclo, señalada como descartada y con el motivo de la pérdida.
3. **Given** una bandeja trasplantada, **When** se registra su pérdida, **Then** el historial de la mesa registra el evento, porque la mesa cambió de contenido.
4. **Given** una bandeja descartada, **When** se intenta eliminar el lote de semilla, sustrato o vermiculita que la originó, **Then** la eliminación sigue estando bloqueada: la bandeja perdida no libera sus lotes.

---

### Edge Cases

- ¿Qué pasa si dos personas registran la pérdida de la misma bandeja al mismo tiempo? → Solo una prospera; la otra recibe el rechazo por bandeja ya descartada. No se registran dos pérdidas de la misma bandeja.
- ¿Qué pasa si alguien intenta trasplantar o aplicar un químico a una bandeja mientras se está registrando su pérdida? → Una de las dos operaciones se rechaza; nunca quedan ambas aplicadas.
- ¿Qué pasa si se intenta descartar una bandeja ya descartada? → Se rechaza. La pérdida es un hecho único y definitivo.
- ¿Qué pasa si se quiere deshacer una pérdida cargada por error? → No se puede desde la API. El descarte es terminal por decisión de diseño; una corrección requiere intervención directa sobre la base.
- ¿Qué pasa si se descarta la única bandeja en cooling de una siembra y luego se intenta ingresar esa siembra a nursery? → El ingreso se rechaza informando que no hay bandejas en cooling, que es el resultado correcto.
- ¿Qué pasa si se intenta eliminar una siembra que tiene bandejas descartadas? → Se rechaza, igual que con las trasplantadas: la constancia de la pérdida no puede borrarse borrando la siembra.
- ¿Qué pasa si el conjunto de bandejas a descartar mezcla establecimientos, siembras o mesas distintas? → Se acepta: un incidente puede alcanzar bandejas de orígenes distintos y todas comparten motivo, fecha y responsable.
- ¿Qué pasa si se envían identificadores repetidos en el mismo pedido? → Se tratan como una sola bandeja; no generan un rechazo.
- ¿Qué pasa si una bandeja descartada estaba dentro del período de carencia de un químico? → El dato de carencia se conserva sin cambios; la pérdida no lo altera ni lo anula.
- ¿Qué pasa con una bandeja descartada cuya siembra se elimina lógicamente después? → No ocurre: la eliminación de esa siembra queda bloqueada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir a operarios, supervisores y admin_global registrar la pérdida de una o varias bandejas en una sola operación.
- **FR-002**: El registro de una pérdida MUST exigir un motivo tomado de un conjunto cerrado de causas conocidas por el sistema, y MUST admitir observaciones escritas opcionales.
- **FR-003**: El sistema MUST exigir observaciones cuando el motivo elegido sea el genérico.
- **FR-004**: El sistema MUST permitir registrar la pérdida de una bandeja cualquiera sea la situación en la que se encuentre, incluida una bandeja ya trasplantada a una mesa.
- **FR-005**: Una bandeja descartada MUST quedar en una situación terminal: el sistema MUST rechazar cualquier intento posterior de descartarla, trasplantarla o aplicarle un producto químico.
- **FR-006**: El sistema MUST NOT ofrecer ninguna operación de reversión del descarte.
- **FR-007**: El registro de la pérdida MUST conservar la situación en la que estaba la bandeja inmediatamente antes de perderse.
- **FR-008**: El registro de la pérdida MUST conservar el usuario que la registró y datos suficientes para identificarlo aunque esa cuenta cambie o se elimine después.
- **FR-009**: El sistema MUST asumir el momento de la carga como fecha de la pérdida cuando no se indique una, y MUST permitir indicar un día anterior.
- **FR-010**: El sistema MUST rechazar una fecha de pérdida posterior al día de hoy, inexistente en el calendario, o anterior al último hecho conocido de la bandeja.
- **FR-011**: La operación MUST ser atómica sobre el conjunto enviado: si alguna bandeja no es válida, no se descarta ninguna, y el sistema MUST informar cuáles son las conflictivas.
- **FR-012**: El sistema MUST garantizar que dos operaciones simultáneas sobre la misma bandeja no puedan registrar dos pérdidas ni dejarla descartada y trasplantada a la vez.
- **FR-013**: El registro de una pérdida MUST NOT modificar ni eliminar el vínculo de la bandeja con su mesa, sus aplicaciones químicas, su siembra ni sus lotes de origen.
- **FR-014**: Cuando la bandeja perdida estuviera trasplantada, el sistema MUST dejar constancia del evento en el historial de la mesa.
- **FR-015**: La trazabilidad de una cosecha MUST seguir incluyendo las bandejas descartadas que formaron parte del ciclo, indicando su condición de descartadas y el motivo.
- **FR-016**: El sistema MUST permitir consultar las bandejas de una mesa determinada, para poder llegar a la bandeja perdida desde su ubicación física.
- **FR-017**: El sistema MUST permitir listar las bandejas descartadas y MUST mantenerlas fuera de los listados de bandejas disponibles.
- **FR-018**: El sistema MUST exponer el dato de la pérdida al consultar una bandeja descartada individualmente.
- **FR-019**: El sistema MUST ofrecer un listado paginado de pérdidas filtrable por establecimiento, motivo, situación previa y rango de fechas.
- **FR-020**: El sistema MUST impedir el acceso a bandejas y pérdidas de otro cliente en toda operación de lectura y escritura.
- **FR-021**: El sistema MUST registrar en la auditoría cada registro de pérdida, con el usuario, las bandejas alcanzadas y el motivo.
- **FR-022**: El sistema MUST impedir la eliminación de una siembra que tenga bandejas descartadas.
- **FR-023**: Todos los endpoints del módulo MUST requerir un usuario autenticado.

### Key Entities

- **Descarte de bandeja**: la constancia de que una bandeja concreta se perdió. Existe como máximo uno por bandeja y no se modifica ni se elimina. Guarda el motivo, las observaciones, la fecha del incidente, el usuario responsable y la situación en la que estaba la bandeja al perderse.
- **Motivo de descarte**: la causa de la pérdida, tomada de un conjunto cerrado (caída, rotura, contaminación, plaga, mala germinación, error de carga, otro). Es un valor conocido por el sistema, no un texto libre.
- **Bandeja** (existente): incorpora una situación terminal nueva, `descartada`. El resto de sus datos y vínculos no se modifica.
- **Mesa** (existente): su historial incorpora un tipo de evento nuevo para dejar constancia de la bandeja perdida que contenía. La mesa en sí no se modifica.
- **Usuario** (existente): interviene como responsable del registro. El módulo lo referencia, no lo modifica.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operario puede registrar la pérdida de una bandeja en una sola operación, partiendo de la mesa o de la siembra en la que estaba, sin conocer ningún código.
- **SC-002**: Una bandeja descartada no puede ser trasplantada ni recibir aplicaciones químicas, verificado con intentos explícitos sobre los tres estados de origen posibles.
- **SC-003**: El 100% de las pérdidas queda registrado con motivo, fecha, usuario responsable y situación previa, y es recuperable desde el listado de pérdidas y desde la auditoría.
- **SC-004**: Ninguna pérdida registrada altera la trazabilidad ya existente: la trazabilidad de una cosecha devuelve exactamente las mismas bandejas antes y después de descartar una de ellas, con la única diferencia del dato de la pérdida.
- **SC-005**: Dos operaciones simultáneas sobre la misma bandeja dejan el sistema en un estado consistente: una prospera y la otra es rechazada, verificado explícitamente.
- **SC-006**: Registrar la pérdida de 200 bandejas de un mismo incidente se resuelve en una sola operación y en una cantidad de consultas a la base independiente de la cantidad de bandejas.
- **SC-007**: Ninguna consulta ni operación puede alcanzar bandejas o pérdidas de otro cliente, verificado con dos clientes distintos.
- **SC-008**: Un supervisor puede obtener, en una sola consulta, todas las pérdidas de un establecimiento en un período, agrupables por motivo y por etapa del ciclo.

## Assumptions

- Se reutilizan la autenticación, el esquema de roles (`operario`, `supervisor`, `admin_global`) y el aislamiento por cliente ya existentes; el módulo no introduce roles ni mecanismos de acceso nuevos.
- La pérdida es siempre de la bandeja completa. No se registran mermas parciales de plantines dentro de una bandeja: la entidad bandeja no tiene hoy cantidad de plantines y agregarla queda fuera de alcance.
- El descarte es irreversible por decisión explícita del negocio. La constancia de una pérdida vale más que la comodidad de corregir una carga equivocada; el motivo `error_carga` existe para el caso inverso, dar de baja una bandeja que nunca debió existir.
- El conjunto de motivos es cerrado y vive en el sistema. Incorporar un motivo nuevo es un cambio de base de datos, no una pantalla de administración. No se crea un catálogo administrable en esta versión.
- Las bandejas no se identifican por código legible ni escaneable: el operario llega a ellas filtrando por mesa o por siembra. Dotar a las bandejas de un código escaneable queda fuera de alcance.
- El conteo estimado de plantas de una mesa no se recalcula al perderse una bandeja trasplantada. Hoy ese valor es un estimado fijo que nadie recalcula, y esta feature no lo empeora.
- El registro de la pérdida no afecta el stock de los lotes de semilla, sustrato ni vermiculita, porque la siembra tampoco los descuenta hoy.
- El período de carencia de una bandeja descartada se conserva tal cual estaba; la pérdida no lo altera.
- Se asume un volumen de decenas de bandejas por incidente, compatible con una operación que envía la lista completa de identificadores.
- Las pérdidas se conservan indefinidamente; no hay archivado ni purga automática.
