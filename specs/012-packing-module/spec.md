# Feature Specification: M12 — Packing (Lote Packing)

**Feature Branch**: `013-packing-module`

**Created**: 2026-06-09

**Status**: Clarified

**Input**: User description: "Module M12 — Packing: records the packing result for a harvest. Each cosecha can have exactly ONE LotePacking with 1–3 category breakdowns."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register Packing Result for a Harvest (Priority: P1)

An operario, supervisor, or admin_global completes the field packing process after harvesting and needs to record the result: the gross weight of the batch and how it was categorized (primera, segunda, descarte) with box counts and net weight per box.

**Why this priority**: This is the core action of the module. Without it, no packing data exists and all read flows are empty.

**Independent Test**: Can be fully tested by submitting a packing record for an existing cosecha and verifying that it is stored with all category breakdowns, and that a duplicate submission is rejected.

**Acceptance Scenarios**:

1. **Given** an authenticated operario and a cosecha that has no packing record, **When** they submit packing data with a gross weight and one or more category breakdowns, **Then** the system records the packing batch and all category details and returns a 201 response.
2. **Given** a cosecha that already has a packing record, **When** any user tries to register packing again for the same cosecha, **Then** the system rejects the request with a conflict error (409).
3. **Given** an authenticated operario submitting packing data, **When** the cosecha does not belong to their tenant, **Then** the system rejects the request with a not-found or authorization error.
4. **Given** an authenticated guest/viewer role, **When** they try to register a packing record, **Then** the system rejects the request with an authorization error.

---

### User Story 2 — View Packing Record for a Harvest (Priority: P2)

A supervisor or any authenticated user needs to look up the packing details for a specific cosecha to review quality breakdown and yield.

**Why this priority**: Reading is the primary consumption path for packing data — used by supervisors for reporting and downstream operations.

**Independent Test**: Can be fully tested by querying the packing record by cosecha ID and verifying the returned data includes the category breakdowns.

**Acceptance Scenarios**:

1. **Given** a cosecha that has a packing record, **When** any authenticated user requests the packing for that cosecha, **Then** the system returns the full packing batch with all category breakdowns nested.
2. **Given** a cosecha that has no packing record, **When** any authenticated user requests the packing for that cosecha, **Then** the system returns a 404 response.

---

### User Story 3 — Browse All Packing Records (Priority: P3)

An admin or supervisor wants to list all packing records across cosechas, with optional filtering by a specific cosecha, to produce reports or spot-check records.

**Why this priority**: Supporting the operational overview; less critical than the creation and single-record lookup flows.

**Independent Test**: Can be fully tested by querying the packing list with and without a cosecha_id filter and verifying pagination works correctly.

**Acceptance Scenarios**:

1. **Given** multiple packing records exist, **When** an authenticated user requests the packing list, **Then** the system returns a paginated list of all packing records.
2. **Given** multiple packing records exist, **When** an authenticated user filters by a specific cosecha_id, **Then** the system returns only the packing record for that cosecha.

---

### Edge Cases

- What happens when `categorias` array is empty? → Rejected (at least 1 required).
- What happens when `categorias` has more than 3 items? → Rejected (max 3).
- What happens when `categorias` contains two entries with the same category type? → Rejected (no duplicate category values allowed).
- What happens when `peso_bruto_kg`, `peso_kg`, `cantidad_cajas`, or `peso_neto_por_caja` is zero or negative? → Rejected (all must be > 0).
- What happens if the creation partially fails mid-transaction? → The entire operation is rolled back; no partial record is persisted.
- What happens if packing is attempted for a cosecha from a different tenant? → Rejected with not-found error to prevent cross-tenant data leakage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow operarios, supervisors, and admin_global users to register a packing record for a cosecha.
- **FR-002**: The system MUST enforce that each cosecha has at most one packing record; a second registration attempt for the same cosecha MUST be rejected with a conflict error. Enforcement is dual: a uniqueness constraint at the storage level AND an explicit pre-creation check at the service layer that raises `PACKING_YA_REGISTRADO` (409).
- **FR-003**: Each packing record MUST include at least one and at most three category breakdowns (primera, segunda, descarte); no duplicate category types are allowed within a single record. Duplicate-category validation is enforced at the service layer before the creation transaction is opened.
- **FR-004**: The system MUST record the timestamp of packing automatically at the time of submission; users MUST NOT be able to supply or override the timestamp.
- **FR-005**: The system MUST capture the identity of the user who registered the packing from their authenticated session; users MUST NOT be able to supply a different user ID.
- **FR-006**: The packing record and all its category breakdowns MUST be persisted atomically — either all succeed or none are saved. The transaction sequence is: (1) pre-transaction uniqueness check, (2) insert packing batch, (3) insert all category records; any failure triggers a full rollback.
- **FR-007**: Packing records MUST be immutable after creation; no update or deletion is permitted.
- **FR-008**: The system MUST validate that the cosecha being packed belongs to the same tenant as the requesting user before allowing creation.
- **FR-009**: All authenticated users MUST be able to retrieve a single packing record by its ID, with category breakdowns included.
- **FR-010**: All authenticated users MUST be able to retrieve the packing record for a specific cosecha via a dedicated endpoint (`GET /cosechas/:id/packing`); the system MUST return a 404 (`PACKING_NOT_FOUND`) if no packing exists for that cosecha. This endpoint is owned by the packing module, not the cosecha module — consistent with the routing pattern used by prior modules (M09, M10, M11).
- **FR-011**: All authenticated users MUST be able to retrieve a paginated list of packing records, filterable by cosecha.
- **FR-012**: The system MUST write an audit record for every successful packing registration.

### Key Entities

- **LotePacking (Packing Batch)**: Represents the result of packing a single cosecha. Identified uniquely by the cosecha it belongs to. Captures gross weight, the registering user, optional notes, and the timestamp. One cosecha can have exactly one LotePacking.
- **LotePackingCategoria (Packing Category Breakdown)**: Represents one quality tier within a packing batch (primera, segunda, or descarte). Captures weight in kilograms, number of boxes, and net weight per box. A LotePacking has between one and three of these, each with a distinct category type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can register a complete packing record (batch + categories) in a single operation with no partial-save failures.
- **SC-002**: Any attempt to register a second packing record for the same cosecha is rejected 100% of the time with an informative conflict response.
- **SC-003**: Packing records are visible to all authenticated users immediately after creation, with category details fully included.
- **SC-004**: All invalid submissions (missing fields, out-of-range values, duplicate categories, unauthorized roles) are rejected with clear error responses — 0% silent acceptance of bad data.
- **SC-005**: All packing registrations generate an audit trail entry, achieving 100% audit coverage for this event type.

## Assumptions

- The cosecha module (M11) is already built and operational; CosechaService can validate that a cosecha exists and belongs to a given tenant.
- Roles `operario`, `supervisor`, and `admin_global` are already defined and enforced by the existing authentication infrastructure.
- The `fecha_hora` field is always set by the server at the moment of creation; there is no workflow requiring backdated entries.
- `observaciones` is a free-text optional field with no length restriction specified; a reasonable maximum (e.g., 1000 characters) will be applied as a default.
- Packing records are append-only; corrections require a new cosecha and new packing entry (or are handled out-of-band), not an in-place edit.
- Tenant isolation is enforced at the service layer by comparing the cosecha's tenant against the requesting user's tenant context.
- The `peso_bruto_kg` field represents the total gross weight of the batch and is independent of the sum of individual category weights (no cross-validation between them is required unless explicitly added later).
- Both `LotePacking` and `LotePackingCategoria` are plain entities with no shared base class and no soft-delete column; each has its own auto-generated UUID primary key.
- The packing service is a self-contained injectable service with no inheritance from shared CRUD base classes, keeping the implementation focused on packing-specific logic.
- The packing controller carries no URL prefix of its own; all routes are expressed as explicit full paths to maintain clarity and consistency with modules M09–M11.

## Clarifications

### Session 2026-06-09

- Q: Are `LotePacking` and `LotePackingCategoria` plain entities with no base class, no `deleted_at`, each with its own UUID primary key, and `LotePackingCategoria` carrying `lote_packing_id` as an explicit column? → A: Confirmed. Both are plain entities (no BaseEntity, no deleted_at). `LotePacking` has a UUID PK; `LotePackingCategoria` has a UUID PK and an explicit `lote_packing_id` FK column.
- Q: Does the creation transaction follow the pattern: (1) pre-transaction check for existing packing on the cosecha, (2) INSERT lote_packing, (3) INSERT all lote_packing_categoria records, with full rollback on any failure? → A: Confirmed. This QueryRunner-based pattern is the required approach.
- Q: Is `GET /cosechas/:id/packing` implemented inside `PackingController` (not `CosechaController`) using an explicit full-path route, returning the packing with categorias nested or 404 `PACKING_NOT_FOUND`, consistent with M09/M10/M11? → A: Confirmed. PackingController owns this route via explicit full path.
- Q: Is duplicate-category validation (no two entries with the same `categoria` value in the request) enforced at the service layer before opening the transaction, not solely at the DTO level? → A: Confirmed. Service-layer pre-transaction validation is required.
- Q: Is the uniqueness of `cosecha_id` enforced at both the database level (UNIQUE INDEX on `lotes_packing.cosecha_id`) and the service layer (findOne pre-check that throws `PACKING_YA_REGISTRADO` 409)? → A: Confirmed. Dual enforcement is required.
- Q: Is `PackingService` a plain `@Injectable()` (no `BaseCrudTenantService`), and does `PackingController` use `@Controller()` with no URL prefix? → A: Confirmed. Both apply.
