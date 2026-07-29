# Feature Specification: Fecha de entrada a nursery retroactiva

**Feature Branch**: `018-fecha-entrada-nursery-retroactiva`

**Created**: 2026-07-29

**Status**: Draft

**Input**: User description: "Cuando se hacen movimientos desde cooling period a nursery, necesito que me permita agregar una opción al hacer ese movimiento para registrar fecha actual o fecha pasada."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El operario registra un ingreso a nursery que ocurrió días atrás (Priority: P1)

Como operario que administra el vivero, quiero poder indicar la fecha en la que las bandejas realmente salieron del período de enfriado y entraron a nursery, para que el registro refleje lo que pasó en el campo aunque la carga en el sistema se haga después (al final de la jornada, al día siguiente, o al recuperar semanas de trabajo cargadas en papel).

**Why this priority**: Es el objetivo del cambio. Hoy el sistema fuerza la fecha del momento de la carga, así que cualquier registro diferido queda con una fecha falsa y no hay forma de corregirlo.

**Independent Test**: Mover una siembra de cooling a nursery informando una fecha pasada válida y verificar que todas sus bandejas quedan con esa fecha de entrada, no con la del momento de la carga.

**Acceptance Scenarios**:

1. **Given** una siembra con fecha 2026-07-01 y todas sus bandejas en período de enfriado, **When** se registra el ingreso a nursery informando la fecha 2026-07-20, **Then** todas esas bandejas quedan en estado nursery con fecha de entrada 2026-07-20 y la operación se registra en la auditoría con la fecha informada.
2. **Given** la misma siembra, **When** se registra el ingreso a nursery informando la fecha de hoy, **Then** las bandejas quedan con la fecha y hora exactas del momento del registro (no un horario artificial del día).
3. **Given** una siembra con bandejas en período de enfriado, **When** se registra el ingreso a nursery sin informar ninguna fecha, **Then** el comportamiento es idéntico al actual: se usa la fecha y hora del momento del registro.
4. **Given** una siembra con 40 bandejas en período de enfriado, **When** se registra el ingreso con una fecha pasada, **Then** las 40 bandejas reciben exactamente la misma fecha de entrada.

---

### User Story 2 - El sistema rechaza fechas imposibles (Priority: P1)

Como responsable de la trazabilidad, quiero que el sistema impida registrar fechas de entrada a nursery que no pueden haber ocurrido, para que el historial del vivero no acumule datos incoherentes que después nadie pueda interpretar.

**Why this priority**: Va junto con la historia 1 y es igual de crítica: abrir la fecha sin límites permitiría registrar ingresos en el futuro o anteriores a la propia siembra, lo que rompería el orden cronológico del ciclo de la bandeja.

**Independent Test**: Intentar registrar el ingreso con una fecha futura y con una fecha anterior a la de la siembra, y verificar que ambos casos son rechazados sin modificar ninguna bandeja.

**Acceptance Scenarios**:

1. **Given** una siembra con bandejas en período de enfriado, **When** se informa una fecha de entrada posterior a hoy, **Then** la operación es rechazada con un error de fecha inválida y ninguna bandeja cambia de estado.
2. **Given** una siembra con fecha 2026-07-15, **When** se informa una fecha de entrada 2026-07-10 (anterior a la siembra), **Then** la operación es rechazada con un error de fecha inválida y ninguna bandeja cambia de estado.
3. **Given** una siembra con fecha 2026-07-15, **When** se informa exactamente la fecha 2026-07-15 como entrada a nursery, **Then** la operación es aceptada (el mismo día de la siembra es válido).
4. **Given** cualquier siembra, **When** se informa una fecha con formato inválido (por ejemplo texto libre o una fecha inexistente), **Then** la operación es rechazada por validación y ninguna bandeja cambia de estado.

---

### User Story 3 - Las bandejas ya movidas no se pueden re-fechar (Priority: P2)

Como supervisor, quiero que este registro solo aplique a bandejas que todavía están en período de enfriado, para que nadie pueda reescribir la fecha de entrada de bandejas que ya están en nursery o que ya fueron trasplantadas.

**Why this priority**: Protege la integridad de lo ya registrado. Es el comportamiento actual y debe conservarse tal cual al abrir el campo de fecha.

**Independent Test**: Ejecutar el registro dos veces sobre la misma siembra con fechas distintas y verificar que el segundo intento no modifica nada.

**Acceptance Scenarios**:

1. **Given** una siembra cuyas bandejas ya pasaron a nursery, **When** se vuelve a registrar el ingreso informando otra fecha, **Then** la operación es rechazada porque no hay bandejas en período de enfriado y ninguna fecha existente se modifica.
2. **Given** una siembra con parte de sus bandejas ya trasplantadas y ninguna en período de enfriado, **When** se registra el ingreso con fecha informada, **Then** la operación es rechazada y las fechas de las bandejas trasplantadas quedan intactas.

---

### Edge Cases

- **Fecha del día actual**: se registra con la hora real del momento, para no dejar un registro con hora futura cuando la carga ocurre temprano en el día.
- **Fecha pasada**: se registra en un punto horario del día informado que garantiza que el día calendario se lea igual en cualquier zona horaria de América, evitando que el sistema muestre el día anterior al elegido.
- **Sin límite de antigüedad**: cualquier fecha pasada válida (dentro del rango permitido por la fecha de siembra) se acepta, sin importar cuántos meses atrás sea.
- **Siembra con fecha retroactiva**: la fecha de siembra ya puede cargarse hacia atrás; el límite inferior es esa fecha declarada, no el momento en que la siembra se cargó en el sistema.
- **Sin bandejas en período de enfriado**: el rechazo actual se mantiene, se haya informado fecha o no.
- **Siembra inexistente o de otro tenant**: se mantiene el rechazo actual por recurso no encontrado, sin filtrar información entre tenants.
- **Operación atómica**: si la fecha es inválida no se mueve ninguna bandeja; el registro es todo o nada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El registro del movimiento de período de enfriado a nursery MUST aceptar de forma **opcional** una fecha de entrada informada por el usuario, expresada como día calendario (sin hora).
- **FR-002**: Cuando no se informa fecha, el sistema MUST comportarse exactamente como hoy: registra la fecha y hora del momento del movimiento. El cambio no rompe a ningún cliente existente.
- **FR-003**: Cuando la fecha informada corresponde a un día pasado, el sistema MUST registrarla de modo que el día calendario se preserve para cualquier usuario de la región (sin desplazarse al día anterior o siguiente por diferencias horarias).
- **FR-004**: Cuando la fecha informada corresponde al día de hoy, el sistema MUST registrar el instante real del movimiento en lugar de un horario fijo del día, evitando dejar registrado un momento futuro.
- **FR-005**: El sistema MUST rechazar toda fecha de entrada posterior al día actual, sin aplicar ningún cambio de estado.
- **FR-006**: El sistema MUST rechazar toda fecha de entrada anterior a la fecha declarada de la siembra, comparando a nivel de día calendario. La fecha de entrada igual a la de la siembra es válida.
- **FR-007**: Los rechazos de FR-005 y FR-006 MUST usar un código de error propio y distinguible del resto de los errores del flujo, para que el cliente pueda mostrar un mensaje específico.
- **FR-008**: El sistema MUST NOT imponer un límite máximo de antigüedad para la fecha informada.
- **FR-009**: Todas las bandejas de la siembra que estén en período de enfriado MUST recibir la misma fecha de entrada en la misma operación (comportamiento todo o nada, sin selección por bandeja).
- **FR-010**: El sistema MUST seguir aplicando el movimiento únicamente a bandejas en período de enfriado, dejando intactas las que ya están en nursery o trasplantadas, y MUST mantener el rechazo actual cuando no hay ninguna bandeja en período de enfriado.
- **FR-011**: Los permisos MUST permanecer sin cambios: los mismos roles que hoy pueden ejecutar el movimiento pueden informar una fecha pasada.
- **FR-012**: El registro de auditoría existente para esta operación MUST incluir la fecha informada por el usuario, de modo que quede rastro de qué se pidió en cada movimiento.
- **FR-013**: La forma de las respuestas de todos los endpoints de lectura de siembras y bandejas MUST permanecer sin cambios: no se agregan, renombran ni eliminan campos.
- **FR-014**: El movimiento MUST seguir siendo atómico: ante cualquier rechazo, ninguna bandeja queda modificada.
- **FR-015**: El movimiento MUST aplicarse únicamente a bandejas del tenant de la solicitud y que no estén eliminadas.

### Key Entities

- **Siembra**: agrupa a las bandejas y aporta la fecha declarada que actúa como límite inferior de la fecha de entrada. Sin cambios de estructura.
- **Bandeja**: pasa de período de enfriado a nursery y guarda la fecha de entrada. La estructura no cambia; solo cambia el origen posible del valor de esa fecha.
- **Registro de auditoría**: la entrada existente del movimiento suma la fecha informada como parte de su contenido descriptivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los movimientos con fecha informada válida quedan registrados con esa fecha, verificable consultando las bandejas después del movimiento.
- **SC-002**: El 100% de los movimientos sin fecha informada mantienen el comportamiento previo (fecha y hora del momento del registro).
- **SC-003**: El 100% de los intentos con fecha futura o anterior a la siembra son rechazados sin modificar ninguna bandeja.
- **SC-004**: La fecha registrada se lee como el mismo día calendario que eligió el usuario en el 100% de los casos, sin corrimientos de un día.
- **SC-005**: Cero regresiones: los clientes que no envían fecha siguen funcionando sin ningún cambio, y las respuestas de lectura conservan la misma forma.
- **SC-006**: Toda operación de movimiento queda auditada con la fecha informada, permitiendo reconstruir después qué se cargó de forma retroactiva.

## Assumptions

- El usuario elige un día en un selector de fecha; no se le pide la hora del ingreso. Registrar el día es suficiente para el negocio.
- El proyecto no maneja zonas horarias por establecimiento, por lo que el día informado se ancla a un punto horario que preserva el día calendario en toda América (mediodía UTC). Si en el futuro se agrega manejo de zonas horarias, este anclaje puede revisarse sin migrar datos.
- El límite inferior es la fecha declarada de la siembra, que hoy ya puede cargarse retroactivamente por el usuario. No se usa el momento de creación del registro.
- La fecha de entrada a nursery hoy solo se muestra en el detalle de la siembra y se usa como criterio de ordenamiento en el listado de bandejas; ningún otro proceso del sistema (trazabilidad, cosecha, packing, aplicaciones químicas) la consume, por lo que abrir su origen no impacta otros flujos.
- No existe historial de eventos por bandeja (solo lo hay para mesas), así que la auditoría de la operación es el único rastro del movimiento y por eso debe incluir la fecha informada.
- El frontend puede desplegarse antes o después del backend indistintamente, porque el campo es opcional.

## Out of Scope

- Corregir o editar la fecha de entrada de bandejas que ya pasaron a nursery.
- Mover a nursery solo un subconjunto de las bandejas de una siembra.
- Informar fecha retroactiva en el trasplante (nursery → mesa), que sigue usando el momento real del registro.
- Agregar cualquier campo, columna o indicador que distinga si la fecha fue automática o informada manualmente.
- Cambios en los endpoints de lectura de siembras y bandejas.
- Límites de antigüedad, aprobaciones o permisos diferenciados para la carga retroactiva.
