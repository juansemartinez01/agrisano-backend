# Feature Specification: M03 — Siembra (Seeding Events)

**Feature Branch**: `003-siembra`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module: M03 — Siembra (Seeding Events) — manages daily seeding events. Each seeding event generates one or more physical trays (bandejas). Siembra and bandejas are created atomically in a single transaction."

## Clarifications

### Session 2026-06-04

- Q: What is the default `estado` filter on GET /bandejas when none is provided? → A: Defaults to `en_nursery`. The filter accepts `'en_nursery'` or `'trasplantada'` to override. Daily nursery view is the default; full traceability accessible with explicit filter.
- Q: Must the atomic transaction for POST /siembras use TypeORM QueryRunner explicitly? → A: Yes — TypeORM `QueryRunner` must be used explicitly (not just `repository.save()`) to guarantee rollback of both the siembra and all bandejas on any failure.
- Q: When does lot type validation (FR-003) execute relative to the transaction? → A: Before the transaction opens — the service loads each referenced lot, verifies `tipo` matches expected (`semilla`/`sustrato`), and throws `AppError` on mismatch. This avoids DB constraint errors inside the transaction.
- Q: Does PATCH /siembras/:id silently ignore extra fields or explicitly reject them? → A: Strict rejection — if the request body contains any field other than `observaciones` (e.g., `fecha`, `establecimiento_id`, `usuario_id`, `bandejas`), the handler throws `AppError` with a validation error.
- Q: What is the response shape of GET /siembras/:id? → A: Returns the siembra with `bandejas[]` nested. Each bandeja in the array includes its `lote_semilla` and `lote_sustrato` references at minimum as `{ id, numero_lote, tipo }`.
- Q: How does the cascade soft-delete (FR-011) delete bandejas — individually or in bulk? → A: Bulk UPDATE — a single `UPDATE bandejas SET deleted_at = now() WHERE siembra_id = :id AND deleted_at IS NULL` query, not N individual deletes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a seeding event as operario (Priority: P1)

An operario, supervisor, or admin_global registers a new seeding event for a specific establishment, specifying the seed and substrate lots used and the number of trays produced. The system creates the seeding record and all trays atomically.

**Why this priority**: Recording seedings is the primary daily operation in the greenhouse — it drives all downstream traceability (nursery tracking, transplant, harvest). Without this flow nothing else works.

**Independent Test**: Verify that an operario can submit a seeding event with two lot groups (3 trays of semilla-A/sustrato-X and 2 trays of semilla-B/sustrato-Y), receiving back the created seeding with 5 trays, all in `en_nursery` state, and an audit event recorded.

**Acceptance Scenarios**:

1. **Given** an authenticated operario and valid lot and establishment IDs, **when** they submit a create-seeding request with at least one bandeja group, **then** the seeding and all trays are created atomically, the response includes the seeding with its bandejas nested, and an audit event is recorded.
2. **Given** an authenticated operario, **when** they submit a create-seeding request with `cantidad: 0` or an empty bandejas array, **then** the request is rejected with a validation error.
3. **Given** an authenticated operario, **when** they reference a `lote_semilla_id` that belongs to a sustrato lot (wrong type), **then** the request is rejected with a domain error.
4. **Given** an authenticated operario, **when** they reference a `lote_semilla_id` belonging to a different tenant, **then** the request is rejected.
5. **Given** an unauthenticated user, **when** they submit a seeding request, **then** the request is rejected with an authentication error.

---

### User Story 2 - View seedings and trays in the nursery (Priority: P2)

Any authenticated user can view the list of seeding events with their tray counts, and browse current nursery inventory (trays in `en_nursery` state) filtered by establishment, seeding, or lot.

**Why this priority**: Supervisors and operarios need to see what is currently in the nursery to plan transplant operations and check traceability.

**Independent Test**: Verify that an operario can list seedings filtered by establishment and date, retrieve a single seeding with all its trays, and list nursery trays filtered by establishment.

**Acceptance Scenarios**:

1. **Given** an authenticated operario, **when** they list seedings, **then** they receive a paginated list of all seedings for their tenant.
2. **Given** an authenticated operario, **when** they filter seedings by `establecimiento_id`, **then** only seedings from that establishment are returned.
3. **Given** an authenticated operario, **when** they retrieve a single seeding by ID, **then** the response includes the seeding with its bandejas array nested.
4. **Given** an authenticated operario, **when** they list bandejas, **then** they receive paginated trays filterable by establishment, seeding, and seed lot.
5. **Given** an authenticated operario, **when** they retrieve a single bandeja by ID, **then** the response includes the tray's full details including its siembra and lot references.

---

### User Story 3 - Update seeding notes as supervisor (Priority: P3)

A supervisor or admin_global can update the free-text notes on an existing seeding event (no other fields can be changed after creation).

**Why this priority**: Post-creation note edits are occasional and non-blocking for core operations.

**Independent Test**: Verify that a supervisor can update a seeding's observaciones, that an operario cannot, and that no other fields change.

**Acceptance Scenarios**:

1. **Given** an authenticated supervisor, **when** they PATCH a seeding's `observaciones`, **then** the notes are updated, an audit event is recorded, and no other fields change.
2. **Given** an authenticated operario, **when** they attempt to PATCH a seeding, **then** the request is rejected with a permission error.
3. **Given** an authenticated supervisor, **when** their PATCH request body contains any field other than `observaciones` (e.g., `fecha`, `establecimiento_id`, `usuario_id`, `bandejas`), **then** the request is rejected with a validation error — extra fields are never silently ignored.

---

### User Story 4 - Delete a seeding as admin_global (Priority: P3)

An admin_global can soft-delete a seeding event, which also soft-deletes all its trays, provided none of the trays have been transplanted yet.

**Why this priority**: Deletion is an infrequent administrative correction; blocking it when transplants exist protects traceability integrity.

**Independent Test**: Verify that admin_global can delete a seeding with only `en_nursery` trays, and that deletion is blocked if any tray is `trasplantada`.

**Acceptance Scenarios**:

1. **Given** an authenticated admin_global, **when** they delete a seeding whose trays are all in `en_nursery` state, **then** the seeding and all its trays are soft-deleted and an audit event is recorded.
2. **Given** an authenticated admin_global, **when** they delete a seeding that has at least one `trasplantada` tray, **then** the deletion is rejected with a conflict error.
3. **Given** an authenticated supervisor, **when** they attempt to delete a seeding, **then** the request is rejected with a permission error.

---

### Edge Cases

- **Empty bandejas array or zero cantidad**: The POST request must be rejected — a seeding without trays is meaningless.
- **Wrong lot type**: `lote_semilla_id` must reference a lot with `tipo=semilla`; `lote_sustrato_id` must reference a lot with `tipo=sustrato`. Swapping them must be rejected.
- **Lot from different tenant**: Referencing a lot that doesn't belong to the current tenant must be rejected.
- **Establishment from different tenant**: Referencing an establishment outside the current tenant must be rejected.
- **Partial transaction failure**: If any tray fails to create, the entire seeding (including any previously created trays) must be rolled back.
- **Seeding with trasplantada trays**: Attempting to delete a seeding with any transplanted tray is blocked, even if most trays are still en_nursery.
- **Immutable fields on PATCH**: `fecha`, `establecimiento_id`, `usuario_id`, and `bandejas` cannot be modified after creation. Any PATCH body containing these fields is rejected with a validation error — they are not silently stripped.
- **GET /bandejas without estado filter**: Returns only `en_nursery` trays by default; caller must explicitly pass `estado=trasplantada` to see transplanted trays.
- **Lot type validation before transaction**: If any referenced lot has the wrong `tipo`, the error is raised before the database transaction opens — no partial data is written even if some lots were valid.
- **fecha defaults to today**: If `fecha` is omitted in the request, the system uses the current calendar date.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an operario, supervisor, or admin_global to create a seeding event for a specific establishment with at least one bandeja group.
- **FR-002**: A seeding creation request MUST include at least one bandeja group with `cantidad >= 1`; requests with zero bandejas or `cantidad = 0` MUST be rejected.
- **FR-003**: Each bandeja group in the request MUST reference a `lote_semilla_id` whose `tipo = semilla` and a `lote_sustrato_id` whose `tipo = sustrato`; mismatched types MUST be rejected. This validation MUST occur before the creation transaction opens (load each lot, verify tipo, throw domain error on mismatch) to avoid constraint errors inside the transaction.
- **FR-004**: Both the establishment and all referenced lots MUST belong to the same tenant as the authenticated user; cross-tenant references MUST be rejected.
- **FR-005**: The seeding and all resulting trays MUST be created atomically using an explicit database transaction (with full rollback capability). A failure in any bandeja creation MUST roll back the entire operation including the siembra record and any previously created bandejas.
- **FR-006**: Each created tray MUST start in `estado = en_nursery` with `fecha_entrada_nursery` set to the creation timestamp.
- **FR-007**: `usuario_id` on the seeding MUST be set from the authenticated JWT token — never from the request body.
- **FR-008**: `fecha` defaults to the current calendar date if omitted in the request.
- **FR-009**: The system MUST allow supervisor and admin_global to update only the `observaciones` field of an existing seeding. If the PATCH request body contains any field other than `observaciones` (e.g., `fecha`, `establecimiento_id`, `usuario_id`, `bandejas`), the request MUST be rejected with a validation error — extra fields are never silently stripped.
- **FR-010**: The system MUST allow admin_global to soft-delete a seeding only if all its trays are in `en_nursery` state; deletion MUST be blocked if any tray is `trasplantada`.
- **FR-011**: Soft-deleting a seeding MUST cascade a soft-delete to all its trays using a single bulk update operation (one query setting `deleted_at = now()` on all associated bandejas whose `deleted_at IS NULL`), not individual per-tray deletes.
- **FR-012**: Any authenticated user MUST be able to list and retrieve seedings, with support for pagination, filtering by `establecimiento_id`, and filtering by `fecha` range.
- **FR-013**: Any authenticated user MUST be able to list bandejas. The listing defaults to `estado = en_nursery` when no `estado` filter is provided; the filter accepts `'en_nursery'` or `'trasplantada'` to override. Additional filters: `establecimiento_id`, `siembra_id`, and `lote_semilla_id`.
- **FR-014**: GET /siembras/:id MUST return the seeding with its `bandejas[]` array nested. Each bandeja in the array MUST include its `lote_semilla` and `lote_sustrato` references at minimum as `{ id, numero_lote, tipo }`.
- **FR-015**: GET /bandejas/:id MUST return the tray with its siembra and lot references included.
- **FR-016**: The system MUST write audit events for seeding creation (including total tray count), update, and deletion.

### Key Entities

- **Siembra (Seeding Event)**: Represents a single seeding session in a specific establishment on a specific date. Contains the who, when, where, and links to the physical trays produced.
- **Bandeja (Tray)**: Represents a physical growing tray created from a seeding event. Links to its seed lot, substrate lot, and establishment. Tracks lifecycle state from nursery entry through transplant (managed by M11).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operarios can successfully register a multi-tray seeding event in a single request with all bandejas created correctly.
- **SC-002**: The seeding listing returns correctly paginated, filtered results by establishment and date range.
- **SC-003**: The nursery listing (GET /bandejas) returns only trays currently in `en_nursery` state for the tenant.
- **SC-004**: Attempting to delete a seeding with a transplanted tray always returns a conflict error.
- **SC-005**: All seedings and bandejas reference correct tenanted lots and establishments — no cross-tenant data leaks.
- **SC-006**: Audit events are created for every seeding creation, update, and deletion.
- **SC-007**: A failed tray creation within a multi-group seeding rolls back the entire operation — no partial seedings exist.

## Assumptions

- Tenant context is available for all requests and applied automatically.
- `usuario_id` comes exclusively from the JWT payload (sub field); it is never accepted from the request body.
- `establecimiento_id` is denormalized onto each bandeja at creation time (copied from the siembra) to optimize nursery queries without requiring a join through siembra.
- Tray state transitions beyond `en_nursery → trasplantada` are handled by later modules (M11 Trasplante); this module only creates trays and allows their deletion (while still in nursery).
- A bandeja in `trasplantada` state is fully read-only from the perspective of M03 — the PATCH or DELETE operations on the siembra will check but not modify those bandejas.
- `fecha` on the seeding represents the calendar date of the seeding event (date only, no time component), not a timestamp.
- The `codigo` field on bandejas is reserved for future QR/barcode assignment and is always null at creation in M03.
- The `mesa_id` and `fecha_trasplante` fields on bandejas are always null at creation — they are set by M11.
- No pagination limit is set on the nested bandejas array within GET /siembras/:id (assumed manageable quantity per seeding; may be revisited if performance issues arise).
