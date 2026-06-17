# Feature Specification: M05-FIX — Alinear Químicos (campos persistidos vs DTO)

**Feature Branch**: `015-fix-quimicos-fields`

**Created**: 2026-06-17

**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Crear un químico con todos sus campos (Priority: P1)

Un supervisor quiere registrar un nuevo químico con toda la información relevante: unidad de stock, tasa de dosificación, período de carencia, fechas de fabricación y vencimiento, proveedor y lote. Hoy esos campos son validados por el sistema al recibir el pedido, pero se descartan silenciosamente sin guardarse — el químico se crea incompleto.

**Why this priority**: Es el bug principal. Cualquier químico creado desde que M05 fue implementado tiene datos faltantes aunque el sistema respondió 201. Todos los módulos dependientes (M06, M09) leen estos campos del químico.

**Independent Test**: Crear un químico con todos los campos nuevos vía POST, obtenerlo vía GET, verificar que todos los valores coinciden con lo enviado.

**Acceptance Scenarios**:

1. **Given** que el supervisor envía POST /quimicos con unidad_stock="l", rate_unidad="ml/l", withholding_period_dias=7, manufacture_date="2026-01-01", dom="2027-01-01", supplier="Proveedor SA", batch="L001", **When** el sistema crea el químico, **Then** GET /quimicos/:id devuelve exactamente esos valores en todos los campos.

2. **Given** que el supervisor envía POST /quimicos sin los campos opcionales (sin withholding_period_dias, manufacture_date, dom, supplier, batch), **When** el sistema crea el químico, **Then** esos campos son null en la respuesta y nombre_lista es false por defecto.

3. **Given** que el supervisor envía POST /quimicos sin unidad_stock o sin rate_unidad, **When** el sistema valida el pedido, **Then** devuelve 400 con mensaje de validación indicando los campos requeridos.

---

### User Story 2 — Actualizar los campos de un químico existente (Priority: P1)

Un supervisor quiere corregir o actualizar datos de un químico ya registrado: cambiar el proveedor, actualizar el lote, modificar el período de carencia o ajustar las unidades. Hoy el sistema rechaza todos esos campos con error "campo inmutable", aunque son columnas normales que deberían poder editarse.

**Why this priority**: Bloquea el uso operacional. Si un químico fue creado con datos incorrectos (o faltantes por el bug de US1), no hay forma de corregirlos.

**Independent Test**: Actualizar un químico existente vía PATCH con cualquiera de los campos nuevos, verificar que el cambio queda persistido en GET.

**Acceptance Scenarios**:

1. **Given** un químico existente con batch="L001", **When** el supervisor envía PATCH /quimicos/:id con { "batch": "L002" }, **Then** GET /quimicos/:id devuelve batch="L002".

2. **Given** un químico existente, **When** el supervisor envía PATCH con cualquier combinación de los campos: nombre, unidad_medida, activo, principios_activos, nombre_lista, unidad_stock, rate_unidad, withholding_period_dias, manufacture_date, dom, supplier, batch, **Then** todos los campos enviados son persistidos correctamente.

3. **Given** un químico existente, **When** el supervisor envía PATCH con stock_actual en el body (junto a otros campos que serían válidos), **Then** la request completa es rechazada con QUIMICO_FIELD_IMMUTABLE 400 y ningún campo es actualizado — incluyendo los campos válidos del mismo pedido.

4. **Given** un químico existente, **When** el supervisor envía PATCH con unidad_stock="kg" (valor de enum válido), **Then** el campo es actualizado correctamente.

---

## Functional Requirements

### FR-1: Persistencia completa en creación

El servicio de creación de químicos debe persistir todos los campos validados por el DTO:

- **nombre_lista**: booleano, debe guardarse como false si no se envía
- **unidad_stock**: enum (kg|g|l|ml), obligatorio, debe guardarse exactamente
- **rate_unidad**: enum (kg/l|g/l|ml/l|l/l), obligatorio, debe guardarse exactamente
- **withholding_period_dias**: entero ≥ 0, opcional — null si no se envía
- **manufacture_date**: fecha ISO, opcional — null si no se envía
- **dom**: fecha ISO, opcional — null si no se envía
- **supplier**: texto máx 200 caracteres, opcional — null si no se envía
- **batch**: texto máx 100 caracteres, opcional — null si no se envía

Los campos server-controlled siguen siendo exclusivamente del servidor: tenant_id, usuario_id, stock_actual (siempre 0 en creación).

### FR-2: Lista blanca de edición expandida

El endpoint PATCH /quimicos/:id debe aceptar todos los campos editables del químico:

- Campos ya permitidos: nombre, unidad_medida, activo, principios_activos
- Campos nuevos a permitir: nombre_lista, unidad_stock, rate_unidad, withholding_period_dias, manufacture_date, dom, supplier, batch
- Campos nunca editables vía PATCH: stock_actual, tenant_id, usuario_id, establecimiento_id

Ningún campo de la lista blanca expandida debe resultar en error QUIMICO_FIELD_IMMUTABLE.

### FR-3: Validación en actualización alineada con creación

El DTO de actualización debe validar los campos nuevos con las mismas reglas que el DTO de creación, todos opcionales (PATCH es parcial):

- unidad_stock: si se envía, debe ser enum válido
- rate_unidad: si se envía, debe ser enum válido
- withholding_period_dias: si se envía, debe ser entero ≥ 0
- manufacture_date / dom: si se envían, deben ser fechas ISO válidas
- supplier: si se envía, máx 200 caracteres
- batch: si se envía, máx 100 caracteres
- nombre_lista: si se envía, debe ser booleano

---

## Success Criteria

- Un químico creado vía POST con todos los campos devuelve exactamente esos valores en GET inmediatamente después — 0 campos descartados.
- Un PATCH con cualquier campo de la lista blanca expandida devuelve 200 y persiste el cambio — 0 rechazos por QUIMICO_FIELD_IMMUTABLE en campos editables.
- Cualquier PATCH que contenga stock_actual, tenant_id, establecimiento_id o id es rechazado en su totalidad con QUIMICO_FIELD_IMMUTABLE — la aplicación parcial de los campos válidos restantes nunca ocurre.
- Todos los químicos previamente creados con campos faltantes pueden ser corregidos vía PATCH sin errores.

---

## Scope

**In scope**:
- `QuimicosService.createQuimico()` — persistir todos los campos del DTO
- `QuimicosController` PATCH whitelist — expandir con los 8 campos nuevos
- `UpdateQuimicoDto` — verificar que los 8 campos nuevos están declarados y validados

**Out of scope**:
- Entidad `Quimico` — no cambiar (columnas ya existen)
- Migraciones — no hay cambio de esquema
- Endpoints GET — ya devuelven todos los campos correctamente
- Endpoints DELETE — sin cambios
- Módulos M06 y M09 — leen del químico persistido, no necesitan cambios
- Retroactive data fix — los químicos ya creados con datos faltantes deben corregirse vía PATCH (el sistema lo permite tras este fix)

---

## Dependencies & Assumptions

- Las columnas nuevas (unidad_stock, rate_unidad, etc.) ya existen en la tabla `quimicos` gracias a la migración `AddChemicalFields` aplicada en M05.
- `CreateQuimicoDto` ya tiene los decoradores de validación correctos para todos los campos — no requiere cambios.
- `UpdateQuimicoDto` ya tiene los campos declarados con `@IsOptional()` — verificar que coinciden con la lista completa.
- El error `QUIMICO_FIELD_IMMUTABLE` seguirá existiendo para campos que genuinamente son inmutables (tenant_id, establecimiento_id, etc.).

---

## Clarifications

### Session 2026-06-17

- Q: ¿Qué campos son realmente inmutables tras la creación? → A: Solo tenant_id, establecimiento_id y stock_actual son server-controlled. El resto son editables.
- Q: ¿Se necesita migración? → A: No — las columnas ya existen en la base de datos desde M05.
- Q: ¿Cambia la respuesta del POST? → A: Sí, debe reflejar los campos guardados. Si ya devuelve la entidad completa, no hay cambio adicional.
- Q: ¿Qué pasa si el PATCH incluye un campo no permitido junto a campos válidos? → A: Se rechaza la request completa con QUIMICO_FIELD_IMMUTABLE 400. No hay aplicación parcial — es todo o nada. Este es el comportamiento ya existente del guard y no cambia con este fix.
