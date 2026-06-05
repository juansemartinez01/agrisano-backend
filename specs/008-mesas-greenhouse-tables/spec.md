# Feature Specification: M08 — Mesas (Greenhouse Tables)

**Feature Branch**: `009-mesas-greenhouse-tables`

**Created**: 2026-06-05

**Status**: Clarified

**Input**: User description: "Module M08 — Mesas (Greenhouse Tables) — physical growing tables with QR codes, FIFO tunnel positioning, and complete event history"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Register and Locate a New Growing Table (Priority: P1)

A supervisor registers a new physical growing table in the system by specifying the greenhouse establishment and the tunnel where it will be placed. The system automatically generates a unique QR code label for the physical table, assigns it the next available position in that tunnel's FIFO queue, and marks it as active.

**Why this priority**: Creating tables is the foundational action that seeds all downstream workflows (transplanting, chemical applications, harvest). Without registered tables, no growing activity can be tracked.

**Independent Test**: Can be fully tested by creating a table via the management interface and verifying it appears in the tunnel's table list at the correct FIFO position with a unique QR code assigned.

**Acceptance Scenarios**:

1. **Given** a supervisor is authenticated and a tunnel exists in an establishment, **When** they submit a new table creation request with a valid tunnel assignment, **Then** the system creates the table with estado=activa, assigns posicion_actual = MAX(existing positions) + 1 in that tunnel, generates a globally unique codigo_qr, and returns the complete table record.
2. **Given** a tunnel currently has no tables, **When** a supervisor creates the first table in that tunnel, **Then** the table receives posicion_actual = 1.
3. **Given** a tunnel already has tables at positions 1–5, **When** a supervisor creates a new table in that tunnel, **Then** the new table receives posicion_actual = 6.
4. **Given** a user without supervisor or admin_global role is authenticated, **When** they attempt to create a table, **Then** the request is rejected with an authorization error.

---

### User Story 2 — Scan a QR Code to Identify a Table (Priority: P1)

A field worker scans a QR code label attached to a physical growing table using a mobile device. The system returns the table's current status, tunnel position, establishment, and key attributes so the worker can proceed with the appropriate operation (transplant, chemical application, harvest).

**Why this priority**: QR scanning is the primary way field workers interact with individual tables in the greenhouse. All field operations start with this lookup.

**Independent Test**: Can be fully tested by scanning (or manually providing) a codigo_qr value and confirming the response contains the correct table details including tunnel information.

**Acceptance Scenarios**:

1. **Given** a valid codigo_qr value, **When** an authenticated user queries by QR code, **Then** the system returns the full table record with nested tunnel information (tunnel name, maximum capacity) and current FIFO position.
2. **Given** an unknown codigo_qr value, **When** an authenticated user queries by QR code, **Then** the system returns a not-found error.

---

### User Story 3 — View All Tables in a Tunnel (Priority: P2)

A supervisor or worker views the ordered list of growing tables assigned to a specific tunnel, displayed from position 1 (top of FIFO queue, oldest transplant) to the last position. This gives the team visibility into which tables are due for harvest first.

**Why this priority**: Tunnel-level visibility drives daily harvest prioritization; without it, teams cannot determine FIFO order.

**Independent Test**: Can be fully tested by querying a tunnel's table list and verifying the results are sorted by posicion_actual ascending, with tables in en_cosecha or baja estado having NULL positions excluded from the ordered list.

**Acceptance Scenarios**:

1. **Given** a tunnel with multiple active tables, **When** an authenticated user requests the tunnel's table list, **Then** the system returns tables ordered by posicion_actual ascending (position 1 first), excluding tables with NULL positions.
2. **Given** a tunnel with a mix of active, en_cosecha, and baja tables, **When** an authenticated user requests the tunnel's list, **Then** only tables with a non-null posicion_actual are shown in the ordered view.

---

### User Story 4 — Retire a Table (Dar de Baja) (Priority: P2)

A supervisor marks a physically damaged or permanently retired table as "baja" (decommissioned). The system clears its tunnel position (so no gap is left in the FIFO sequence visible to subsequent workflows), records the event in the table's history log, and prevents the table from appearing in active tunnel maps.

**Why this priority**: Decommissioning is a critical state transition that affects FIFO integrity and ensures field workers are not directed to non-existent tables.

**Independent Test**: Can be fully tested by decommissioning an active table and confirming its estado changes to "baja", posicion_actual becomes NULL, and the event appears in its historial.

**Acceptance Scenarios**:

1. **Given** an active or en_cosecha table, **When** a supervisor executes dar-de-baja, **Then** estado changes to "baja", posicion_actual is set to NULL, and a historial event of tipo_evento="baja" is written with the acting user's ID and timestamp.
2. **Given** an admin_global attempts to soft-delete a table that is NOT in estado="baja", **When** the delete request is received, **Then** the request is rejected with a business rule error.

---

### User Story 5 — Reactivate a Retired Table (Priority: P3)

A supervisor reinstates a previously retired table (e.g., after repairs). The system changes its estado back to "activa" but deliberately leaves its tunnel position as NULL — the table is not automatically placed back into a tunnel. A subsequent transplant operation (M10/M11) will assign it a new position.

**Why this priority**: Reactivation is an infrequent administrative correction; the actual re-placement is handled by transplant workflows.

**Independent Test**: Can be fully tested by reactivating a baja table and confirming estado="activa", posicion_actual=NULL, and a reactivacion event in historial. Confirming the table does NOT appear in any tunnel map until a transplant assigns a new position.

**Acceptance Scenarios**:

1. **Given** a table in estado="baja", **When** a supervisor executes reactivar, **Then** estado changes to "activa", posicion_actual remains NULL, and a historial event of tipo_evento="reactivacion" is written.
2. **Given** a reactivated table with posicion_actual=NULL, **When** the tunnel table list is queried, **Then** the reactivated table does not appear in the ordered FIFO list until it receives a new transplant.

---

### User Story 6 — Browse and Filter All Tables (Priority: P2)

Operations managers and supervisors browse the full catalog of growing tables, filtering by establishment, tunnel, operational status, or active flag, and searching by QR code to locate a specific table quickly.

**Why this priority**: Catalog browsing supports planning, reporting, and troubleshooting across the entire greenhouse operation.

**Independent Test**: Can be fully tested by listing tables with various filter combinations and confirming only matching records are returned with correct pagination.

**Acceptance Scenarios**:

1. **Given** a list request with filter estado="activa", **When** an authenticated user queries, **Then** only tables with estado="activa" are returned.
2. **Given** a list request with a partial or full codigo_qr search term, **When** an authenticated user queries, **Then** only matching tables are returned.
3. **Given** a list request with activo=false, **When** an admin_global queries, **Then** deactivated tables are included in results.

---

### User Story 7 — View a Table's Event History (Priority: P3)

A supervisor or manager reviews the complete chronological log of events for a specific table — transplants, chemical applications, harvest events, status changes — to audit its lifecycle and diagnose issues.

**Why this priority**: Audit history is essential for compliance and traceability but is a read-only view that does not block primary operations.

**Independent Test**: Can be fully tested by querying a table's historial and confirming all recorded events appear in chronological order with correct event type, timestamp, and actor.

**Acceptance Scenarios**:

1. **Given** a table with multiple recorded events, **When** an authenticated user requests its historial, **Then** all events are returned paginated with tipo_evento, fecha_hora, detalle, and usuario_id fields present.
2. **Given** a table with no events, **When** an authenticated user requests its historial, **Then** an empty paginated result is returned.

---

### Edge Cases

- What happens when two concurrent requests attempt to create tables in the same tunnel simultaneously? The position assignment (MAX query + INSERT) executes inside an atomic transaction; the UNIQUE constraint on (tunel_id, posicion_actual) acts as a safety net, causing one request to fail and return a conflict error.
- What happens when a supervisor tries to dar-de-baja a table already in estado="baja"? The system rejects the request with error MESA_ESTADO_INVALIDO (HTTP 409 Conflict).
- What happens when a supervisor tries to reactivar a table already in estado="activa" or "en_cosecha"? The system rejects the request with error MESA_ESTADO_INVALIDO (HTTP 409 Conflict).
- What happens when a PATCH request includes any of the immutable fields (establecimiento_id, tunel_id, codigo_qr, posicion_actual, estado, fecha_ultimo_trasplante)? The system rejects the entire request with error MESA_FIELD_IMMUTABLE (HTTP 400 Bad Request).
- What happens when soft-deleting a table that has associated historial records? Historial records are retained (immutable log); only the mesa record is soft-deleted.
- What happens when codigo_qr collision is attempted? Since codigo_qr is generated server-side as a plain UUID v4 at creation, collision is computationally negligible, but the globally unique constraint enforces correctness.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow supervisors and admin_global users to register new growing tables, specifying the target establishment and tunnel at creation time.
- **FR-002**: The system MUST generate a globally unique QR identifier for each table at creation time as a plain UUID v4 string (no prefix, no formatting); this identifier is immutable after creation and is globally unique across all tenants.
- **FR-003**: The system MUST automatically assign the new table the next sequential FIFO position in the target tunnel (MAX existing non-null position + 1, or 1 if tunnel is empty); the position query and table insertion MUST execute atomically to prevent race conditions under concurrent creation.
- **FR-004**: The system MUST enforce that no two tables share the same FIFO position within the same tunnel at the same time.
- **FR-005**: The system MUST allow any authenticated user to look up a table by its QR identifier, returning current status and tunnel details.
- **FR-006**: The system MUST allow any authenticated user to retrieve an ordered list of tables within a tunnel, sorted by FIFO position ascending.
- **FR-007**: The system MUST allow any authenticated user to browse and filter all tables by establishment, tunnel, operational status (activa/en_cosecha/baja), active flag, and QR code search.
- **FR-008**: The system MUST allow supervisors and admin_global users to update only a table's estimated plant count (plantas_estimadas) and active flag (activo); any update request containing the fields establecimiento_id, tunel_id, codigo_qr, posicion_actual, estado, or fecha_ultimo_trasplante MUST be rejected with error MESA_FIELD_IMMUTABLE (HTTP 400).
- **FR-009**: The system MUST allow supervisors and admin_global users to decommission (dar de baja) a table that is in estado="activa" OR estado="en_cosecha", setting its status to "baja" and clearing its tunnel position; if the table is already in estado="baja", the request MUST be rejected with error MESA_ESTADO_INVALIDO (HTTP 409).
- **FR-010**: The system MUST record a "baja" event in the table's event history whenever a table is decommissioned, capturing the acting user and timestamp.
- **FR-011**: The system MUST allow supervisors and admin_global users to reactivate a table only if it is currently in estado="baja", setting its status back to "activa" with no tunnel position assigned; if the table is in estado="activa" or "en_cosecha", the request MUST be rejected with error MESA_ESTADO_INVALIDO (HTTP 409).
- **FR-012**: The system MUST record a "reactivacion" event in the table's event history whenever a table is reactivated, capturing the acting user and timestamp.
- **FR-013**: The system MUST prevent reactivated tables (posicion_actual = NULL) from appearing in tunnel FIFO maps until a transplant operation assigns a new position.
- **FR-014**: The system MUST allow admin_global users to soft-delete a table, but ONLY if that table's current status is "baja".
- **FR-015**: The system MUST allow any authenticated user to retrieve paginated event history for any table.
- **FR-016**: The system MUST write an audit record for table creation, decommissioning, reactivation, and deletion operations.
- **FR-017**: All table and historial data must be scoped to the authenticated user's tenant; cross-tenant data access is prohibited.
- **FR-018**: The system MUST export HistorialMesaService from MesasModule so that M09 (aplicaciones químicas), M10 (trasplante), and M11 (cosecha) can inject it directly to write event history entries without going through REST endpoints.

### Key Entities

- **Mesa (Growing Table)**: The central physical asset — a growing table identified by a QR code. It belongs to an establishment, lives inside a tunnel at a specific FIFO position, and has a lifecycle status (activa, en_cosecha, baja). Its QR code, establishment, and initial tunnel are set at creation and managed immutably by this module; its tunnel assignment and position change through transplant operations in later modules.
- **HistorialMesa (Table Event Log)**: An immutable chronological record of every significant event that happened to a table (transplants, harvests, chemical applications, status changes). Events are written by this module (for baja and reactivacion) and by M09, M10, and M11 for their respective domain events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Field workers can scan a QR code and retrieve full table details in under 1 second under normal greenhouse connectivity conditions.
- **SC-002**: Supervisors can register a new table and have it appear in the correct tunnel position immediately, with no manual position calculation required.
- **SC-003**: The tunnel FIFO view always reflects accurate position ordering — no gaps, no duplicates — even when multiple concurrent table registrations occur.
- **SC-004**: 100% of decommission, reactivation, and deletion operations produce a corresponding audit record; no business state change occurs without traceability.
- **SC-005**: Reactivated tables never appear in tunnel FIFO maps until a transplant explicitly assigns them a new position, preventing field worker confusion.
- **SC-006**: The table event history is always complete and immutable — once written, no historial record can be modified or deleted.
- **SC-007**: All table queries respect tenant boundaries; no user can access or modify tables from another tenant.

## Assumptions

- Tunnel capacity validation (enforcing capacidad_maxima) is outside the scope of this module; M10/M11 transplant flows are responsible for validating capacity before assigning positions.
- The estimated plant count (plantas_estimadas) defaults to 450 and is treated as a planning estimate; actual counts are not tracked by this module.
- The `en_cosecha` estado is set exclusively by M11 (harvest module); this module does not expose an endpoint to set it directly.
- QR code generation produces a plain UUID v4 string with no prefix or formatting; the globally unique DB constraint enforces correctness.
- Historial records written by M09, M10, and M11 via HistorialMesaService follow the same tenant and mesa_id scoping rules enforced by this module.
- The tunnel table list endpoint (`GET /tuneles/:tunel_id/mesas`) is implemented inside MesasController (NOT TunelesController), using an explicit full-path route with no controller prefix — the same pattern used by StockMovimientosController in M06 (`GET /quimicos/:id/movimientos`). MesasController uses `@Controller()` with no prefix; all its routes are declared as explicit full path strings.
- Pagination for both mesas list and historial list follows the existing `page()` response helper conventions used across M01–M07.
- The `activo` flag is an administrative soft-visibility toggle distinct from `estado`; a table can be activo=false while still having estado="activa".
- Existing M01–M07 modules (EstablecimientosModule, TunelesModule) are already deployed and their services are importable via their exported modules.

## Clarifications

### Session 2026-06-05

- Q: Where is `GET /tuneles/:tunel_id/mesas` implemented — MesasController or TunelesController? → A: MesasController with `@Controller()` (no prefix) and explicit full-path routes, matching the M06 StockMovimientosController pattern.
- Q: Which estados allow dar-de-baja? → A: Both "activa" and "en_cosecha"; only rejected if already "baja" (MESA_ESTADO_INVALIDO 409).
- Q: What is the format of codigo_qr? → A: Plain UUID v4 string — no prefix, no formatting. Globally unique constraint at DB level. Immutable after creation.
- Q: Does PATCH /mesas/:id enforce strict immutability on non-updatable fields? → A: Yes — any request body containing establecimiento_id, tunel_id, codigo_qr, posicion_actual, estado, or fecha_ultimo_trasplante is rejected with MESA_FIELD_IMMUTABLE (HTTP 400).
- Q: What are the state transition guards for dar-de-baja and reactivar? → A: reactivar is only allowed from "baja" (throws MESA_ESTADO_INVALIDO 409 for "activa"/"en_cosecha"); dar-de-baja is blocked if already "baja" (throws MESA_ESTADO_INVALIDO 409).
- Q: Is HistorialMesaService exported from MesasModule for M09/M10/M11 injection? → A: Yes — HistorialMesaService is exported from MesasModule so M09, M10, and M11 can inject it directly without using REST endpoints.
- Q: How is posicion_actual assigned at creation to prevent race conditions? → A: The MAX(posicion_actual) query and the table INSERT execute inside an atomic database transaction. The UNIQUE constraint on (tunel_id, posicion_actual) WHERE posicion_actual IS NOT NULL acts as a final safety net.
