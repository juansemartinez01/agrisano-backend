# Feature Specification: Lotes de vermiculita con grado

**Feature Branch**: `020-lote-vermiculita`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "lo que me solicitaron es agregar otro lote, igual al de sustrato, pero de vermiculita. Debería seguir exactamente el mismo camino que los lotes de sustrato, pero para vermiculita, y además, el lote de vermiculita tendría exactamente los mismos datos que el lote de sustrato, PERO se le agregaría un dato más que es el 'grado', que es un seleccionable con los valores 1, 2 o 3."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar lotes de vermiculita con su grado (Priority: P1)

Como supervisor que da de alta los insumos que entran al depósito, quiero registrar lotes de vermiculita con los mismos datos que ya cargo para el sustrato más el grado de la partida, para tener la vermiculita bajo el mismo control de trazabilidad que el resto de los insumos.

**Why this priority**: Es la base de todo lo demás. Sin poder registrar el lote no hay nada que asociar a una siembra ni que reportar en la trazabilidad.

**Independent Test**: Registrar un lote de vermiculita indicando su grado, consultarlo en el listado general y verificar que aparece con el grado que se cargó, sin haber alterado en nada los lotes de semilla y sustrato existentes.

**Acceptance Scenarios**:

1. **Given** el depósito recibe una partida de vermiculita, **When** un supervisor la registra indicando número de lote, proveedor y grado, **Then** el lote queda registrado como vermiculita, disponible para su uso, y consultable en el listado de lotes.
2. **Given** un intento de registrar un lote de vermiculita sin indicar el grado, **When** se envía el alta, **Then** la operación se rechaza informando que el grado es obligatorio para este tipo de lote.
3. **Given** un intento de registrar un lote de semilla o de sustrato indicando un grado, **When** se envía el alta, **Then** la operación se rechaza informando que el grado solo aplica a los lotes de vermiculita.
4. **Given** un intento de registrar un lote de vermiculita indicando producto, variedad o semillero, **When** se envía el alta, **Then** la operación se rechaza informando que esos datos solo aplican a los lotes de semilla, igual que ya ocurre hoy con los lotes de sustrato.
5. **Given** un lote de vermiculita registrado con un grado equivocado, **When** un supervisor corrige el grado, **Then** el lote queda con el grado corregido.
6. **Given** ya existe un lote de semilla y uno de sustrato con el número "L-001", **When** se registra un lote de vermiculita con el mismo número "L-001", **Then** el alta se acepta, porque la numeración es independiente por tipo de lote.
7. **Given** un lote de vermiculita registrado, **When** un operario lo marca como consumido o un supervisor lo rehabilita, **Then** se comporta exactamente igual que un lote de semilla o sustrato, sin ninguna diferencia de permisos ni de registro.

---

### User Story 2 - Usar un lote de vermiculita al registrar una siembra (Priority: P1)

Como operario que registra una siembra, quiero indicar qué lote de vermiculita se usó en cada grupo de bandejas, además de los lotes de semilla y sustrato que ya indico hoy, para que quede asentado con qué partida de vermiculita se cubrió cada bandeja.

**Why this priority**: Es el corazón del pedido. Sin este vínculo, el lote de vermiculita queda huérfano: se registraría y se consumiría, pero no habría forma de saber qué se sembró con él.

**Independent Test**: Registrar una siembra indicando un lote de vermiculita, consultar el detalle de la siembra y verificar que cada bandeja quedó asociada a ese lote; luego registrar otra siembra sin indicarlo y verificar que también se acepta.

**Acceptance Scenarios**:

1. **Given** un lote de vermiculita disponible, **When** un operario registra una siembra indicándolo junto con los lotes de semilla y sustrato, **Then** la siembra se registra y cada bandeja generada queda asociada a los tres lotes.
2. **Given** una siembra que no usa vermiculita, **When** se registra sin indicar ningún lote de vermiculita, **Then** la siembra se registra normalmente y sus bandejas quedan sin lote de vermiculita asociado.
3. **Given** un lote de semilla indicado en el lugar del lote de vermiculita, **When** se intenta registrar la siembra, **Then** la operación se rechaza informando que el lote indicado no es de tipo vermiculita.
4. **Given** un lote de vermiculita marcado como consumido, **When** se intenta registrar una siembra que lo usa, **Then** la operación se rechaza sin crear ninguna bandeja, con el mismo criterio que ya rige para semilla y sustrato.
5. **Given** un lote de vermiculita dado de baja administrativamente, **When** se intenta registrar una siembra que lo usa, **Then** la operación también se rechaza.
6. **Given** un lote de vermiculita asignado a otro establecimiento, **When** se intenta usarlo en una siembra de un establecimiento distinto, **Then** la operación se rechaza, con el mismo criterio que ya rige para semilla y sustrato.
7. **Given** una siembra donde los lotes de semilla y sustrato están disponibles pero el de vermiculita no, **When** se intenta registrarla, **Then** el rechazo identifica específicamente que el problema está en el lote de vermiculita.

---

### User Story 3 - Ver la vermiculita y su grado en los reportes de trazabilidad (Priority: P2)

Como responsable de calidad que responde una auditoría, quiero que los reportes de trazabilidad muestren qué lote de vermiculita y qué grado se usó en cada bandeja del ciclo, para poder responder con qué partida exacta se produjo un lote cosechado sin tener que consultar el dato aparte.

**Why this priority**: El sistema es correcto sin esto (el vínculo ya quedó registrado por la historia 2), pero es lo que le da valor real al registro: un dato que no se puede consultar en el reporte de auditoría obliga a un rastreo manual.

**Independent Test**: Registrar una siembra con vermiculita, avanzar el ciclo hasta una cosecha, pedir la trazabilidad de esa cosecha y verificar que el lote de vermiculita aparece con su grado; repetir con una siembra sin vermiculita y verificar que se indica claramente su ausencia.

**Acceptance Scenarios**:

1. **Given** una cosecha cuyo ciclo usó vermiculita, **When** se consulta su trazabilidad, **Then** cada bandeja del ciclo muestra el lote de vermiculita utilizado junto con su grado.
2. **Given** una cosecha cuyo ciclo no usó vermiculita, **When** se consulta su trazabilidad, **Then** cada bandeja indica explícitamente que no hubo lote de vermiculita, sin que el reporte falle ni omita la bandeja.
3. **Given** una siembra registrada con vermiculita, **When** se consulta el detalle de la siembra, **Then** cada bandeja muestra el lote de vermiculita y su grado, además de los lotes de semilla y sustrato que ya muestra hoy.
4. **Given** una aplicación química registrada sobre bandejas que usaron vermiculita, **When** se consulta el registro enriquecido de esa aplicación, **Then** el lote de vermiculita aparece con el mismo criterio con el que ya aparecen los lotes de semilla y sustrato.

---

### User Story 4 - Rastrear todas las bandejas que usaron una partida de vermiculita (Priority: P3)

Como responsable de calidad ante un problema con una partida de vermiculita, quiero listar todas las bandejas que la usaron, para poder acotar el alcance del problema sin revisar siembra por siembra.

**Why this priority**: Es la capacidad que convierte el registro en una herramienta de reacción ante un incidente, pero no es necesaria para la operación diaria ni para que el resto de la funcionalidad sea correcta.

**Independent Test**: Registrar dos siembras con lotes de vermiculita distintos, pedir el listado de bandejas filtrando por uno de esos lotes, y verificar que devuelve únicamente las bandejas de la siembra correspondiente.

**Acceptance Scenarios**:

1. **Given** varias siembras registradas con distintos lotes de vermiculita, **When** se pide el listado de bandejas filtrando por un lote de vermiculita, **Then** se devuelven únicamente las bandejas asociadas a ese lote.
2. **Given** un lote de vermiculita que nunca se usó, **When** se pide el listado de bandejas filtrando por él, **Then** se devuelve un listado vacío sin error.

---

### Edge Cases

- **Bandejas anteriores al cambio**: todas las bandejas registradas antes de esta funcionalidad quedan sin lote de vermiculita y así deben permanecer; no se les asigna ningún lote inventado ni se las marca como incompletas.
- **Clientes que no conocen la vermiculita**: una aplicación cliente que todavía no fue actualizada debe poder seguir registrando siembras exactamente como hasta ahora, sin indicar vermiculita y sin recibir ningún error nuevo.
- **Listados mixtos**: los listados generales de lotes, que hasta ahora solo podían contener semilla y sustrato, pasan a incluir también vermiculita; cualquier consumidor que asuma que solo existen dos tipos mostrará la información de forma incorrecta y debe adaptarse.
- **Corrección del grado de un lote ya usado**: corregir el grado de un lote que ya fue usado en siembras cambia lo que informan los reportes de trazabilidad de esas siembras. Se acepta este comportamiento por ser el mismo que ya rige hoy al corregir el producto o la variedad de un lote de semilla.
- **Eliminación de un lote ya usado**: intentar eliminar un lote de vermiculita que ya fue usado en alguna bandeja debe rechazarse, igual que ocurre hoy con los lotes de semilla y sustrato.
- **Vínculo inmutable**: una vez registrada la siembra, no se puede cambiar ni quitar el lote de vermiculita de sus bandejas, del mismo modo que hoy no se pueden cambiar los lotes de semilla y sustrato.
- **Grado fuera de rango**: indicar un grado distinto de 1, 2 o 3 se rechaza como valor inválido.

## Requirements *(mandatory)*

### Functional Requirements

#### Catálogo de lotes

- **FR-001**: El sistema MUST admitir un tercer tipo de lote, vermiculita, además de los tipos semilla y sustrato ya existentes.
- **FR-002**: Un lote de vermiculita MUST admitir exactamente el mismo conjunto de datos que un lote de sustrato.
- **FR-003**: El sistema MUST registrar para cada lote de vermiculita un grado, elegible entre tres valores fijos: 1, 2 o 3.
- **FR-004**: El grado MUST ser obligatorio al registrar un lote de vermiculita.
- **FR-005**: El sistema MUST rechazar el grado cuando se informa en un lote de semilla o de sustrato.
- **FR-006**: El sistema MUST rechazar en un lote de vermiculita los datos exclusivos de los lotes de semilla (producto, variedad y semillero), con el mismo criterio que ya aplica a los lotes de sustrato.
- **FR-007**: El sistema MUST permitir corregir el grado de un lote de vermiculita ya registrado, mediante la edición general del lote.
- **FR-008**: El tipo de un lote MUST seguir siendo inmutable: ningún lote existente puede convertirse en vermiculita ni dejar de serlo.
- **FR-009**: La numeración de los lotes de vermiculita MUST ser independiente de la de semilla y sustrato: un mismo número puede existir una vez por cada tipo, pero no repetirse dentro del mismo tipo.
- **FR-010**: El sistema MUST permitir filtrar el listado de lotes por tipo vermiculita y por grado.
- **FR-011**: Los lotes de vermiculita MUST comportarse igual que los de semilla y sustrato en cuanto a baja administrativa, marcado como consumido, reversión del consumo, permisos por rol, registro de auditoría y eliminación, sin ninguna regla diferenciada.

#### Registro de siembras

- **FR-012**: El sistema MUST permitir asociar opcionalmente un lote de vermiculita a cada grupo de bandejas de una siembra.
- **FR-013**: Registrar una siembra sin indicar lote de vermiculita MUST seguir siendo válido, y las bandejas resultantes MUST quedar sin lote de vermiculita asociado.
- **FR-014**: Cuando se indique un lote de vermiculita, el sistema MUST verificar que sea de tipo vermiculita, que esté simultáneamente habilitado y activo, y que pertenezca al establecimiento de la siembra, aplicando las mismas reglas que ya rigen para semilla y sustrato.
- **FR-015**: El rechazo por FR-014 MUST identificar que el lote problemático es el de vermiculita y por cuál de las razones, distinguiéndolo de los rechazos por los lotes de semilla o sustrato.
- **FR-016**: El vínculo entre una bandeja y su lote de vermiculita MUST ser inmutable una vez registrada la siembra.
- **FR-017**: El sistema MUST rechazar la eliminación de un lote de vermiculita que ya haya sido usado en alguna bandeja, con el mismo criterio que ya aplica a los lotes de semilla y sustrato.

#### Consulta y reportes

- **FR-018**: El detalle de una siembra MUST exponer, para cada bandeja, el lote de vermiculita utilizado junto con su grado, o indicar explícitamente su ausencia.
- **FR-019**: El reporte de trazabilidad de una cosecha MUST exponer, para cada bandeja del ciclo, el lote de vermiculita utilizado junto con su grado, o indicar explícitamente su ausencia.
- **FR-020**: Los registros enriquecidos de aplicaciones químicas MUST exponer el lote de vermiculita con el mismo criterio con el que ya exponen los lotes de semilla y sustrato.
- **FR-021**: El sistema MUST permitir listar las bandejas asociadas a un lote de vermiculita determinado.

#### Compatibilidad

- **FR-022**: Las siembras y bandejas registradas antes de este cambio MUST permanecer válidas y consultables, informando que no tienen lote de vermiculita asociado.
- **FR-023**: Los clientes existentes MUST poder seguir registrando siembras sin ninguna modificación, sin indicar lote de vermiculita y sin recibir errores nuevos.
- **FR-024**: Los listados y reportes existentes MUST seguir informando los lotes de semilla y sustrato exactamente como lo hacen hoy.
- **FR-025**: Este cambio MUST NOT alterar el comportamiento de los módulos de trasplante, cosecha, packing, mesas, túneles, ni el de los lotes de químicos.

### Key Entities

- **Lote**: entidad ya existente que hasta ahora representaba lotes de semilla y de sustrato. Suma un tercer tipo, vermiculita, y un grado que solo aplica a ese tipo.
- **Bandeja**: entidad ya existente que hoy registra el lote de semilla y el lote de sustrato con los que fue armada. Suma una referencia opcional al lote de vermiculita utilizado.
- **Siembra**: entidad ya existente; es el único punto de escritura donde se elige el lote de vermiculita, igual que ocurre con los otros dos lotes.
- **Reporte de trazabilidad**: reporte ya existente; suma el lote de vermiculita y su grado al linaje que informa por cada bandeja.
- **Registro de aplicación química enriquecido**: consulta ya existente que informa los lotes asociados a las bandejas alcanzadas; suma el lote de vermiculita.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los lotes de vermiculita registrados quedan con un grado entre 1 y 3, sin excepciones ni valores vacíos.
- **SC-002**: El 100% de los intentos de registrar un grado en un lote de semilla o sustrato son rechazados.
- **SC-003**: El 100% de los intentos de registrar datos de semilla (producto, variedad o semillero) en un lote de vermiculita son rechazados.
- **SC-004**: El 100% de las siembras registradas indicando un lote de vermiculita dejan ese lote asociado a todas las bandejas generadas.
- **SC-005**: El 100% de los intentos de registrar una siembra con un lote de vermiculita no disponible, de tipo incorrecto o de otro establecimiento son rechazados sin crear ninguna bandeja.
- **SC-006**: El 100% de las consultas de trazabilidad de ciclos que usaron vermiculita informan el lote y su grado.
- **SC-007**: El 100% de las consultas de trazabilidad de ciclos anteriores a este cambio se responden correctamente indicando la ausencia de vermiculita, sin errores.
- **SC-008**: Cero regresiones: un cliente no actualizado registra siembras con la misma solicitud que usaba antes del cambio y obtiene el mismo resultado.
- **SC-009**: El 100% de los intentos de eliminar un lote de vermiculita ya usado en bandejas son rechazados de forma controlada.

## Assumptions

- La vermiculita se aplica como cobertura sobre la bandeja al momento de sembrar, por lo que el lote se elige a nivel de grupo de bandejas dentro de una siembra, con la misma granularidad que los lotes de semilla y sustrato. Esto permite que una misma siembra use más de una partida de vermiculita si así ocurrió en el depósito.
- Se indica que el lote de vermiculita es opcional y no obligatorio porque no todas las siembras la usan, y porque hacerlo obligatorio impediría a los clientes existentes seguir registrando siembras hasta ser actualizados. El costo asumido es que un operario puede olvidarse de informarla.
- El grado es un dato del lote (describe la partida de vermiculita) y no del uso, por lo que se registra una sola vez al dar de alta el lote y no se repite en cada siembra.
- Los tres valores de grado (1, 2 y 3) son un conjunto cerrado y estable definido por el negocio, no un catálogo que los usuarios administren.
- Se permite corregir el grado de un lote ya registrado porque el error de carga es más probable y más costoso que el riesgo de alterar un reporte histórico, y porque es el mismo criterio que ya rige para el producto y la variedad de los lotes de semilla.
- Los lotes de vermiculita admiten marca y lote interno del proveedor con exactamente el mismo criterio que hoy se aplica a los lotes de sustrato, sin agregar ni quitar validaciones sobre esos dos datos.
- No se agrega ninguna noción de cantidad o stock: igual que semilla y sustrato, la vermiculita se marca como consumida manualmente cuando se agota.
- El registro de la siembra sigue siendo la única operación de escritura que consume lotes; ningún otro flujo necesita conocer el lote de vermiculita para funcionar.

## Out of Scope

- Cualquier noción de cantidad, stock, unidad de medida o consumo parcial para los lotes de vermiculita.
- Grados adicionales más allá de 1, 2 y 3, o un catálogo administrable de grados.
- Elegir el lote de vermiculita a nivel de siembra completa en lugar de por grupo de bandejas.
- Cambiar o quitar el lote de vermiculita de una bandeja ya registrada.
- Asignar retroactivamente un lote de vermiculita a bandejas anteriores a este cambio.
- Hacer obligatorio el lote de vermiculita, ahora o de forma condicional según el producto sembrado.
- Corregir la inconsistencia existente por la cual el lote interno del proveedor se acepta sin validar el tipo de lote; se registra como deuda técnica preexistente, ajena a esta funcionalidad.
- Reglas que vinculen el grado de la vermiculita con el producto, la variedad o cualquier otro dato de la siembra.
- Cambios en los módulos de lotes de químicos, marcas, proveedores, productos, variedades, trasplante, cosecha, packing o mesas.
