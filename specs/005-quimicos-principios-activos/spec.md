# Feature Specification: M05 — Quimicos y Principios Activos

**Feature Branch**: `005-quimicos-principios-activos`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module M05 — Quimicos y Principios Activos: manages chemical products used in greenhouse applications, each scoped to an establishment with current stock and multiple active principles from a global catalog."

## Clarifications

### Session 2026-06-04

- Q: Does GET /admin/quimicos include soft-deleted records? → A: No. The admin endpoint returns all non-deleted chemicals (both active and inactive) across all establishments within the admin_global's own tenant, with no activo or establecimiento_id filter required.
- Q: What happens when a principio_activo UUID in the create/update payload does not exist in the global catalog? → A: The entire request is rejected with a validation error that lists all unknown IDs. No partial linking is performed.
- Q: What is the semantics for principios_activos in PATCH? → A: If the array is provided (even if empty), existing links are fully replaced with the new list. If the field is omitted entirely from the body, existing links remain untouched.
- Q: Should stock_actual in the PATCH body be silently ignored or explicitly rejected? → A: Explicitly rejected with a QUIMICO_FIELD_IMMUTABLE 400 error (same as establecimiento_id). Silent ignore was considered but explicit rejection provides a clearer API contract.
- Q: Is the deletion of an unreferenced PrincipioActivo a hard delete or soft delete? → A: Hard delete. Referential check queries the join table; if any row links to the active principle, the request is rejected with a conflict error. If unreferenced, the record is permanently removed.
- Q: What is the exact PATCH guard for quimicos — which fields are allowed, and how are forbidden fields handled? → A: Allowed fields are nombre, unidad_medida, activo, and principios_activos. If establecimiento_id or stock_actual appears in the request body, the system rejects the request with a QUIMICO_FIELD_IMMUTABLE 400 error.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Browse and Find Chemicals (Priority: P1)

An authenticated user (any role) wants to see the list of chemicals available in a specific establishment. They can filter by active status and search by name to quickly find what they need. Each chemical shows its current stock and linked active principles.

**Why this priority**: Reading chemicals is the most frequent operation — users check stock and active principle data before planning any greenhouse application. All roles need this capability.

**Independent Test**: Can be fully tested by listing chemicals for an establishment, applying name search and active filter, and verifying paginated results with stock and active principles are returned.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they request the chemicals list for an establishment, **Then** they receive a paginated list of chemicals showing name, unit of measure, current stock, active status, and linked active principles.
2. **Given** an authenticated user, **When** they filter by active=true and search by partial name, **Then** only matching active chemicals are returned.
3. **Given** an authenticated user, **When** they request a single chemical by ID, **Then** they receive full detail including all associated active principles.
4. **Given** an unauthenticated request, **When** any chemical endpoint is accessed, **Then** access is denied.

---

### User Story 2 — Register a New Chemical (Priority: P2)

A supervisor or admin_global wants to register a new chemical product for an establishment, specifying its name, unit of measure, and which active principles it contains. The establishment association is permanent once set.

**Why this priority**: Before any chemical can be tracked or applied, it must be registered. Supervisors are the primary operators for day-to-day chemical management.

**Independent Test**: Can be fully tested by creating a chemical with a valid establishment, name, unit of measure, and a list of active principle IDs, then verifying it appears in the listing with correct data.

**Acceptance Scenarios**:

1. **Given** a supervisor or admin_global, **When** they create a chemical with valid name, unit of measure, establishment, and active principle IDs, **Then** the chemical is saved with stock starting at zero and the active principles are linked.
2. **Given** a supervisor or admin_global, **When** they try to create a chemical with the same name in the same establishment (active chemicals only), **Then** the system rejects the request with a uniqueness error.
3. **Given** an operario or admin (non-supervisor), **When** they attempt to create a chemical, **Then** access is denied.
4. **Given** a supervisor, **When** they create a chemical with no active principles, **Then** the chemical is created successfully with an empty active principles list.
5. **Given** a supervisor, **When** they include one or more principio_activo UUIDs that do not exist in the global catalog, **Then** the entire request is rejected with a validation error listing the unknown IDs.

---

### User Story 3 — Update Chemical Details (Priority: P2)

A supervisor or admin_global wants to update a chemical's name, unit of measure, or active status. They can also reassign which active principles the chemical contains by providing the new complete list. Attempts to modify immutable fields are explicitly rejected.

**Why this priority**: Chemical information changes over time — products get renamed, reformulated (new active principles), or deactivated. Supervisors must be able to keep records current.

**Independent Test**: Can be fully tested by updating a chemical's name and active principles list, then verifying the changes are reflected in the detail response while establishment remains unchanged.

**Acceptance Scenarios**:

1. **Given** a supervisor or admin_global, **When** they update a chemical's name or unit of measure, **Then** the changes are saved and reflected in subsequent reads.
2. **Given** a supervisor, **When** they send a new list of active principle IDs in PATCH, **Then** the chemical's linked active principles are fully replaced with the new list.
3. **Given** a supervisor, **When** they omit principios_activos from the PATCH body, **Then** the existing active principle links remain untouched.
4. **Given** a supervisor, **When** they include establecimiento_id or stock_actual in the PATCH body, **Then** the system rejects the request with a QUIMICO_FIELD_IMMUTABLE 400 error.
5. **Given** a supervisor, **When** they set activo=false on a chemical, **Then** the chemical is deactivated and no longer appears in default active listings.

---

### User Story 4 — Delete a Chemical (Priority: P3)

An admin_global wants to remove a chemical that is no longer used. The deletion is soft — the record is preserved for audit and historical traceability but the chemical no longer appears in standard or admin listings.

**Why this priority**: Deletion is infrequent and restricted to the highest privilege role. Data integrity and historical records must be preserved.

**Independent Test**: Can be fully tested by soft-deleting a chemical and verifying it no longer appears in the standard or admin listing while its audit trail is intact.

**Acceptance Scenarios**:

1. **Given** an admin_global, **When** they delete a chemical, **Then** it is soft-deleted and excluded from all listings including the admin endpoint.
2. **Given** a supervisor, **When** they attempt to delete a chemical, **Then** access is denied.
3. **Given** an admin_global, **When** they access the admin chemicals list, **Then** they see all non-deleted chemicals (both active and inactive) across all establishments in their tenant, with no filter constraints required.

---

### User Story 5 — Manage Active Principles Catalog (Priority: P2)

An admin_global wants to maintain the global catalog of active principles — creating new entries, updating names, and removing unused ones. This catalog is shared across all tenants and establishments.

**Why this priority**: The active principles catalog is foundational infrastructure for chemical registration. It must be accurate and up to date for supervisors to correctly register products.

**Independent Test**: Can be fully tested by creating a new active principle, updating its name, and verifying it appears in the global list accessible to all authenticated users.

**Acceptance Scenarios**:

1. **Given** an admin_global, **When** they create a new active principle with a unique name, **Then** it is added to the global catalog and immediately available for linking to chemicals.
2. **Given** an admin_global, **When** they try to create an active principle with a name that already exists, **Then** the request is rejected with a uniqueness error.
3. **Given** an admin_global, **When** they update an active principle's name, **Then** the new name is reflected across all chemicals that use it.
4. **Given** an admin_global, **When** they attempt to delete an active principle that is linked to at least one chemical, **Then** the request is rejected with a conflict error.
5. **Given** an admin_global, **When** they delete an active principle that is not linked to any chemical, **Then** it is permanently and irreversibly removed from the catalog.
6. **Given** any authenticated user, **When** they request the full active principles list, **Then** they receive the complete global catalog without pagination.

---

### Edge Cases

- What happens when a supervisor assigns active principle IDs that do not exist? The entire request is rejected with a validation error listing all unknown IDs; no chemical is created or updated.
- What happens when the same chemical name exists but the previous record is soft-deleted? A new chemical with the same name in the same establishment is allowed (uniqueness applies to non-deleted records only).
- What happens when establecimiento_id or stock_actual is included in a PATCH request? The system rejects the request with a QUIMICO_FIELD_IMMUTABLE 400 error; no update is applied.
- What happens when a chemical is soft-deleted but still has stock movements in M07/M08? The chemical record is preserved; historical references remain intact.
- What happens when an active principle is renamed? All chemicals linking to it reflect the new name immediately since it is stored by reference.
- What happens when principios_activos is provided as an empty array in PATCH? All existing active principle links are removed and the chemical is saved with an empty list.

## Requirements *(mandatory)*

### Functional Requirements

**Chemicals (Quimicos)**:

- **FR-001**: System MUST allow any authenticated user to retrieve a paginated list of chemicals, filterable by establishment and active status, and searchable by name.
- **FR-002**: System MUST allow any authenticated user to retrieve a single chemical by ID, with its full active principles list nested in the response.
- **FR-003**: System MUST allow supervisors and admin_global to create a new chemical, specifying name, unit of measure, establishment, and an optional list of active principle IDs.
- **FR-004**: System MUST enforce that chemical names are unique per establishment for non-deleted records.
- **FR-005**: System MUST initialize stock at zero for every newly created chemical; stock cannot be set at creation time.
- **FR-006**: System MUST keep the establishment association of a chemical immutable after creation.
- **FR-007**: System MUST allow supervisors and admin_global to update a chemical's name, unit of measure, active status, and active principles list. Only the fields nombre, unidad_medida, activo, and principios_activos are accepted; any other field in the request body is rejected.
- **FR-008**: System MUST reject any PATCH request that includes establecimiento_id or stock_actual in the body with a QUIMICO_FIELD_IMMUTABLE 400 error.
- **FR-009**: System MUST replace all existing active principle links when principios_activos is provided in a PATCH request (full replacement semantics). When principios_activos is omitted, existing links are preserved unchanged.
- **FR-010**: System MUST validate that all principio_activo UUIDs provided on create or update exist in the global catalog; if any are unknown, the entire request is rejected with a validation error listing the missing IDs.
- **FR-011**: System MUST allow admin_global to soft-delete a chemical; deleted chemicals are excluded from all listings including the admin endpoint.
- **FR-012**: System MUST provide an admin-only endpoint that lists all non-deleted chemicals (active and inactive) across all establishments in the admin_global's tenant, with no mandatory filter constraints.
- **FR-013**: System MUST write an audit record for every create, update, and delete operation on chemicals.

**Active Principles (Principios Activos)**:

- **FR-014**: System MUST allow any authenticated user to retrieve the full global active principles catalog in a single unpaginated response.
- **FR-015**: System MUST allow admin_global to create new active principles with globally unique names.
- **FR-016**: System MUST allow admin_global to update the name of an existing active principle.
- **FR-017**: System MUST prevent deletion of an active principle that is referenced by at least one chemical, rejecting the request with a conflict error.
- **FR-018**: System MUST allow admin_global to permanently and irreversibly delete an active principle only when it is not referenced by any chemical.
- **FR-019**: System MUST write an audit record for every create, update, and delete operation on active principles.

**Cross-cutting**:

- **FR-020**: All endpoints MUST require a valid authentication token; unauthenticated requests must be rejected.
- **FR-021**: All chemical data MUST be scoped to the requesting tenant; cross-tenant data access MUST be prevented.
- **FR-022**: Active principles are global (no tenant scope); all tenants share the same catalog.

### Key Entities

- **Chemical (Quimico)**: Represents a chemical product used in greenhouse applications. Belongs to one establishment within a tenant. Tracks current stock (read-only from this module), unit of measure, active status, and a list of active principles. Soft-deletable. Allowed update fields: nombre, unidad_medida, activo, principios_activos.
- **Active Principle (PrincipioActivo)**: A globally shared catalog entry representing an active ingredient. Has a globally unique name. Not tenant-scoped. Can be linked to many chemicals across all tenants. Hard-deleted (permanently) when unreferenced; deletion blocked when referenced by any chemical.
- **Chemical–Active Principle Link (QuimicoPrincipioActivo)**: A many-to-many relationship between a chemical and active principles. Managed as a full replacement list on create/update when the principios_activos field is provided. No additional attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any authenticated user can retrieve the chemical list for an establishment in under 1 second under normal load.
- **SC-002**: Supervisors can register a new chemical, including active principle assignment, in a single request without additional round trips.
- **SC-003**: The active principles catalog is fully accessible to all authenticated users without requiring role escalation.
- **SC-004**: 100% of create, update, and delete actions on chemicals and active principles produce an audit record.
- **SC-005**: Deleting an active principle referenced by any chemical is rejected 100% of the time without data corruption.
- **SC-006**: PATCH requests including stock_actual or establecimiento_id are rejected 100% of the time with an explicit error; stock values are never modified by this module.
- **SC-007**: Cross-tenant chemical data leakage is prevented in 100% of requests.
- **SC-008**: PATCH requests containing unknown principio_activo UUIDs are rejected 100% of the time; no partial linking is performed.

## Assumptions

- The establishment referenced by `establecimiento_id` at creation time is assumed to exist and belong to the same tenant; referential validation against M01 (Establecimientos) is handled at the service layer.
- Unit of measure is free text; no validation against a predefined list is required.
- Active principles are provided as an array of UUIDs on create and update; name-based lookup is not in scope for the first iteration.
- Stock management (M07 — MovimientoStock and M08 — chemical applications) will interact with this module only via service-level stock adjustment methods; this module does not implement those methods.
- The admin listing endpoint (`GET /admin/quimicos`) shows all non-deleted chemicals (active and inactive) within the admin_global's tenant across all establishments; it does not cross tenant boundaries.
- Pagination defaults (page size, max page size) follow the same conventions established in M01–M04.
- Soft-deleted chemicals remain accessible in historical stock movement records managed by M07/M08.
