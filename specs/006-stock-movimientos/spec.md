# Feature Specification: M06 — Stock Movimientos (Chemical Stock Movements)

**Feature Branch**: `006-stock-movimientos`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module M06 — Stock Movimientos (Chemical Stock Movements): manual stock movements for chemicals with atomic stock_actual updates, immutable audit trail, and warning on negative stock."

## Clarifications

### Session 2026-06-04

- Q: Where is GET /quimicos/:id/movimientos implemented — StockMovimientosController or QuimicosController? → A: StockMovimientosController. Avoids modifying the already-closed M05 module. The route delegates to the same service query as GET /stock-movimientos?quimico_id=X.
- Q: What transaction pattern is used for the atomic stock update? → A: Explicit QueryRunner (same pattern as M03 createSiembra): INSERT movimiento + UPDATE quimico SET stock_actual = stock_actual ± cantidad in a single transaction with full rollback on failure.
- Q: When is the negative-stock warning evaluated relative to the transaction? → A: Pre-commit. projected_stock = current_stock_actual − cantidad is calculated before the transaction commits. If projected_stock < 0 the warning is set. The transaction still commits. The warning is returned in the POST response.
- Q: Does MovimientoStock extend BaseEntity? → A: No. MovimientoStock is a plain entity with its own id, tenant_id, created_at, updated_at columns. It does NOT extend BaseEntity because BaseEntity includes deleted_at, and movements are immutable with no soft-delete.
- Q: Does GET /stock-movimientos apply a default filter when no query params are provided? → A: No default filter. When no filters are provided the endpoint returns all movements for the tenant, paginated. Date range filters (fecha_desde, fecha_hasta) are applied with WHERE fecha >= :desde AND fecha <= :hasta only when the caller supplies them.
- Q: How are unidad_medida and establecimiento_id handled when present in the POST body? → A: Silently ignored. They are always overwritten with values copied from the quimico record. No validation error is returned. This is safe because neither field is security-sensitive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register a Stock Ingreso (Priority: P1)

A supervisor receives a delivery of chemicals. They register an ingreso movement for the chemical, specifying the quantity and optionally the invoice reference number. The system records the movement and immediately increases the chemical's current stock.

**Why this priority**: Core write path. All other functionality depends on being able to add stock movements.

**Independent Test**: Can be fully tested by POSTing an ingreso movement for an existing chemical and verifying the returned stock_actual is incremented and the movement record is persisted.

**Acceptance Scenarios**:

1. **Given** a supervisor is authenticated and a chemical exists in their tenant, **When** they POST an ingreso with a valid quantity and quimico_id, **Then** a movement record is created, the chemical's stock_actual increases by the specified quantity, and the response includes both the movement and the updated stock_actual.
2. **Given** a supervisor submits an ingreso without a fecha, **When** the request is processed, **Then** fecha defaults to today's date.
3. **Given** a supervisor submits an ingreso, **When** the request is processed, **Then** unidad_medida and establecimiento_id are copied from the chemical record — any values provided in the request body are silently ignored.
4. **Given** a supervisor submits an ingreso with a quimico_id from a different tenant, **When** the request is processed, **Then** the request is rejected with a not-found error.

---

### User Story 2 — Register a Manual Egreso (Priority: P1)

A supervisor registers a manual egreso (consumption or loss) for a chemical. The system records the movement, decrements the stock, and — if the result would be negative — includes a warning in the response but still saves the record.

**Why this priority**: Equal in importance to ingreso; together they form the complete stock movement lifecycle.

**Independent Test**: Can be fully tested by POSTing an egreso_manual and verifying the stock decrements and the warning is included when stock would go negative.

**Acceptance Scenarios**:

1. **Given** a chemical has sufficient stock, **When** a supervisor POSTs an egreso_manual with a quantity ≤ stock_actual, **Then** the movement is created, stock_actual decreases, and the response contains no warning.
2. **Given** a chemical has insufficient stock, **When** a supervisor POSTs an egreso_manual with a quantity > stock_actual, **Then** the projected stock is evaluated before the transaction commits; the movement is still created, stock_actual decreases (potentially below zero), and the response includes `warning: 'Stock resultante negativo'`.
3. **Given** an operario (non-supervisor) is authenticated, **When** they attempt to POST a movement, **Then** the request is rejected with a 403 Forbidden.

---

### User Story 3 — Browse Stock Movement History (Priority: P2)

Any authenticated user can list stock movements, filtered by chemical, establishment, movement type, and date range. They can also retrieve a single movement by ID.

**Why this priority**: Read path needed for stock auditing and traceability; delivers value independently once movements exist.

**Independent Test**: Can be tested by listing movements with various filters and confirming correct pagination and data.

**Acceptance Scenarios**:

1. **Given** movements exist for a tenant, **When** an authenticated user GETs /stock-movimientos with no filters, **Then** a paginated list of all tenant movements is returned (no default filter applied).
2. **Given** movements exist for multiple chemicals, **When** a user filters by quimico_id, **Then** only movements for that chemical are returned.
3. **Given** movements exist across date ranges, **When** a user filters by fecha_desde and fecha_hasta, **Then** only movements within the inclusive range are returned.
4. **Given** a movement ID exists, **When** a user GETs /stock-movimientos/:id, **Then** the full movement record is returned.
5. **Given** a movement ID belongs to a different tenant, **When** a user GETs that ID, **Then** a not-found error is returned.

---

### User Story 4 — Browse Movements for a Specific Chemical (Priority: P2)

Any authenticated user can navigate to a specific chemical and view all its stock movements in a single paginated list, ordered chronologically.

**Why this priority**: Convenience endpoint that ties movement history directly to the chemical view; useful for stock reconciliation.

**Independent Test**: Can be tested independently by calling GET /quimicos/:id/movimientos and verifying only movements for that chemical are returned.

**Acceptance Scenarios**:

1. **Given** a chemical has multiple movements, **When** a user GETs /quimicos/:id/movimientos, **Then** all movements for that chemical are returned in paginated form (same result as GET /stock-movimientos?quimico_id=X).
2. **Given** a chemical belongs to a different tenant, **When** a user requests its movements, **Then** a not-found error is returned.

---

### Edge Cases

- What happens when cantidad is 0 or negative? The system rejects the request with a validation error.
- What happens when a movement is requested to be updated or deleted? No such endpoints exist; movements are permanently immutable.
- What happens when quimico_id does not exist in the tenant? The request is rejected with a not-found error before any movement is recorded.
- What happens if the transaction fails mid-way (movement insert or stock update fails)? The entire QueryRunner transaction rolls back fully; neither the movement record nor the stock change is persisted.
- What if two concurrent egressos are submitted simultaneously for the same chemical? The QueryRunner transaction with atomic UPDATE quimico SET stock_actual = stock_actual − cantidad prevents race conditions; each operation applies against the committed state.
- What if unidad_medida or establecimiento_id are included in the POST body? They are silently ignored and overwritten with values from the quimico record.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow supervisors and admin_global users to create stock movements (ingreso and egreso_manual) for chemicals within their tenant.
- **FR-002**: System MUST reject movement creation requests from operario or any unauthenticated user with a 403 Forbidden response.
- **FR-003**: System MUST validate that the referenced chemical exists and belongs to the requesting user's tenant before creating a movement.
- **FR-004**: System MUST copy unidad_medida and establecimiento_id from the chemical record at the time of movement creation. If these fields are present in the request body they are silently ignored — no validation error is returned.
- **FR-005**: System MUST set usuario_id from the JWT token (req.user.sub), never from the request body.
- **FR-006**: System MUST default fecha to the current date if not provided in the request.
- **FR-007**: System MUST reject movement creation if cantidad is not a positive decimal value greater than zero.
- **FR-008**: System MUST update the chemical's stock_actual atomically in the same database transaction as the movement insert, using an explicit QueryRunner (same pattern as M03 createSiembra): INSERT movement + UPDATE quimico SET stock_actual = stock_actual ± cantidad. The transaction must roll back fully on any failure.
- **FR-009**: For ingreso movements, system MUST increase the chemical's stock_actual by cantidad.
- **FR-010**: For egreso_manual movements, system MUST decrease the chemical's stock_actual by cantidad, even if the result would be negative.
- **FR-011**: System MUST evaluate projected_stock = current_stock_actual − cantidad BEFORE the transaction commits. If projected_stock < 0, system MUST include `warning: 'Stock resultante negativo'` in the POST response. The transaction still commits and the movement is persisted.
- **FR-012**: System MUST NOT expose update or delete endpoints for movements; once created, a movement record is immutable.
- **FR-013**: System MUST allow all authenticated users to list and retrieve individual movement records within their tenant.
- **FR-014**: System MUST support paginated listing of movements filterable by quimico_id, establecimiento_id, tipo, and date range (fecha_desde / fecha_hasta inclusive). When no filters are provided, all tenant movements are returned without a default filter.
- **FR-015**: System MUST expose a convenience endpoint GET /quimicos/:id/movimientos implemented in StockMovimientosController (not QuimicosController). This endpoint returns the same paginated result as GET /stock-movimientos?quimico_id=X, delegating to the same service query.
- **FR-016**: System MUST write an audit record for every movement creation: `stock_movimiento_ingreso` for ingreso, `stock_movimiento_egreso_manual` for egreso_manual.
- **FR-017**: MovimientoStock MUST NOT have a deleted_at column. The entity is a plain TypeORM entity (does NOT extend BaseEntity) with its own id, tenant_id, created_at, and updated_at columns only. The entity is append-only and immutable.

### Key Entities

- **MovimientoStock**: Represents a single manual stock movement event for a chemical. Plain entity (no BaseEntity inheritance) with id, tenant_id, created_at, updated_at. Captures movement type (ingreso or egreso_manual), quantity, unit of measure (copied from chemical), the chemical's establishment (copied from chemical), an optional invoice reference, optional observations, the acting user, and the movement date. Immutable once created; no soft-delete.
- **Quimico** (existing): The chemical product entity whose `stock_actual` field is updated atomically on each movement via QueryRunner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Supervisors can register a complete stock movement (ingreso or egreso) in a single request with immediate, atomic stock update — no multi-step workflow required.
- **SC-002**: All authenticated users can retrieve a full movement history for any chemical, paginated and filterable, within standard response times.
- **SC-003**: 100% of concurrent movement operations on the same chemical produce consistent stock results — no double-deductions or missed increments due to race conditions.
- **SC-004**: Every movement creation produces a corresponding audit record; zero movements are created without an audit trail.
- **SC-005**: Stock warnings are surfaced in 100% of egreso_manual responses where the resulting stock would be negative, with no blocking of the save operation.
- **SC-006**: Attempts to update or delete any movement record are rejected with a 404 or 405 response — the API surface enforces immutability.

## Assumptions

- The Quimico entity already has a `stock_actual` (decimal) column that can be updated. If it does not, the column must be added as part of this module's migration.
- The QuimicosModule exports QuimicosService, making it available for injection into StockMovimientosModule without circular dependency issues.
- Pagination follows the same conventions as existing modules (page/limit query params, page() response helper).
- `fecha` is stored as a date (no time component); time-of-day ordering within the same date is handled by created_at.
- No approval workflow is required for movements in this iteration; creation is immediate and final.
- The system does not need to reconstruct stock_actual from movement history; stock_actual on Quimico is the authoritative live balance, maintained atomically.
- Filter date range parameters are named `fecha_desde` and `fecha_hasta` (inclusive), consistent with project conventions.
- GET /quimicos/:id/movimientos is handled in StockMovimientosController using a `@Get('quimicos/:id/movimientos')` route with appropriate prefix configuration, keeping QuimicosModule closed to modification.
