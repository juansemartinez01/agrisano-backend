# Feature Specification: M10 — Trasplante (Transplant)

**Feature Branch**: `011-trasplante-transplant`

**Created**: 2026-06-06

**Status**: Clarified

**Input**: User description: "Module M10 — Trasplante — moves nursery trays (bandejas) into a greenhouse table (mesa), updates the mesa's tunnel position, and records the event in history."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execute Transplant Operation (Priority: P1)

A field operator has a batch of nursery trays ready for transplanting. They select a target greenhouse table and a destination tunnel, and the system atomically updates all records: each tray is marked as transplanted and linked to the table, and the table is placed at the top of the FIFO queue in the chosen tunnel.

**Why this priority**: Core business operation — this is the primary action the module exists to perform. All history queries depend on transplants existing.

**Independent Test**: POST /trasplante with a valid mesa_id (estado=en_cosecha or activa with no position), a list of en_nursery bandeja_ids, and a tunel_id. Verify the response includes the updated mesa (activa, new posicion_actual = MAX+1), the list of transplanted bandejas, and a historial entry of type trasplante. Verify each bandeja's estado is now trasplantada with mesa_id assigned.

**Acceptance Scenarios**:

1. **Given** a mesa in estado=en_cosecha and 3 bandejas in estado=en_nursery, **When** POST /trasplante, **Then** 200 response with mesa activa at new tunnel position, all bandejas marked trasplantada, historial entry written.
2. **Given** a mesa in estado=activa with posicion_actual=NULL (reactivated), **When** POST /trasplante, **Then** same successful result — mesa gets new tunnel position.
3. **Given** a mesa in estado=activa with posicion_actual already set (already in a tunnel), **When** POST /trasplante, **Then** 409 or 422 error — mesa is not available for transplant.
4. **Given** a mesa in estado=baja, **When** POST /trasplante, **Then** 422 error — mesa must be en_cosecha or activa without position.
5. **Given** a bandeja with estado=trasplantada, **When** POST includes that bandeja_id, **Then** 422 error — already transplanted bandejas cannot be reused.
6. **Given** a tunel_id that has 5 mesas already positioned, **When** POST /trasplante, **Then** the new mesa gets posicion_actual = 6 (MAX+1).
7. **Given** any step in the operation fails (e.g., DB error mid-transaction), **When** POST, **Then** full rollback — no bandeja updated, no mesa updated, no historial entry.

---

### User Story 2 - View Transplant History for a Mesa (Priority: P2)

A supervisor wants to see all transplant events that have been performed on a specific greenhouse table — which batches of trays were transplanted into it and when.

**Why this priority**: Key traceability query — audits and agronomic records require knowing what went into each table and when. Lower priority than the create flow since queries depend on data existing.

**Independent Test**: GET /mesas/:id/trasplantes returns paginated MesaBandeja records for that mesa, ordered by fecha_trasplante DESC. If the mesa has no transplant history, returns empty page.

**Acceptance Scenarios**:

1. **Given** a mesa with 2 prior transplant events (4 bandejas total), **When** GET /mesas/:id/trasplantes, **Then** returns 4 MesaBandeja records with fecha_trasplante populated.
2. **Given** a mesa with no transplant history, **When** GET, **Then** returns empty page with total=0.
3. **Given** a mesa_id belonging to a different tenant, **When** GET, **Then** 404 error.
4. **Given** an invalid (non-existent) mesa_id, **When** GET, **Then** 404 error.

---

### Edge Cases

- What if the tunnel changes between transplants? → The mesa can be assigned to a different tunnel each time (tunel_id in the transplant body). Each transplant resets the position to MAX+1 in the new tunnel.
- What if bandeja_ids contains duplicates? → Treat each as a separate entry; the constraint on the join table will reject exact duplicates (same mesa_id + bandeja_id).
- What if the mesa's establishment doesn't match the tunnel's establishment? → Reject with TRASPLANTE_ESTABLECIMIENTO_MISMATCH 422. The tunnel must belong to the same establecimiento_id as the mesa — validation happens pre-transaction.
- What if bandeja_ids is empty? → 422 error — at least one bandeja is required.
- What happens to the mesa's previous tunnel position when it undergoes a new transplant? → The previous position is overwritten; the FIFO queue for the old tunnel is not automatically rebalanced (out of scope for this module).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated users (operario, supervisor, admin_global) to execute a transplant operation.
- **FR-002**: System MUST reject transplants where the target mesa is not in a transplantable state. Valid states: estado=en_cosecha OR (estado=activa AND posicion_actual IS NULL). Any other state (activa with posicion_actual already set, baja, etc.) → TRASPLANTE_MESA_ESTADO_INVALIDO 422.
- **FR-003**: System MUST reject transplants where any bandeja is not in estado=en_nursery.
- **FR-004**: System MUST atomically execute the full transplant in a single database transaction: mark all bandejas as trasplantada, link them to the mesa via MesaBandeja records, update the mesa's estado=activa and posicion_actual=MAX+1 in the target tunnel, and write a HistorialMesa entry of tipo_evento=trasplante.
- **FR-005**: System MUST roll back the entire transaction if any step fails — no partial state may be persisted.
- **FR-006**: System MUST calculate the new mesa position as MAX(posicion_actual)+1 from all active mesas in the target tunnel, inside the transaction. If the tunnel is empty, position=1.
- **FR-007**: System MUST validate that the target tunnel belongs to the same establecimiento_id as the mesa (not just the same tenant). If they differ, reject with TRASPLANTE_ESTABLECIMIENTO_MISMATCH 422.
- **FR-008**: System MUST always derive usuario_id from the authenticated user's JWT token — never from the request body.
- **FR-009**: System MUST write a HistorialMesa entry of tipo_evento=trasplante inside the transaction (same atomicity guarantee as the rest of the operation).
- **FR-010**: System MUST record fecha_trasplante server-side at transaction time — never accepted from the request body.
- **FR-011**: System MUST provide a paginated list of transplant records (MesaBandeja rows) for a specific mesa (GET /mesas/:id/trasplantes).
- **FR-012**: System MUST write an audit record for each executed transplant.
- **FR-013**: System MUST require at least one bandeja_id in the transplant request.

### Key Entities

- **MesaBandeja**: The join record between a greenhouse table and a nursery tray after transplant. Plain entity with composite PK (mesa_id + bandeja_id) — no extra id column. Fields: mesa_id (uuid), bandeja_id (uuid), fecha_trasplante (timestamptz, server-side). No BaseEntity, no deleted_at. Immutable once written.
- **HistorialMesa** (existing, from MesasModule): The time-ordered log entry for a mesa. A trasplante event is written here inside the transaction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A transplant of 50 bandejas into a mesa completes and is confirmed to the user within 3 seconds under normal load.
- **SC-002**: 100% of transplant transactions either succeed fully or roll back fully — no partial state is ever persisted after a failure.
- **SC-003**: Every mesa that has been transplanted into at least once appears with records in GET /mesas/:id/trasplantes.
- **SC-004**: The mesa's posicion_actual after transplant is always exactly MAX(existing positions in target tunnel) + 1 — never duplicated, never skipped.
- **SC-005**: All read endpoints return results in under 2 seconds for datasets up to 10,000 transplant records.

## Assumptions

- A mesa may be transplanted into multiple times over its lifecycle (each time it cycles through en_cosecha → trasplante → activa). MesaBandeja accumulates records across all transplants.
- The system does not automatically remove or rebalance other mesas' positions when a mesa moves tunnels — position gaps in the old tunnel are left as-is.
- fecha_trasplante on MesaBandeja is set server-side to the same timestamp used for the transaction; the client cannot override it.
- The transplant validates that tunel_id belongs to the same establecimiento_id as the mesa (strict establishment match, not just tenant). TRASPLANTE_ESTABLECIMIENTO_MISMATCH 422 is returned if they differ.
- Pagination defaults: page=1, limit=20, max=200.
- GET /mesas/:id/trasplantes is scoped to the requesting tenant; cross-tenant access returns 404.
- usuario_id is never accepted from the request body — always from JWT.
- All bandeja validations (exists, estado=en_nursery, establecimiento_id match) happen pre-transaction before opening the QueryRunner.
- POST /trasplante returns HTTP 200 — the operation updates existing records rather than creating a primary resource.

## Clarifications

### Session 2026-06-08

- Q: Does tunel_id validation check the same establecimiento_id as the mesa, or just the same tenant? → A: Same establecimiento_id (stricter). TRASPLANTE_ESTABLECIMIENTO_MISMATCH 422 if they differ.
- Q: What exact mesa states are transplantable, and what error code is used for invalid states? → A: estado=en_cosecha OR (estado=activa AND posicion_actual IS NULL) are valid. All others → TRASPLANTE_MESA_ESTADO_INVALIDO 422.
- Q: What is the exact MesaBandeja entity structure (PK, columns, BaseEntity)? → A: Composite PK (mesa_id, bandeja_id) — no extra id column. Columns: mesa_id uuid, bandeja_id uuid, fecha_trasplante timestamptz. Plain entity, no BaseEntity, no deleted_at.
- Q: How is the HistorialMesa trasplante event written — inside QueryRunner or via HistorialMesaService? → A: Inside QueryRunner via qr.manager.save(HistorialMesa, {...}). Same atomicity pattern as M09.
- Q: Where is GET /mesas/:id/trasplantes implemented — TrasplanteController or MesasController? → A: TrasplanteController with explicit full-path @Get('mesas/:mesa_id/trasplantes'). Same pattern as M06/M08/M09.
- Q: When do bandeja validations (exists, en_nursery, establecimiento_id match) occur relative to the transaction? → A: All three checks happen pre-transaction before opening the QueryRunner.
- Q: What HTTP status code does POST /trasplante return? → A: HTTP 200 (updates existing records, not creating a primary resource).
