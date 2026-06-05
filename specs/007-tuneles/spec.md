# Feature Specification: M07 — Tuneles (Greenhouse Tunnels)

**Feature Branch**: `008-tuneles-module`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Module M07 — Tuneles: manages physical greenhouse tunnels. Each tunnel belongs to an establishment and acts as a FIFO queue container for tables (mesas). Supervisors manage tunnels. Prerequisite for M08 Mesas."

## Clarifications

### Session 2026-06-05

- Q: PATCH guard — if establecimiento_id appears in the PATCH body, what error is returned? → A: Reject with error code TUNEL_FIELD_IMMUTABLE, HTTP 400. Only nombre, capacidad_maxima, and activo are patchable. Same strict rejection pattern as M04 recetas and M05 quimicos.
- Q: Does GET /tuneles without ?activo filter apply a default activo=true filter? → A: No default filter. When ?activo is omitted the endpoint returns all non-deleted tunnels regardless of activo value — same behavior as M04 recetas.
- Q: What is the exact scope of the nombre uniqueness constraint? → A: (tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL — partial unique index at the database level, same pattern as M04 recetas. A nombre can be reused after the original tunnel is soft-deleted.
- Q: Where is GET /admin/tuneles implemented? → A: In a dedicated AdminTunelesController (separate file, same pattern as previous modules). It is restricted to admin_global only and returns all non-deleted tunnels in the tenant without mandatory filters.
- Q: Does soft-deleting a tunnel check whether mesas still exist inside it? → A: No. The delete proceeds unconditionally. Mesas retain their tunel_id FK reference after the tunnel is soft-deleted — no cascade, no orphan cleanup, no pre-delete validation of mesa count.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create a Greenhouse Tunnel (Priority: P1)

A supervisor creates a new tunnel record for an establishment, providing a name and the maximum number of tables it can hold. The system validates uniqueness of the name within the establishment and persists the tunnel as active.

**Why this priority**: Core write path. All M08 Mesas functionality depends on tunnels existing. Creating tunnels is the foundational operation that unblocks the entire greenhouse table management workflow.

**Independent Test**: Can be fully tested by POSTing a new tunnel with a valid nombre and capacidad_maxima, then confirming the record is returned with activo=true and the correct establecimiento_id.

**Acceptance Scenarios**:

1. **Given** a supervisor is authenticated and an establishment exists in their tenant, **When** they POST a tunnel with a unique nombre and a positive capacidad_maxima, **Then** the tunnel is created with activo=true and the response returns the full tunnel record via ok().
2. **Given** a supervisor submits a tunnel with a nombre already used by an active tunnel in the same establishment and tenant, **When** the request is processed, **Then** the request is rejected with a conflict error indicating the name is already taken.
3. **Given** a supervisor submits a tunnel with a nombre already used by a soft-deleted tunnel in the same establishment, **When** the request is processed, **Then** the request is accepted — the uniqueness constraint only applies to non-deleted tunnels.
4. **Given** an operario (non-supervisor) is authenticated, **When** they attempt to POST a tunnel, **Then** the request is rejected with a 403 Forbidden.
5. **Given** a supervisor submits a tunnel referencing an establecimiento_id from a different tenant, **When** the request is processed, **Then** the request is rejected with a not-found error.

---

### User Story 2 — Update a Tunnel's Properties (Priority: P2)

A supervisor updates the name, capacity, or active status of an existing tunnel. The establishment link cannot be changed after creation.

**Why this priority**: Operational need. Tunnel names and capacities may change as the greenhouse is reorganized. Must be possible without recreating tunnels that already contain table history.

**Independent Test**: Can be tested by PATCHing nombre, capacidad_maxima, or activo on an existing tunnel and confirming only allowed fields change.

**Acceptance Scenarios**:

1. **Given** a supervisor is authenticated and a tunnel exists, **When** they PATCH nombre with a value unique in the establishment, **Then** the tunnel is updated and the response returns the updated record.
2. **Given** a supervisor PATCHes with a new nombre that conflicts with another active tunnel in the same establishment, **When** the request is processed, **Then** the request is rejected with a conflict error.
3. **Given** a supervisor PATCHes capacidad_maxima to a positive integer, **When** the request is processed, **Then** capacidad_maxima is updated successfully.
4. **Given** a supervisor includes establecimiento_id in the PATCH body, **When** the request is processed, **Then** the request is rejected — establecimiento_id is immutable after creation.
5. **Given** an operario is authenticated, **When** they attempt to PATCH a tunnel, **Then** the request is rejected with a 403 Forbidden.

---

### User Story 3 — Browse and Filter Tunnels (Priority: P2)

Any authenticated user can list tunnels paginated, filtered by establishment and active status, or search by name. They can also retrieve a single tunnel by ID.

**Why this priority**: Read path needed for M08 Mesas to select a target tunnel and for supervisors to review greenhouse layout. Delivers value independently once tunnels exist.

**Independent Test**: Can be tested by listing tunnels with establecimiento_id and activo filters and confirming correct pagination shape and results.

**Acceptance Scenarios**:

1. **Given** tunnels exist for a tenant, **When** an authenticated user GETs /tuneles with no filters, **Then** a paginated list of all tenant tunnels is returned.
2. **Given** tunnels exist for multiple establishments, **When** a user filters by establecimiento_id, **Then** only tunnels belonging to that establishment are returned.
3. **Given** active and inactive tunnels exist, **When** a user filters by activo=false, **Then** only inactive (but not deleted) tunnels are returned.
4. **Given** a user searches by nombre, **When** the query matches a partial name, **Then** only matching tunnels are returned.
5. **Given** a tunnel ID exists, **When** a user GETs /tuneles/:id, **Then** the full tunnel record is returned via ok().
6. **Given** a tunnel ID belongs to a different tenant, **When** a user requests it, **Then** a not-found error is returned.

---

### User Story 4 — Soft Delete a Tunnel (Priority: P3)

An admin_global soft-deletes a tunnel that is no longer in use. Tables (mesas) that were inside the tunnel are NOT deleted — historical data is preserved.

**Why this priority**: Low-frequency administrative cleanup. History preservation is more important than the delete action itself.

**Independent Test**: Can be tested by soft-deleting a tunnel and confirming it no longer appears in the default list but its ID still resolves in admin endpoints.

**Acceptance Scenarios**:

1. **Given** an admin_global is authenticated and a tunnel exists, **When** they DELETE /tuneles/:id, **Then** deleted_at is set and the tunnel no longer appears in standard list responses.
2. **Given** a supervisor (non-admin_global) is authenticated, **When** they attempt to DELETE a tunnel, **Then** the request is rejected with a 403 Forbidden.
3. **Given** a tunnel is soft-deleted, **When** a user attempts to GET /tuneles/:id (standard endpoint), **Then** the tunnel is not found.
4. **Given** a tunnel with associated mesas is soft-deleted, **When** the delete is processed, **Then** no mesas are deleted — their records remain intact.

---

### User Story 5 — Admin Panel Listing (Priority: P3)

An admin_global can view all tunnels across their tenant through the admin panel endpoint, including filtering and pagination.

**Why this priority**: Administrative oversight. Lower priority because it duplicates the standard list endpoint at an admin-scoped path.

**Independent Test**: Can be tested by calling GET /admin/tuneles as admin_global and confirming the paginated response matches the tenant's full tunnel inventory.

**Acceptance Scenarios**:

1. **Given** an admin_global is authenticated, **When** they GET /admin/tuneles, **Then** a paginated list of all tunnels in the tenant is returned.
2. **Given** a non-admin_global user is authenticated, **When** they GET /admin/tuneles, **Then** the request is rejected with a 403 Forbidden.

---

### Edge Cases

- What happens when capacidad_maxima is 0 or negative? The request is rejected with a validation error; only integers > 0 are accepted.
- What happens when nombre exceeds 100 characters? The request is rejected with a validation error.
- What if two concurrent POST requests submit the same nombre for the same establishment? The partial unique index (WHERE deleted_at IS NULL) on the database enforces uniqueness at the storage level; one request receives a conflict error.
- What if an operario tries to create or modify a tunnel? The request is rejected with 403 via RolesGuard before reaching service logic.
- What if establecimiento_id references an establishment deleted after tunnel creation? The tunnel record is preserved; no cascade. This is handled as orphaned data in future cleanup if needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow supervisors and admin_global to create tunnels within their tenant's establishments.
- **FR-002**: System MUST reject tunnel creation from operario or unauthenticated users with 403 Forbidden.
- **FR-003**: System MUST validate that the referenced establecimiento_id exists within the requesting user's tenant before creating a tunnel.
- **FR-004**: System MUST enforce nombre uniqueness scoped to (tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL via a partial unique index at the database level. A nombre may be reused after its original tunnel is soft-deleted.
- **FR-005**: System MUST reject PATCH requests that include establecimiento_id in the body with error code TUNEL_FIELD_IMMUTABLE, HTTP 400. Only nombre, capacidad_maxima, and activo are patchable fields.
- **FR-006**: System MUST reject capacidad_maxima values that are not positive integers (> 0).
- **FR-007**: System MUST reject nombre values that exceed 100 characters or are empty.
- **FR-008**: System MUST default activo to true on tunnel creation.
- **FR-009**: System MUST allow supervisors and admin_global to update nombre, capacidad_maxima, and activo on an existing tunnel.
- **FR-010**: System MUST allow all authenticated users to list tunnels (paginated, filterable by establecimiento_id and activo, searchable by nombre) and retrieve individual tunnels by ID. When ?activo is omitted, all non-deleted tunnels are returned — no default activo filter is applied.
- **FR-011**: System MUST soft-delete tunnels (set deleted_at) when DELETE /tuneles/:id is called by admin_global. Soft-deleted tunnels MUST NOT appear in standard list or getOne responses.
- **FR-012**: System MUST NOT cascade soft-delete to mesas and MUST NOT check whether mesas exist before soft-deleting a tunnel. The delete proceeds unconditionally. Mesas retain their tunel_id FK reference after the tunnel is soft-deleted — no orphan cleanup.
- **FR-013**: System MUST restrict DELETE /tuneles/:id to admin_global only; non-admin_global roles receive 403 Forbidden.
- **FR-014**: System MUST expose GET /admin/tuneles in a dedicated AdminTunelesController (separate file, same pattern as previous modules), restricted to admin_global only. The endpoint returns all non-deleted tunnels in the tenant paginated, without mandatory filters.
- **FR-015**: System MUST write audit records for all state-changing operations: tunel_created (POST), tunel_updated (PATCH), tunel_deleted (DELETE).
- **FR-016**: All endpoints MUST require JwtAuthGuard. All responses MUST use ok() and page() from the shared API response helpers.
- **FR-017**: establecimiento_id MUST be stored on the tunnel at creation time and never modified thereafter — the PATCH guard must reject any payload containing this field with TUNEL_FIELD_IMMUTABLE (HTTP 400).

### Key Entities

- **Tunel**: Represents a physical greenhouse tunnel. Belongs to an establishment within a tenant. Holds a name identifier (unique per establishment, non-deleted), a maximum table capacity (positive integer), and an active flag. Soft-deletable. Acts as a FIFO container for mesas (M08). Does not cascade deletes to mesas.
- **Establecimiento** (existing): The establishment entity that owns the tunnel. Referenced by establecimiento_id; validated at creation time. Module imported as dependency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Supervisors can create a fully configured tunnel in a single request with immediate persistence — no multi-step workflow required.
- **SC-002**: 100% of duplicate nombre attempts within the same establishment and tenant are rejected at the storage level, with no partial writes.
- **SC-003**: All authenticated users can retrieve a paginated tunnel list filtered by establishment or active status with no cross-tenant data leakage.
- **SC-004**: 100% of PATCH requests containing establecimiento_id are rejected — the immutability constraint is enforced on every update path.
- **SC-005**: Every create, update, and delete operation produces a corresponding audit record; zero operations complete without an audit trail.
- **SC-006**: Soft-deleting a tunnel produces zero side-effects on associated mesa records — mesa count before and after delete is identical.

## Assumptions

- EstablecimientosModule exports EstablecimientosService (or a repository accessor), making it injectable into TunelesModule for validation without circular dependency.
- The Tunel entity extends BaseEntity (which provides id, tenant_id, created_at, updated_at, deleted_at) consistent with all other domain entities in this project except MovimientoStock.
- Pagination follows the same conventions as existing modules (page/limit query params, page() response helper).
- The PATCH guard that rejects establecimiento_id is implemented as a check inside the service method (or DTO-level validation) before any database call, returning AppError with an appropriate ErrorCode.
- No approval workflow or capacity enforcement is required in this module; capacidad_maxima is metadata used by M08 for display/validation purposes.
- GET /admin/tuneles is implemented in a dedicated AdminTunelesController (separate file), following the same pattern as previous modules. RolesGuard restricts access to admin_global.
- Soft-deleted tunnels remain visible in admin endpoints only when explicitly supported (out of scope for this module unless specified by M08).
- TunelesModule is self-contained; no other existing module needs to be modified to implement it.
