# Feature Specification: M04 — Recetas (Nursery Recipes)

**Feature Branch**: `004-recetas`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module: M04 — Recetas (Nursery Recipes) — manages nursery recipe references. A recipe is a simple label/protocol name that operarios select when registering chemical applications in nursery. It does NOT define steps — the actual chemical detail is recorded in each AplicacionQuimica (M08). Recipes are scoped to an establishment."

## Clarifications

### Session 2026-06-04

- Q: Is `establecimiento_id` immutable after creation — must a PATCH body containing it be rejected with a validation error (same strict rejection pattern as M03 PATCH)? → A: Yes — `establecimiento_id` is immutable after creation. Any PATCH body that includes `establecimiento_id` must be rejected with a validation error. Extra fields are never silently stripped.
- Q: Is uniqueness of `nombre` scoped to `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` — a partial unique index, same pattern as M02 lotes? → A: Yes — uniqueness is scoped to `(tenant_id, establecimiento_id, nombre)` with a partial index excluding soft-deleted records. A soft-deleted recipe's nombre does not block creation of a new recipe with the same nombre in the same establishment.
- Q: Does `GET /recetas` without `?activo` filter return ALL recipes (both `activo=true` and `activo=false`) — i.e., no default active-only filter? → A: Yes — `GET /recetas` with no `activo` filter returns all non-deleted recipes regardless of `activo` status. Callers must explicitly pass `?activo=true` or `?activo=false` to filter.
- Q: Should deletion of a recipe referenced by future AplicacionQuimica records (M08, not yet built) be blocked in M04? → A: No — M04 does not block deletion based on M08 references. A forward-compatibility check may be added in M08 following the same pattern used in M02 lotes (`LOTE_REFERENCED_BY_BANDEJA`).
- Q: Is `GET /admin/recetas` restricted to admin_global only and does it return active + inactive (but not soft-deleted) recipes? → A: Yes — `GET /admin/recetas` is admin_global only and returns all non-deleted tenant recipes (both `activo=true` and `activo=false`). Soft-deleted records are excluded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage the recipe catalog as supervisor or admin_global (Priority: P1)

A supervisor or admin_global registers a new recipe name for a specific establishment, making it available for operarios to select during chemical applications. They can also view the full recipe detail after creation.

**Why this priority**: Recipes are a prerequisite for chemical application records (M08). Without at least one recipe in the system, operarios cannot register any chemical application. Creating and reading recipes is the core value of this module.

**Independent Test**: Verify that a supervisor can create a recipe for a specific establishment and immediately retrieve it by ID, receiving the full record including establishment association.

**Acceptance Scenarios**:

1. **Given** an authenticated supervisor, **when** they submit a create-recipe request with a valid establishment and a unique nombre, **then** the recipe is created with `activo = true` and the response includes the full recipe record.
2. **Given** an authenticated supervisor, **when** they submit a create-recipe request with a nombre that already exists for the same establishment (and is not deleted), **then** the request is rejected with a conflict error.
3. **Given** an authenticated operario, **when** they attempt to create a recipe, **then** the request is rejected with a permission error.
4. **Given** an authenticated supervisor, **when** they submit a create-recipe request referencing an establishment outside their tenant, **then** the request is rejected with a not-found error.
5. **Given** an unauthenticated user, **when** they attempt to create a recipe, **then** the request is rejected with an authentication error.
6. **Given** an authenticated supervisor, **when** they retrieve a recipe by ID, **then** the full recipe record is returned.

---

### User Story 2 - Browse and search the recipe catalog as any authenticated user (Priority: P2)

Any authenticated user can list and search available recipes, optionally filtering by establishment or active status. This is the primary daily use case for operarios who need to select a recipe when logging a chemical application.

**Why this priority**: Every chemical application (M08) requires selecting a recipe. Operarios must be able to browse the catalog quickly by establishment.

**Independent Test**: Verify that an operario can list recipes for a specific establishment, search by name, and filter by active status — all returning correctly paginated results.

**Acceptance Scenarios**:

1. **Given** an authenticated operario, **when** they list recipes with no filters, **then** they receive a paginated list of all non-deleted recipes (both active and inactive) for their tenant.
2. **Given** an authenticated operario, **when** they filter by `establecimiento_id`, **then** only recipes belonging to that establishment are returned.
3. **Given** an authenticated operario, **when** they filter by `activo=true`, **then** only active recipes are returned; when they filter by `activo=false`, **then** only inactive recipes are returned.
4. **Given** an authenticated operario, **when** they search by `q=herb`, **then** only recipes whose nombre matches the search term are returned.
5. **Given** an authenticated operario, **when** they retrieve a single recipe by ID, **then** the full record is returned.
6. **Given** an authenticated admin_global, **when** they access the admin recipe list, **then** they receive a paginated list of all non-deleted tenant recipes (active and inactive).

---

### User Story 3 - Update recipe details as supervisor or admin_global (Priority: P3)

A supervisor or admin_global can update the nombre, descripcion, and activo status of an existing recipe. Renaming is allowed as long as the new nombre does not conflict with another non-deleted recipe in the same establishment. The establishment association cannot be changed after creation.

**Why this priority**: Occasional correction of recipe names or deactivating outdated recipes is a maintenance operation that supports catalog hygiene.

**Independent Test**: Verify that a supervisor can update a recipe's nombre and activo flag, that duplicate-nombre conflicts are rejected, that `establecimiento_id` in the PATCH body is rejected, and that an operario cannot update.

**Acceptance Scenarios**:

1. **Given** an authenticated supervisor, **when** they PATCH a recipe with a new valid nombre, **then** the nombre is updated and an audit event is recorded.
2. **Given** an authenticated supervisor, **when** they PATCH a recipe with a nombre that already exists for the same establishment (excluding the current recipe, and not soft-deleted), **then** the request is rejected with a conflict error.
3. **Given** an authenticated supervisor, **when** they PATCH a recipe's `activo` to `false`, **then** the recipe is marked inactive and remains retrievable.
4. **Given** an authenticated supervisor, **when** their PATCH body contains `establecimiento_id` (or any other immutable field), **then** the request is rejected with a validation error — immutable fields are never silently stripped.
5. **Given** an authenticated operario, **when** they attempt to PATCH a recipe, **then** the request is rejected with a permission error.

---

### User Story 4 - Delete a recipe as admin_global (Priority: P3)

An admin_global can soft-delete a recipe, removing it from all listings. The recipe record is preserved in the database for historical traceability.

**Why this priority**: Deletion is an infrequent administrative action. Data integrity is maintained through soft-delete semantics.

**Independent Test**: Verify that admin_global can soft-delete a recipe and that it no longer appears in any listing (including with `activo=false`), and that a supervisor cannot delete.

**Acceptance Scenarios**:

1. **Given** an authenticated admin_global, **when** they delete a recipe, **then** the recipe is soft-deleted, an audit event is recorded, and the recipe no longer appears in any listing (soft-deleted records are excluded from all queries).
2. **Given** an authenticated supervisor, **when** they attempt to delete a recipe, **then** the request is rejected with a permission error.
3. **Given** an authenticated admin_global, **when** they delete a recipe and then recreate a recipe with the same nombre for the same establishment, **then** the creation succeeds (soft-deleted records do not block uniqueness).

---

### Edge Cases

- **Duplicate nombre**: Creating or renaming a recipe to a nombre that already exists for the same establishment (and is not soft-deleted) must be rejected. The uniqueness check is scoped to `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL`.
- **Soft-deleted nombre reuse**: A nombre used by a soft-deleted recipe can be reused for a new recipe in the same establishment.
- **Cross-tenant establishment**: Referencing an establishment that belongs to a different tenant must be rejected.
- **Inactive recipe visibility**: An inactive (`activo = false`) recipe appears in `GET /recetas` when no `activo` filter is applied (no default active-only filter). Callers must explicitly pass `?activo=true` to restrict results to active recipes.
- **`establecimiento_id` in PATCH body**: Any PATCH request that includes `establecimiento_id` (or other immutable fields) must be rejected with a validation error — not silently stripped.
- **Empty search**: A search with an empty `q` parameter returns the full paginated list (same as no search filter).
- **Admin panel access**: Only admin_global can access `GET /admin/recetas`; other roles receive a permission error. The admin endpoint returns all non-deleted tenant recipes (both `activo=true` and `activo=false`).
- **M08 reference at deletion**: Deletion of a recipe referenced by future chemical application records (M08) is NOT blocked in M04; a forward-compatibility guard may be added in M08.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow a supervisor or admin_global to create a recipe for a specific establishment, providing a unique nombre and optional descripcion.
- **FR-002**: A recipe's nombre MUST be unique per establishment within the same tenant among non-deleted recipes, scoped to `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL`; duplicate nombress for the same establishment MUST be rejected with a conflict error.
- **FR-003**: The establishment referenced in a create request MUST belong to the same tenant as the authenticated user; cross-tenant references MUST be rejected.
- **FR-004**: Recipes MUST be scoped to the authenticated user's tenant; no recipe from another tenant may appear in any listing or be retrieved by ID.
- **FR-005**: All authenticated users (operario, supervisor, admin_global) MUST be able to list and retrieve recipes for their tenant.
- **FR-006**: The recipe listing MUST support filtering by `establecimiento_id` and `activo` status, and text search by `nombre`.
- **FR-007**: The listing MUST return all non-deleted recipes when no `activo` filter is provided — both `activo=true` and `activo=false` records are included by default. Callers must explicitly pass `?activo=true` or `?activo=false` to filter by status.
- **FR-008**: Newly created recipes MUST default to `activo = true`.
- **FR-009**: The system MUST allow a supervisor or admin_global to update a recipe's `nombre`, `descripcion`, and/or `activo` status. The `establecimiento_id` field is immutable after creation — any PATCH body containing `establecimiento_id` MUST be rejected with a validation error. Immutable fields are never silently stripped.
- **FR-010**: The system MUST allow admin_global to soft-delete a recipe; the record must be preserved in the database and excluded from all subsequent listings.
- **FR-011**: After soft-deletion, the recipe's nombre MUST become available for reuse in the same establishment; soft-deleted records do not block uniqueness checks.
- **FR-012**: The system MUST write audit events for recipe creation, update, and deletion.
- **FR-013**: An admin_global-only list endpoint (`GET /admin/recetas`) MUST return all non-deleted tenant recipes (both `activo=true` and `activo=false`) with full pagination support. Soft-deleted records are excluded.

### Key Entities

- **Receta (Recipe)**: A named protocol reference scoped to a specific establishment and tenant. Contains a required nombre (unique per establishment among non-deleted records), optional descripcion, and an active flag. Used by chemical application records as a selection reference. Has no steps or procedure details — those belong to the application record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Supervisors can create a recipe in a single request and immediately retrieve it by ID with the correct establishment association.
- **SC-002**: Operarios can list and search recipes filtered by establishment, receiving correctly paginated results — both active and inactive recipes appear when no `activo` filter is applied.
- **SC-003**: Duplicate-nombre conflicts within the same establishment are consistently rejected before any record is written.
- **SC-004**: Soft-deleted recipes do not appear in any listing (including with `?activo=false`); the nombre becomes available for reuse immediately after deletion.
- **SC-005**: Audit events are created for every recipe creation, update, and deletion.
- **SC-006**: No recipe from one tenant is ever visible to users of a different tenant.
- **SC-007**: A soft-deleted recipe's nombre can be reused in a new recipe for the same establishment without conflict.

## Assumptions

- Tenant context is available for all requests and applied automatically via existing middleware.
- `establecimiento_id` is provided by the caller in the request body for create; it cannot be changed after creation and any PATCH body containing it is rejected.
- The uniqueness constraint on `nombre` per `establecimiento_id` applies only to non-deleted records (partial index semantics: `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL`).
- Recipes will be referenced by chemical application records (M08) in the future; M04 does not enforce a deletion guard for M08 references — a forward-compatibility check may be added in M08 following the same try/catch pattern used in M02 lotes.
- The `GET /admin/recetas` endpoint returns all non-deleted tenant recipes (both active and inactive) with no additional scope restrictions beyond tenant isolation.
- No pagination limit changes from the existing standard (max 200 items per page).
- `descripcion` is free-text with no application-level length limit beyond database constraints.
