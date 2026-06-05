# Feature Specification: M01 — Establecimientos

**Feature Branch**: `001-establecimientos`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Module: M01 — Establecimientos\n\nThis is the first domain module for agrisano-backend, a greenhouse management system built on the Innoview NestJS + TypeORM + PostgreSQL template.\n\nCONTEXT: The template already has auth, users, admin, audit, files, tenancy, _shared modules, and common infrastructure including BaseCrudTenantService, BaseCrudController, BaseEntity, AppError, ErrorCodes, JwtAuthGuard, RolesGuard, AuditService, TenancyService.\n\nWHAT TO BUILD: A module called \"establecimientos\" (src/modules/establecimientos/) that manages physical greenhouse establishments. Each establishment belongs to a tenant (tenant_id required). A tenant can have multiple establishments.\n\nENTITY FIELDS: - id (uuid, primary key, inherited from BaseEntity) - tenant_id (uuid, inherited from BaseEntity, required) - nombre (string, required) - ubicacion (string, optional) - activo (boolean, default true) - created_at, updated_at (inherited from BaseEntity)\n\nROLE SEED (include in this module's setup): The system requires 3 new roles to be seeded alongside the existing \"admin\" role: - operario (daily greenhouse operations: register seedings, applications, harvests) - supervisor (everything operario can + manage chemicals, recipes, tables, tunnels) - admin_global (everything + manage users and establishments across all establishments of a tenant)\n\nUSER-ESTABLISHMENT RELATIONSHIP: Users can be assigned to one or more establishments within a tenant. A join table (usuario_establecimiento) is needed with: user_id, establecimiento_id, assigned_at. This is managed by admin_global only.\n\nACCESS RULES: - admin_global: full CRUD on establishments + user assignments, sees ALL establishments in the tenant - supervisor: read-only on their assigned establishments, cannot create/delete - operario: read-only on their single assigned establishment - All endpoints require authenticated access - Create/update/delete require the admin_global role - Audit required on: create, update, deactivate (activo=false), delete, user assignment changes\n\nAPI ENDPOINTS: - GET /establecimientos — list (paginated, filterable by activo, searchable by nombre) - GET /establecimientos/:id — get one - POST /establecimientos — create (admin_global only) - PATCH /establecimientos/:id — update (admin_global only) - DELETE /establecimientos/:id — soft delete (admin_global only) - POST /establecimientos/:id/usuarios/:userId — assign user to establishment (admin_global only) - DELETE /establecimientos/:id/usuarios/:userId — remove user from establishment (admin_global only) - GET /establecimientos/:id/usuarios — list users of an establishment (admin_global, supervisor) - GET /admin/establecimientos — admin panel list with full details\n\nBUSINESS RULES: - A user with role admin_global sees all establishments in the tenant - A user with role supervisor or operario only sees establishments they are assigned to - Deactivating an establishment (activo=false) does not delete it — it becomes invisible to operarios and supervisors but remains for audit purposes - tenant_id is set automatically from TenancyService, never from request body - Cannot assign a user from a different tenant to an establishment\n\nRESPONSE FORMAT: All responses use ok() and page() helpers from src/common/http/api-response.ts. Never return raw entities.\n\nAUDIT: Write audit events via AuditService for: establishment created, establishment updated, establishment deactivated, user assigned, user removed."

## Clarifications

### Session 2026-06-04

- Q: When an establishment is deactivated (activo=false) while users remain assigned, what happens to assignments? → A: Users stay assigned; no cascade removal of assignments. The establishment is excluded from supervisor/operario listings but assignment records are preserved.
- Q: When a supervisor or operario requests an establishment they are not assigned to, what HTTP status is returned? → A: 404 Not Found (not 403 Forbidden), to avoid revealing the existence of establishments outside their assigned scope.
- Q: Must the role seed be idempotent across multiple runs? → A: Yes — the seed uses INSERT ... ON CONFLICT DO NOTHING or equivalent; re-running never creates duplicates or raises errors.
- Q: Does the usuario_establecimiento join table require a UNIQUE constraint on (user_id, establecimiento_id)? → A: Yes — a UNIQUE constraint on (user_id, establecimiento_id) is required in the entity and migration to prevent duplicate assignments.
- Q: Do admin_global users need to be present in usuario_establecimiento to access establishments? → A: No — admin_global sees ALL establishments in their tenant without requiring assignment records in usuario_establecimiento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage establishments as admin_global (Priority: P1)

An admin_global user manages tenant establishments, including creating, updating, deactivating, and deleting establishments.

**Why this priority**: This delivers the core establishment management capability required for greenhouse administration.

**Independent Test**: Verify an admin_global user can create an establishment, update its details, deactivate it, and delete it while audit records are written.

**Acceptance Scenarios**:

1. **Given** an authenticated admin_global user, **when** they submit a valid create request, **then** a new establishment is created for the tenant and an audit event is recorded.
2. **Given** an authenticated admin_global user, **when** they patch an existing establishment, **then** the establishment updates and an audit event is recorded.
3. **Given** an authenticated admin_global user, **when** they deactivate an establishment, **then** the establishment remains in the system with activo=false and an audit event is recorded.
4. **Given** an authenticated admin_global user, **when** they delete an establishment, **then** the establishment is soft deleted and an audit event is recorded.

---

### User Story 2 - View assigned establishments as supervisor (Priority: P2)

A supervisor user reads the list and details of establishments they are assigned to.

**Why this priority**: Supervisors need transparent access to their assigned greenhouse locations without edit privileges.

**Independent Test**: Verify a supervisor can list assigned establishments and view details of an assigned establishment, but cannot create or delete.

**Acceptance Scenarios**:

1. **Given** an authenticated supervisor assigned to one or more establishments, **when** they request the list endpoint, **then** they see only their assigned establishments.
2. **Given** an authenticated supervisor, **when** they request a single assigned establishment, **then** they receive its details.
3. **Given** an authenticated supervisor, **when** they request an establishment they are not assigned to, **then** the system returns 404 Not Found (not 403) to avoid revealing unassigned establishment existence.
4. **Given** an authenticated supervisor, **when** they attempt create or delete operations, **then** the request is rejected.

---

### User Story 3 - View assigned establishment as operario (Priority: P3)

An operario user reads the details of their single assigned establishment.

**Why this priority**: Operarios need simple read access to the greenhouse where they perform daily operations.

**Independent Test**: Verify an operario can access only their assigned establishment and cannot access unassigned establishments.

**Acceptance Scenarios**:

1. **Given** an authenticated operario assigned to one establishment, **when** they request the list endpoint, **then** they receive only that establishment.
2. **Given** an authenticated operario, **when** they request an establishment they are not assigned to, **then** the system returns 404 Not Found (not 403) to avoid revealing unassigned establishment existence.

---

### User Story 4 - Manage establishment assignments as admin_global (Priority: P2)

An admin_global user assigns and removes users from establishments.

**Why this priority**: Assignment management is required to enforce access rules for supervisors and operarios.

**Independent Test**: Verify an admin_global can assign and remove users to/from establishments and that audit records are created.

**Acceptance Scenarios**:

1. **Given** an authenticated admin_global user, **when** they assign a user to an establishment, **then** the assignment is created and an audit event is recorded.
2. **Given** an authenticated admin_global user, **when** they remove a user from an establishment, **then** the assignment is removed and an audit event is recorded.
3. **Given** an authenticated admin_global user, **when** they view users for an establishment, **then** they receive the assigned user list.

### Edge Cases

- **Deactivation with assigned users**: When an establishment is deactivated (activo=false), existing assignment records in usuario_establecimiento are preserved without cascade removal. The establishment is excluded from supervisor and operario listings but all assignments remain intact and become active again if the establishment is reactivated.
- **Cross-tenant assignment attempt**: The system rejects assignment of a user from a different tenant than the establishment with an appropriate error; tenant_id is always derived from TenancyService and never from the request body.
- **Empty paginated results**: When filters return no establishments (e.g., no active establishments match the nombre search), the listing endpoint returns a successful paginated response with an empty items array.
- **Unassigned establishment access (supervisor/operario)**: Returns 404 Not Found rather than 403 Forbidden to prevent information leakage about establishments outside the user's assigned scope.
- **Duplicate assignment attempt**: The UNIQUE constraint on (user_id, establecimiento_id) in usuario_establecimiento prevents duplicate assignments at the database level; the service layer must handle this constraint violation and return an appropriate error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an admin_global user to create a tenant-bound establishment with required nombre and optional ubicacion.
- **FR-002**: The system MUST allow an admin_global user to update an establishment’s nombre, ubicacion, and activo flag.
- **FR-003**: The system MUST allow an admin_global user to soft delete an establishment without removing audit history.
- **FR-004**: The system MUST allow an admin_global user to assign a tenant user to an establishment.
- **FR-005**: The system MUST allow an admin_global user to remove a user from an establishment.
- **FR-006**: The system MUST allow supervisors to list and view only establishments to which they are assigned; requests for any unassigned establishment MUST return 404 Not Found.
- **FR-007**: The system MUST allow operarios to list and view only their assigned establishment; requests for any unassigned establishment MUST return 404 Not Found.
- **FR-008**: The system MUST prevent assignment of a user to an establishment belonging to a different tenant.
- **FR-009**: The establishment listing endpoint MUST support pagination, filtering by activo, and searching by nombre.
- **FR-010**: All endpoints MUST require authenticated access and enforce role-based permissions for create/update/delete and assignment actions.
- **FR-011**: All API responses MUST use established response wrappers and never return raw entity payloads.
- **FR-012**: The system MUST write audit events for establishment creation, update, deactivation, deletion, user assignment, and user removal.
- **FR-013**: The implementation MUST seed new roles operario, supervisor, and admin_global without removing the existing admin role. The seed MUST be idempotent — using INSERT ... ON CONFLICT DO NOTHING or equivalent — so that re-running it never creates duplicates or raises errors.
- **FR-014**: The usuario_establecimiento join table MUST enforce a UNIQUE constraint on (user_id, establecimiento_id) at the database level to prevent duplicate assignments.
- **FR-015**: admin_global users MUST see ALL establishments within their tenant without requiring an entry in usuario_establecimiento. Assignment records are only required for supervisors and operarios.

### Key Entities *(include if feature involves data)*

- **Establishment**: Represents a greenhouse location belonging to a tenant with `nombre`, `ubicacion`, `activo`, and tenant ownership.
- **User Establishment Assignment**: Represents a many-to-many relationship between a tenant user and an establishment, stored in the `usuario_establecimiento` join table with fields (user_id, establecimiento_id, assigned_at). A UNIQUE constraint on (user_id, establecimiento_id) prevents duplicate assignments. Only required for supervisors and operarios — admin_global users are not required to have entries here.
- **User**: Existing tenant user identity that can be linked to one or more establishments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin_global users can complete establishment creation and update flows successfully in the same tenant.
- **SC-002**: Supervisors access only their assigned establishments and cannot see unassigned ones.
- **SC-003**: Operarios access only their single assigned establishment and cannot access others.
- **SC-004**: The establishment list supports pagination and returns filtered results by activo and nombre.
- **SC-005**: Audit events are created for all required establishment lifecycle and assignment operations.
- **SC-006**: Role seeding adds operario, supervisor, and admin_global without removing the existing admin role.

## Assumptions

- Tenant context is available for requests and is applied automatically to establishment operations.
- The template’s existing auth and role system support role-based access controls in this module.
- `admin_global` users manage assignments and establishments for their tenant only, and see ALL establishments in their tenant without needing a record in `usuario_establecimiento`.
- Supervisors and operarios access establishments only through their assignment records; requests for unassigned establishments return 404 Not Found, not 403 Forbidden.
- Deactivating an establishment (activo=false) preserves all assignment records without cascade removal; assignments remain intact and become effective again if the establishment is reactivated.
- A soft delete retains data for audit and tenant review, but excludes the establishment from operario and supervisor listings.
