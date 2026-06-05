# Feature Specification: M02 — Lotes (Seed & Substrate Lots)

**Feature Branch**: `002-lotes`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module: M02 — Lotes (Seed & Substrate Lots) — manages seed lots (lote_semilla) and substrate lots (lote_sustrato) in a single table with a type discriminator. Lots are created before a seeding event and referenced by trays (bandejas) to maintain full traceability."

## Clarifications

### Session 2026-06-04

- Q: Is the `tipo` field immutable after creation, and must the update endpoint explicitly reject changes to it? → A: Yes — `tipo` is immutable. The PATCH endpoint must exclude `tipo` from the update DTO and return a validation error if it is supplied.
- Q: What is the exact scope of the numero_lote uniqueness check? → A: Uniqueness is scoped to same tenant + same tipo + not soft-deleted. A soft-deleted lot with the same numero_lote and tipo does NOT block creation of a new lot.
- Q: How should the bandeja reference check behave before the bandejas table exists (M04)? → A: Forward-compatibility guard — if the bandejas table does not exist at query time, the check is skipped gracefully (try/catch or table-existence check). M02 can be fully implemented now without waiting for M04.
- Q: Is GET /admin/lotes restricted to admin_global only? → A: Yes — same as M01 pattern. The admin panel endpoint requires the admin_global role.
- Q: Does text search across numero_lote and proveedor use OR or AND logic? → A: OR logic — a search term matches if it appears in either field (numero_lote ILIKE or proveedor ILIKE).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage lots as supervisor or admin_global (Priority: P1)

A supervisor or admin_global user registers new seed and substrate lots, and can update their details (lot number, supplier, notes, active status).

**Why this priority**: Lots are prerequisite data for seedings — no seeding event can reference a lot that doesn't exist. This is the core write path of the module.

**Independent Test**: Verify that a supervisor can create a seed lot and a substrate lot, update their details, and that both appear in the listing with correct type labels.

**Acceptance Scenarios**:

1. **Given** an authenticated supervisor, **when** they submit a valid create request with `tipo=semilla` and a unique `numero_lote`, **then** a new lot is created for the tenant and visible in the lot listing.
2. **Given** an authenticated supervisor, **when** they submit a create request with a `numero_lote` already used by another active lot of the same type in the same tenant, **then** the request is rejected with a conflict error.
3. **Given** an authenticated supervisor, **when** they patch an existing lot's `proveedor` or `observaciones`, **then** the lot is updated and an audit event is recorded.
4. **Given** an authenticated supervisor, **when** they attempt to change `tipo` on an existing lot via PATCH, **then** the request is rejected with a validation error.
5. **Given** an authenticated operario, **when** they attempt to create a lot, **then** the request is rejected with a permission error.

---

### User Story 2 - Browse the lot catalog as any authenticated user (Priority: P2)

Any authenticated user can view the list of available lots and the details of a specific lot, to support selection during seeding operations.

**Why this priority**: All roles (operario, supervisor, admin_global) need read access to lots when recording seedings or checking traceability.

**Independent Test**: Verify that an operario can list lots, filter by type (semilla or sustrato), and retrieve a specific lot's details.

**Acceptance Scenarios**:

1. **Given** an authenticated operario, **when** they request the lot listing, **then** they receive a paginated list of all active and inactive lots for their tenant.
2. **Given** an authenticated operario, **when** they filter by `tipo=semilla`, **then** only seed lots are returned.
3. **Given** an authenticated operario, **when** they search by `numero_lote` or `proveedor`, **then** only matching lots are returned.
4. **Given** an authenticated operario, **when** they request a single lot by ID, **then** they receive the lot's full details.

---

### User Story 3 - Delete lots as admin_global (Priority: P3)

An admin_global user can soft-delete a lot that is no longer needed, provided it is not currently referenced by any existing tray (bandeja) record.

**Why this priority**: Lot deletion is an infrequent administrative cleanup action and does not block core operations.

**Independent Test**: Verify that admin_global can delete an unreferenced lot, and that deleting a lot referenced by a bandeja is rejected.

**Acceptance Scenarios**:

1. **Given** an authenticated admin_global, **when** they delete a lot not referenced by any bandeja, **then** the lot is soft-deleted, remains for audit, and an audit event is recorded.
2. **Given** an authenticated admin_global, **when** they attempt to delete a lot that is referenced by one or more bandejas, **then** the deletion is rejected with a conflict error.
3. **Given** an authenticated supervisor, **when** they attempt to delete a lot, **then** the request is rejected with a permission error.

---

### Edge Cases

- **Duplicate numero_lote (same tipo, same tenant)**: Creating a lot with a `numero_lote` already used by a non-soft-deleted lot of the same `tipo` in the same tenant must be rejected. Soft-deleted lots with the same number do not block new creation.
- **Referenced lot deletion**: Deleting a lot referenced by at least one bandeja must return a conflict error (not silently skip).
- **Empty lot catalog**: Listing returns a successful paginated response with an empty items array when no lots exist.
- **Simultaneous deactivation and deletion**: Deactivating a lot (`activo=false`) is a soft-disable distinct from soft-delete; a deactivated lot still blocks a duplicate `numero_lote` in active-uniqueness checks.
- **Filtering on both tipo and activo**: The listing must support combining both filters simultaneously.
- **Attempt to change tipo via PATCH**: A PATCH request that includes a `tipo` field must be rejected with a validation error, since `tipo` is immutable after creation.
- **Bandeja table absent at deletion time**: If the bandejas table does not exist (M04 not yet deployed), the reference check is skipped and the lot is deleted without error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a supervisor or admin_global to create a lot with required fields `tipo` (semilla or sustrato) and `numero_lote`, plus optional `proveedor` and `observaciones`.
- **FR-002**: The system MUST reject creation of a lot whose `numero_lote` already exists for the same `tipo` within the same tenant among non-soft-deleted lots. Soft-deleted lots with the same `numero_lote` and `tipo` do NOT block new creation.
- **FR-003**: The system MUST allow a supervisor or admin_global to update a lot's `numero_lote`, `proveedor`, `observaciones`, and `activo` flag. The `tipo` field MUST be excluded from the update operation; any request that includes a `tipo` value MUST be rejected with a validation error.
- **FR-004**: The system MUST allow admin_global to soft-delete a lot, retaining all data for audit and traceability.
- **FR-005**: The system MUST prevent deletion of a lot that is referenced by at least one existing bandeja record, returning a conflict error. This check is a forward-compatibility guard: if the bandejas table does not yet exist (prior to M04 being deployed), the check MUST be skipped gracefully so M02 operates independently.
- **FR-006**: Any authenticated user MUST be able to list lots for their tenant, with support for pagination, filtering by `tipo` and `activo`, and full-text search by `numero_lote` and `proveedor`. Text search uses OR logic: a search term matches a lot if it appears (case-insensitive, partial match) in either `numero_lote` or `proveedor`.
- **FR-006a**: The admin panel listing endpoint (`GET /admin/lotes`) MUST be restricted to the admin_global role only.
- **FR-007**: Any authenticated user MUST be able to retrieve a single lot by ID.
- **FR-008**: The system MUST write audit events for lot creation, update, and deletion.
- **FR-009**: `tenant_id` MUST be assigned automatically from the authenticated session — never accepted from the request body.
- **FR-010**: All API responses MUST use established response wrappers and never return raw entity payloads.

### Key Entities

- **Lot (Lote)**: Represents a physical batch of either seed material or substrate, identified by a supplier lot number. Belongs to a tenant. Has a type discriminator (`tipo`), supplier info, notes, and an active flag. Soft-deletable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Supervisors and admin_global users can successfully create and update lots without errors under normal conditions.
- **SC-002**: The lot listing returns paginated, correctly filtered results for all three filter/search combinations (tipo, activo, text search).
- **SC-003**: Attempting to delete a lot referenced by a bandeja always returns a conflict error, never silently deletes.
- **SC-004**: Duplicate `numero_lote` for the same type and tenant is always rejected at creation time.
- **SC-005**: Audit events are recorded for every create, update, and delete operation.

## Assumptions

- Tenant context is available for all requests and applied automatically to lot operations.
- The `bandejas` table (referenced in FR-005 deletion-block logic) is introduced in a later module (M04 or similar). Until it exists, the deletion-block check is skipped gracefully; M02 is fully functional before M04 is deployed.
- `tipo` is immutable: it is set at creation and cannot be modified. Attempting to PATCH `tipo` returns a validation error.
- Uniqueness for `numero_lote` excludes soft-deleted lots: only non-soft-deleted lots of the same `tipo` and tenant are considered.
- A deactivated lot (`activo=false`) is NOT soft-deleted; it counts toward uniqueness checks and must be explicitly soft-deleted (via DELETE) to be excluded.
- The admin panel endpoint (`GET /admin/lotes`) requires the admin_global role and returns the same data shape as the regular listing.
- No approval workflow is required for lot creation or deletion.
