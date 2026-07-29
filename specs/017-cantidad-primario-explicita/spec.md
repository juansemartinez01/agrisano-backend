# Feature Specification: Cantidad explícita del lote primario en aplicaciones químicas

**Feature Branch**: `017-cantidad-primario-explicita`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Cambiar el consumo de stock del lote químico primario en POST /aplicaciones-quimicas: el backend deja de calcular dosis × cantidad_de_targets y pasa a descontar la cantidad explícita que envía el frontend en un campo nuevo obligatorio `cantidad`, en simetría exacta con los lotes adicionales de detalles[]."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El operario controla exactamente cuánto se descuenta (Priority: P1)

Como operario que registra una aplicación química, quiero indicar explícitamente la cantidad total de producto del lote primario que se consumió, para que el stock refleje la realidad de lo aplicado en campo en lugar de una proyección aritmética (dosis × targets) que no siempre coincide con el consumo real.

**Why this priority**: Es el cambio central: hoy el sistema descuenta un valor calculado que el usuario no controla; el negocio decidió que quien registra es dueño del número, igual que ya ocurre con los químicos adicionales.

**Independent Test**: Crear una aplicación (nursery o greenhouse) enviando `cantidad` en la raíz y verificar que el lote primario descuenta exactamente ese valor, sin importar cuántos targets tenga la aplicación ni qué dosis se informe.

**Acceptance Scenarios**:

1. **Given** un lote primario con 10 de stock, **When** se crea una aplicación con `cantidad: 2.5`, `dosis: 0.1` y 71 bandejas, **Then** el lote queda con 7.5 (descuenta 2.5, no 7.1) y el detalle primario registra `cantidad: 2.5` con `dosis: 0.1` informativa.
2. **Given** una aplicación greenhouse con `cantidad: 1.0` sobre 3 mesas, **When** se consulta el lote primario después de crear, **Then** descontó exactamente 1.0 (no 3 × dosis).
3. **Given** un request sin el campo `cantidad` en la raíz, **When** se envía el POST, **Then** responde 400 de validación y no se crea nada ni se descuenta stock.
4. **Given** un lote primario con stock 1.0, **When** se envía `cantidad: 5.0`, **Then** responde 422 de stock insuficiente y la operación completa se revierte (sin aplicación, sin detalles, sin carencias).

---

### User Story 2 - La dosis sigue siendo el dato informativo de siempre (Priority: P2)

Como supervisor que consulta el historial, quiero que la dosis por target siga registrándose exactamente como hoy (obligatoria, snapshot en la aplicación y su detalle primario), para que la trazabilidad histórica no pierda información con el cambio.

**Why this priority**: Garantiza que el cambio es solo sobre el origen del descuento, sin degradar los datos que consumen el historial y la trazabilidad.

**Independent Test**: Crear una aplicación con `cantidad` y `dosis` y verificar que cabecera y detalle primario guardan `dosis`/`dosis_unidad` idénticos a antes del cambio, y que la lectura enriquecida muestra `quantity` = cantidad enviada y `dose` = dosis informada.

**Acceptance Scenarios**:

1. **Given** un request sin `dosis`, **When** se envía el POST, **Then** responde 400 (la dosis sigue obligatoria y positiva).
2. **Given** una aplicación creada con `cantidad: 2.5` y `dosis: 0.1`, **When** se consulta `GET /aplicaciones-quimicas/:id`, **Then** el detalle primario muestra `cantidad: 2.5`, `dosis: 0.1` y `dosis_unidad` con el mismo comportamiento de default actual (rate del químico si no se envía).
3. **Given** una aplicación greenhouse creada con el campo nuevo, **When** se consulta el historial de la mesa, **Then** el evento `aplicacion_quimica` incluye tanto `dosis` como el nuevo campo `cantidad` descontada.

---

### Edge Cases

- `cantidad` ≤ 0, no numérica o ausente → 400 de validación, sin efectos.
- `cantidad` con más de 3 decimales → se persiste con la precisión de la columna (numeric 10,3), igual que los adicionales hoy.
- No existe ninguna validación de coherencia entre `cantidad` y `dosis × targets`: el backend acepta cualquier cantidad positiva aunque no "cierre" aritméticamente (decisión de negocio: el cálculo es del frontend).
- Pedidos troceados en chunks (`operation_group_id`): la `cantidad` es por POST/chunk; el total de la operación lógica es la suma de los chunks y es responsabilidad del frontend repartirlo.
- Los lotes adicionales (`detalles[]`) no cambian en nada.
- El descuento sigue siendo atómico con guard de stock en el mismo UPDATE (sin ventana de concurrencia) y transaccional (rollback total ante cualquier error).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `POST /aplicaciones-quimicas` MUST exigir un campo `cantidad` (numérico, > 0) en la raíz del body; su ausencia o invalidez produce 400 de validación sin efectos secundarios.
- **FR-002**: El descuento de stock del lote primario MUST ser exactamente la `cantidad` enviada — el backend no calcula ni ajusta el valor (se elimina la multiplicación dosis × targets).
- **FR-003**: El sistema MUST NOT validar coherencia entre `cantidad` y `dosis × cantidad_de_targets`; cualquier cantidad positiva es aceptada.
- **FR-004**: `dosis` MUST seguir siendo obligatoria y positiva, y `dosis`/`dosis_unidad` MUST seguir guardándose como hoy (snapshot en cabecera y en el detalle primario), como datos puramente informativos.
- **FR-005**: El detalle primario MUST registrar `cantidad` = valor enviado (es lo que muestran los endpoints de lectura como `quantity`, sin cambios en la lectura).
- **FR-006**: El evento `aplicacion_quimica` del historial de mesa (greenhouse) MUST incluir, además de los campos actuales, la `cantidad` descontada del lote primario (cambio aditivo al JSON del evento).
- **FR-007**: El guard atómico de stock (`cantidad_actual >= cantidad` en el mismo UPDATE), el error `LOTE_QUIMICO_STOCK_INSUFICIENTE` (422) con rollback total, las carencias, las validaciones de targets y el comportamiento de `detalles[]` MUST permanecer sin cambios.
- **FR-008**: No se requieren cambios de esquema de base de datos (la cantidad vive en el detalle primario como hoy; no se agrega columna a la cabecera).

### Key Entities

- **Aplicación Química (cabecera)**: sin cambios de esquema; `dosis`/`dosis_unidad` siguen como snapshot informativo.
- **Detalle primario**: pasa a registrar la cantidad enviada por el cliente en lugar de la calculada; shape idéntico.
- **Lote químico**: su `cantidad_actual` se decrementa por el valor explícito del request.
- **Evento de historial de mesa**: JSON extendido con `cantidad` (aditivo).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de las aplicaciones nuevas, el stock del lote primario desciende exactamente la cantidad indicada por el usuario (verificable comparando `cantidad_actual` antes/después).
- **SC-002**: El 100% de los requests sin `cantidad` o con `cantidad` inválida son rechazados con 400 sin crear datos ni tocar stock.
- **SC-003**: La información histórica no pierde campos: toda aplicación nueva conserva `dosis`, `dosis_unidad`, `batch` y carencia snapshot idénticos al comportamiento previo.
- **SC-004**: Cero regresiones en lotes adicionales, carencias, validaciones de targets y endpoints de lectura (respuestas con el mismo shape).

## Assumptions

- Corte limpio coordinado con frontend: el día del deploy, los clientes que no envíen `cantidad` reciben 400 (decisión explícita del solicitante; no hay fallback al cálculo anterior).
- La cantidad es por POST: en pedidos troceados por chunks, el frontend reparte el total entre chunks.
- Las aplicaciones históricas creadas con el cálculo anterior no se modifican; conviven con las nuevas sin distinción de shape.
- El significado de `dosis` (por target) no cambia; solo deja de usarse para calcular el descuento.
