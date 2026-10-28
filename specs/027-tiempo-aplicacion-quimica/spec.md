# Feature Specification: Tiempo de ejecución de la aplicación química

**Feature Branch**: `027-tiempo-aplicacion-quimica`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Agregar a las aplicaciones químicas, tanto de nursery como de greenhouse, la fecha y hora de inicio y la fecha y hora de fin de la aplicación, es decir, el tiempo que le tardó al operario hacerla. Las aplicaciones antiguas no se tienen en cuenta."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El operario registra cuándo empezó y cuándo terminó la aplicación (Priority: P1)

Como operario que aplica un químico en bandejas (nursery) o mesas (greenhouse), quiero que la aplicación quede registrada con el momento en que empecé y el momento en que terminé, para que la empresa sepa cuánto tiempo toma realmente cada aplicación.

**Why this priority**: Es el objetivo del cambio. Hoy una aplicación guarda un único instante (el del registro) y no hay forma de saber cuánto duró el trabajo en campo.

**Independent Test**: Crear una aplicación informando un inicio válido y un fin válido, y verificar que ambos quedan guardados y que la duración resultante es la diferencia entre ellos.

**Acceptance Scenarios**:

1. **Given** un operario con bandejas en nursery, **When** registra una aplicación informando inicio 08:00 y fin 08:45 de hoy, **Then** la aplicación queda con ese inicio y ese fin y se informa una duración de 45 minutos.
2. **Given** un operario con mesas en greenhouse, **When** registra una aplicación informando inicio y fin válidos, **Then** el resultado es el mismo que en nursery: ambos instantes guardados y duración calculada.
3. **Given** un operario que informa solo el inicio, **When** registra la aplicación, **Then** el fin queda igual al momento del registro y la duración es la diferencia entre el inicio y ese momento.
4. **Given** un operario que no informa el inicio, **When** intenta registrar la aplicación, **Then** el registro es rechazado indicando que el inicio es obligatorio y no se crea nada ni se descuenta stock.
5. **Given** una aplicación de más de 200 bandejas o mesas que el operario carga en varios envíos del mismo pedido, **When** cada envío informa el mismo inicio y el mismo fin, **Then** todas las filas del pedido quedan con el mismo inicio y el mismo fin.

---

### User Story 2 - El sistema rechaza horarios imposibles (Priority: P1)

Como responsable de la trazabilidad, quiero que el sistema impida registrar horarios que no pueden haber ocurrido, para que el tiempo de aplicación sea un dato confiable.

**Why this priority**: Un dato de duración con horarios incoherentes es peor que no tenerlo; la validación es parte del valor de la feature.

**Independent Test**: Intentar registrar un fin anterior al inicio, un fin en el futuro, una duración de más de 24 horas y un horario sin hora o sin zona horaria, y verificar que todos son rechazados sin crear nada.

**Acceptance Scenarios**:

1. **Given** una aplicación a registrar, **When** el fin es anterior al inicio, **Then** se rechaza con un error de horario inválido.
2. **Given** una aplicación a registrar, **When** el inicio es igual al fin, **Then** se acepta y la duración es cero.
3. **Given** una aplicación a registrar, **When** el fin está más de 5 minutos en el futuro, **Then** se rechaza; si está dentro de esos 5 minutos (desfase del reloj del dispositivo), se acepta.
4. **Given** una aplicación a registrar, **When** entre el inicio y el fin hay más de 24 horas, **Then** se rechaza con un error de duración excesiva.
5. **Given** una aplicación a registrar, **When** el inicio o el fin vienen sin hora (solo una fecha) o sin zona horaria, **Then** se rechazan por formato inválido.
6. **Given** cualquiera de los rechazos anteriores, **When** se evalúa el sistema, **Then** no se creó ninguna aplicación, no se descontó stock ni se modificó la carencia de ningún target.

---

### User Story 3 - El supervisor corrige el inicio y el fin de una aplicación ya registrada (Priority: P2)

Como supervisor, quiero poder corregir el inicio y el fin de una aplicación (o de todo un pedido agrupado) cuando el operario se equivocó o cargó mal los horarios, para que el historial refleje lo que realmente pasó.

**Why this priority**: Las correcciones ya son parte del flujo actual de aplicaciones; sin esto los horarios mal cargados quedarían para siempre.

**Independent Test**: Corregir el fin de una aplicación existente y verificar que el nuevo fin, la nueva duración y la carencia de los targets quedan actualizados.

**Acceptance Scenarios**:

1. **Given** una aplicación registrada, **When** el supervisor corrige solo el fin, **Then** se valida contra el inicio ya guardado y, si es válido, la aplicación queda con el nuevo fin y la duración recalculada.
2. **Given** una aplicación registrada, **When** el supervisor corrige solo el inicio, **Then** se valida contra el fin ya guardado y la duración se recalcula.
3. **Given** una aplicación registrada, **When** la corrección deja el fin antes del inicio, **Then** se rechaza y la aplicación queda sin cambios.
4. **Given** una aplicación cuyo fin cambia, **When** se guarda la corrección, **Then** la carencia de todos los targets afectados se recalcula a partir del nuevo fin.
5. **Given** un pedido agrupado de varias filas, **When** el supervisor corrige el inicio y/o el fin a nivel grupo, **Then** el nuevo valor se aplica a todas las filas creadas o actualizadas en esa corrección.
6. **Given** un pedido agrupado, **When** la corrección agrega una fila nueva sin informar inicio ni fin, **Then** la fila nueva toma el inicio y el fin del resto del grupo.
7. **Given** un operario (sin rol de supervisor), **When** intenta corregir horarios, **Then** se le deniega, igual que hoy con cualquier otra corrección.

---

### User Story 4 - La carencia se cuenta desde que terminó la aplicación (Priority: P2)

Como responsable de calidad, quiero que el período de carencia de un químico empiece cuando la aplicación terminó, para que la fecha hasta la cual un target no se puede cosechar sea la correcta y conservadora.

**Why this priority**: Con un fin explícito, tomarlo como referencia es lo correcto y evita que una aplicación larga acorte la carencia real.

**Independent Test**: Registrar una aplicación con inicio y fin en días distintos y verificar que la carencia se calcula sumando los días de carencia al fin.

**Acceptance Scenarios**:

1. **Given** un químico con 3 días de carencia, **When** se registra una aplicación que termina el día 10, **Then** el target queda en carencia hasta el día 13, sin importar cuándo empezó.
2. **Given** una aplicación que termina cerca de la medianoche, **When** se calcula la carencia, **Then** el día resultante es el mismo en el cálculo de la aplicación y en el de la trazabilidad (no hay discrepancias entre ambos por zona horaria).
3. **Given** una mesa con la carencia calculada desde el fin, **When** se consulta la trazabilidad de su cosecha, **Then** la alerta de carencia incumplida usa ese mismo fin.

---

### User Story 5 - Quien consulta ve el inicio, el fin y la duración en todas las vistas (Priority: P2)

Como supervisor o auditor, quiero ver el inicio, el fin y la duración de cada aplicación en los listados, en el detalle, en las aplicaciones de una mesa o bandeja, y en la trazabilidad de una cosecha, para analizar el trabajo sin tener que cruzar datos.

**Why this priority**: El dato solo tiene valor si se puede consultar donde ya se consultan las aplicaciones.

**Independent Test**: Consultar una aplicación nueva por cada una de las vistas y verificar que inicio, fin y duración aparecen y coinciden.

**Acceptance Scenarios**:

1. **Given** una aplicación nueva, **When** se la consulta en el listado, en el detalle, en las aplicaciones de su mesa o bandeja y en la trazabilidad, **Then** en todas aparecen el mismo inicio, el mismo fin y la misma duración en segundos.
2. **Given** una aplicación antigua (anterior a esta feature), **When** se la consulta, **Then** inicio, fin y duración aparecen vacíos, sin error, y el resto de sus datos se muestran como siempre.
3. **Given** el listado de aplicaciones, **When** se ordena por inicio, **Then** las aplicaciones quedan ordenadas por su inicio; el orden por defecto sigue siendo el actual.
4. **Given** una aplicación en greenhouse, **When** se consulta el historial de la mesa, **Then** los eventos de aplicación química y de carencia asociados muestran el inicio y el fin de esa aplicación.

---

### Edge Cases

- Aplicaciones antiguas: se conservan tal cual, sin inicio, fin ni duración. No se inventan valores ni se intenta estimarlos.
- Un operario con el reloj del dispositivo adelantado hasta 5 minutos puede registrar sin error; más de eso es rechazado.
- Corrección que deja un solo extremo informado: se valida contra el extremo ya guardado; si la aplicación es antigua y no tiene el otro extremo, el supervisor debe informar ambos.
- Corrección de una aplicación antigua (sin inicio/fin) donde se informa ambos: queda completa y pasa a comportarse como una aplicación nueva.
- El campo de fecha única que existía antes deja de poder corregirse por separado: ahora se corrige únicamente mediante inicio y fin.
- Pedido agrupado cuyas filas ya existentes tienen distinto inicio/fin (por correcciones individuales previas): una fila nueva sin horarios toma los del grupo de forma determinística, usando la primera fila del grupo en orden de creación.
- Pedido agrupado en que ninguna fila existente tiene horarios (todas antiguas) y se agrega una fila nueva sin informar inicio ni fin: se rechaza indicando que hay que informarlos; el sistema no inventa valores.
- Aplicaciones registradas con un cliente (app del operario) todavía no actualizado: son rechazadas por falta de inicio hasta que el cliente se actualice; es un efecto esperado del despliegue coordinado.
- La duración máxima de 24 horas se mide entre inicio y fin; una aplicación que cruza la medianoche es válida mientras no supere ese límite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda aplicación química nueva, de nursery o de greenhouse, MUST guardar un momento de inicio y un momento de fin.
- **FR-002**: Al crear una aplicación, el inicio MUST ser obligatorio. El fin MUST ser opcional y, si no se informa, MUST tomar el momento del registro.
- **FR-003**: El momento de fin MUST ser el momento de referencia de la aplicación: el que determina su orden cronológico por defecto, los filtros por fecha, su pertenencia al ciclo de una cosecha en la trazabilidad y la fecha de los eventos que genera en el historial de la mesa.
- **FR-004**: El sistema MUST rechazar un fin anterior al inicio; un inicio igual al fin MUST aceptarse.
- **FR-005**: El sistema MUST rechazar un fin que esté más de 5 minutos en el futuro respecto del momento del registro.
- **FR-006**: El sistema MUST rechazar una aplicación cuya duración (fin menos inicio) supere las 24 horas.
- **FR-007**: El sistema MUST exigir que inicio y fin incluyan fecha, hora y zona horaria; un valor con solo fecha o sin zona horaria MUST rechazarse como formato inválido.
- **FR-008**: Cuando una validación de horarios falla, el sistema MUST NO crear ni modificar nada: ni la aplicación, ni el stock de los lotes, ni la carencia de los targets, ni el historial.
- **FR-009**: Los supervisores y administradores globales MUST poder corregir el inicio y el fin de una aplicación existente, juntos o por separado. Cuando se envía solo uno, el sistema MUST validarlo contra el otro valor ya guardado.
- **FR-010**: La corrección de una aplicación y la corrección de un pedido agrupado MUST aceptar inicio y fin y MUST dejar de aceptar el campo de fecha única anterior.
- **FR-011**: En la corrección de un pedido agrupado, inicio y fin MUST ser valores de nivel grupo que se aplican a toda fila creada o actualizada en esa corrección, y MUST NO afectar a filas borradas ni a filas del grupo no incluidas.
- **FR-012**: En la corrección de un pedido agrupado, una fila nueva para la que no se informe inicio o fin MUST tomar los valores de la primera fila del grupo (por orden de creación).
- **FR-013**: Cuando varios envíos de un mismo pedido grande informan el mismo inicio y fin, todas las filas resultantes MUST quedar con esos valores.
- **FR-014**: La carencia de bandejas y mesas MUST calcularse sumando los días de carencia del químico al momento de fin de la aplicación.
- **FR-015**: El cálculo del día de fin de carencia MUST ser idéntico en el registro/corrección de aplicaciones y en la trazabilidad, independientemente de la zona horaria del servidor.
- **FR-016**: Cualquier cambio de inicio o de fin MUST recalcular la carencia de todos los targets afectados, considerando el historial completo de aplicaciones de cada uno.
- **FR-017**: Toda consulta de aplicaciones (listado, detalle, aplicaciones por mesa, aplicaciones por bandeja y trazabilidad de cosecha) MUST devolver inicio, fin y duración en segundos.
- **FR-018**: La duración MUST calcularse a partir de inicio y fin en el momento de la consulta; no se guarda como dato propio.
- **FR-019**: Para aplicaciones antiguas, inicio, fin y duración MUST devolverse vacíos sin que ninguna consulta ni operación falle.
- **FR-020**: El listado de aplicaciones MUST permitir ordenar por inicio, además de los criterios actuales.
- **FR-021**: En greenhouse, los eventos del historial de mesa de tipo aplicación química y en carencia MUST incluir el inicio y el fin de la aplicación.
- **FR-022**: El sistema MUST garantizar a nivel de datos que, para aplicaciones con fin informado, el momento de referencia y el fin son siempre el mismo valor.
- **FR-023**: Las aplicaciones antiguas MUST NOT ser modificadas ni completadas automáticamente por este cambio.
- **FR-024**: Las operaciones de creación y corrección MUST seguir registrándose en la auditoría como hoy, y las restricciones de rol existentes MUST mantenerse (operarios, supervisores y administradores globales crean; solo supervisores y administradores globales corrigen).
- **FR-025**: Se MUST documentar para el equipo de frontend el cambio de contrato: campos nuevos obligatorios/opcionales, reemplazo del campo de fecha única en las correcciones y nuevos errores de validación.

### Key Entities *(include if feature involves data)*

- **Aplicación química**: registro de una aplicación de uno o más químicos sobre bandejas (nursery) o mesas (greenhouse). Gana dos atributos: momento de inicio y momento de fin. El momento de fin coincide siempre con su momento de referencia existente. La duración es derivada.
- **Pedido agrupado (operation group)**: conjunto de filas de aplicación originadas por una misma acción del operario; comparten inicio y fin.
- **Target (bandeja o mesa)**: recibe la aplicación y tiene una fecha de fin de carencia calculada a partir del fin de la aplicación.
- **Evento de historial de mesa**: registro de lo ocurrido a una mesa; los de aplicación química y carencia incorporan inicio y fin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las aplicaciones registradas después del despliegue tienen inicio y fin guardados y una duración consultable.
- **SC-002**: El 100 % de los horarios inválidos (fin anterior al inicio, fin futuro más allá de la tolerancia, duración mayor a 24 h, formato sin hora o zona) son rechazados sin efectos secundarios en stock, carencia ni historial.
- **SC-003**: La duración informada de una aplicación coincide exactamente (al segundo) con la diferencia entre su fin y su inicio en todas las vistas donde se consulta.
- **SC-004**: La fecha de fin de carencia de un target es siempre igual a la fecha de fin de la aplicación más los días de carencia, y es la misma en el registro y en la trazabilidad, incluso para aplicaciones que terminan entre las 20:00 y las 24:00 hora local.
- **SC-005**: Consultar o ordenar aplicaciones antiguas sigue funcionando sin errores y sin cambios de resultado respecto a hoy.
- **SC-006**: Un supervisor puede corregir inicio y fin de una aplicación o de un pedido agrupado completo en una sola operación, y la carencia de todos los targets afectados queda recalculada al terminar.

## Assumptions

- Quien registra la aplicación es el operario desde la app; la app captura el inicio (al comenzar) y el fin (al terminar) y los envía al registrar. También es válido cargarlos a mano si se registra de forma diferida.
- Las aplicaciones antiguas no se completan ni se estiman; quedan sin inicio, fin ni duración. Esto fue aceptado explícitamente.
- La carencia se mide desde el fin de la aplicación (criterio conservador): el período de espera empieza cuando se terminó de aplicar el último producto.
- El despliegue del backend y el de la app se coordinan: mientras la app no se actualice, no podrá registrar aplicaciones nuevas porque el inicio es obligatorio.
- Una aplicación registrada de forma retroactiva es válida mientras su fin no esté en el futuro; no se valida contra fechas de siembra, trasplante ni ingreso del target.
- No se pide por ahora ningún reporte agregado (promedios por operario, túnel, etc.); la duración solo se consulta junto a cada aplicación.
- Se mantienen los roles, la auditoría y el aislamiento por tenant ya existentes; la feature no cambia quién puede ver o crear aplicaciones.
- La zona horaria de visualización es responsabilidad de la app; el sistema trabaja con instantes absolutos.
