# Feature Specification: M11 — Cosecha (Harvest)

**Feature Branch**: `012-cosecha-harvest`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Module: M11 — Cosecha (Harvest) — registers a harvest event on a greenhouse table, the first transaction of the harvest cycle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register Harvest (Priority: P1)

An operario, supervisor, or admin_global registers the harvest of a greenhouse table (mesa) that has reached position 1 in its tunnel queue. Providing only the mesa identifier and the harvested weight, the system atomically records the harvest, transitions the mesa to an "in harvest" state, and advances all other mesas in the tunnel one position forward in the FIFO queue.

**Why this priority**: This is the primary business action of the module. Without it no harvest data exists and the downstream retransplant flow (M10) cannot begin.

**Independent Test**: Can be fully tested by submitting a harvest request for a mesa at position 1 and verifying that the harvest record is created, the mesa changes state, and remaining mesas in the tunnel shift one position down.

**Acceptance Scenarios**:

1. **Given** a mesa with `estado=activa` and `posicion_actual=1` in its tunnel, **When** an authenticated operario submits a harvest request with a valid weight, **Then** the system returns HTTP 201 with `ok({ cosecha, mesa_id, tunel_id, posicion_recalculada: true })`, the mesa is set to `estado=en_cosecha` and `posicion_actual=NULL`, and every other mesa in the same tunnel with `posicion_actual > 1` has its position decremented by 1.
2. **Given** a mesa with `estado=activa` but `posicion_actual=2` (not at front of queue), **When** an operario submits a harvest request, **Then** the system returns HTTP 422 with error code `COSECHA_MESA_NO_DISPONIBLE` and no data is modified.
3. **Given** a mesa with `estado=en_cosecha` (already harvested), **When** an operario submits a harvest request, **Then** the system returns HTTP 422 with error code `COSECHA_MESA_NO_DISPONIBLE`.
4. **Given** a harvest request with `peso_kg = 0` or negative, **When** submitted, **Then** the system returns HTTP 400 indicating the weight must be greater than zero.
5. **Given** a valid harvest request, **When** the system processes it, **Then** a `cosecha_registrada` audit event is written and a `cosecha` history entry is appended to the mesa's event log.

---

### User Story 2 - View Harvest History (Priority: P2)

A supervisor or admin reviews the full list of harvest records, optionally filtering by mesa, tunnel, or date range, to track production volume and operational cadence across the greenhouse.

**Why this priority**: Reporting and traceability are required for operational decisions; however, the harvest registration flow must exist first.

**Independent Test**: Can be tested independently by seeding harvest records and querying the list endpoint with various filters.

**Acceptance Scenarios**:

1. **Given** harvest records exist, **When** an authenticated user calls the harvest list endpoint without filters, **Then** the system returns a paginated list of all harvest records.
2. **Given** harvest records for multiple mesas and tunnels, **When** an authenticated user filters by `mesa_id`, **Then** only records for that mesa are returned.
3. **Given** harvest records spanning multiple dates, **When** an authenticated user filters by a `fecha_desde` and `fecha_hasta` range, **Then** only records within that date range are returned.
4. **Given** harvest records, **When** an authenticated user filters by `tunel_id`, **Then** only records for mesas in that tunnel are returned.

---

### User Story 3 - View Single Harvest Record (Priority: P3)

An operator or supervisor retrieves the full detail of a specific harvest record — including the harvested weight, timestamp, mesa and tunnel identifiers, and the operator who performed it — for traceability or dispute resolution.

**Why this priority**: Single-record lookup is secondary to list/filter; needed for drill-down but not for primary operations.

**Independent Test**: Can be tested by creating a harvest record and then retrieving it by its identifier.

**Acceptance Scenarios**:

1. **Given** a harvest record with a known identifier, **When** an authenticated user requests it, **Then** the system returns the full record including mesa information.
2. **Given** a non-existent harvest identifier, **When** requested, **Then** the system returns HTTP 404.

---

### User Story 4 - View Harvest History for a Specific Mesa (Priority: P3)

A supervisor reviews all harvests ever performed on a specific mesa to understand its production lifecycle and rotation frequency.

**Why this priority**: Supplementary view on mesa-scoped data; useful but not blocking any core operation.

**Independent Test**: Can be tested by registering multiple harvests for one mesa and querying the mesa-scoped endpoint.

**Acceptance Scenarios**:

1. **Given** multiple harvest records for a specific mesa, **When** an authenticated user queries `GET /mesas/:id/cosechas` (served by CosechaController with explicit full-path route), **Then** all harvests for that mesa are returned in paginated form.
2. **Given** a mesa with no harvest records, **When** queried, **Then** an empty paginated result is returned.

---

### Edge Cases

- What happens when the last mesa in a tunnel is harvested (tunnel becomes empty)? → The FIFO recalc produces no updates (no other mesas exist); the cosecha record is still created normally.
- What happens if two concurrent requests try to harvest the same mesa simultaneously? → The atomic transaction and row-level locking ensure only one succeeds; the second receives `COSECHA_MESA_NO_DISPONIBLE`.
- What happens when `peso_kg` is provided with more than 3 decimal places? → The system rejects it at DTO validation (3 decimal precision enforced, decimal 10,3).
- What happens if the tunnel identifier associated with the mesa cannot be resolved at harvest time? → `tunel_id` is taken directly from `mesa.tunel_id`; since the mesa has already been validated as existing and active, no separate tunnel lookup is needed. If `mesa.tunel_id` is unexpectedly null, the harvest request fails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated users with roles `operario`, `supervisor`, or `admin_global` to register a harvest event for a greenhouse table.
- **FR-002**: Pre-transaction validation MUST: (1) confirm the mesa exists within the tenant scope, and (2) confirm `mesa.estado === 'activa'` AND `mesa.posicion_actual === 1`; if either check fails, throw `COSECHA_MESA_NO_DISPONIBLE` (HTTP 422). No separate tunnel validation is required — `tunel_id` is taken directly from `mesa.tunel_id`.
- **FR-003**: System MUST execute the full harvest as a single atomic transaction in this exact order: (1) INSERT cosecha record, (2) UPDATE mesas SET `estado='en_cosecha'`, `posicion_actual=NULL` WHERE `id=mesa_id`, (3) UPDATE mesas SET `posicion_actual = posicion_actual - 1` WHERE `tunel_id=X` AND `posicion_actual > 1` AND `deleted_at IS NULL`, (4) save HistorialMesa entry with `tipo_evento='cosecha'` via the transaction manager. All steps succeed or all are rolled back.
- **FR-004**: System MUST set `posicion_al_momento=1`, `tunel_id` (from `mesa.tunel_id`), `fecha_hora` (server time), and `usuario_id` (from authentication token) automatically — these values are never accepted from the request body.
- **FR-005**: System MUST validate that `peso_kg` is greater than zero and has at most 3 decimal places; harvest requests that fail this validation must be rejected.
- **FR-006**: System MUST write a `cosecha_registrada` audit event for every successful harvest.
- **FR-007**: System MUST append a `cosecha` event to the mesa's history log as step 4 of the atomic harvest transaction.
- **FR-008**: After a successful harvest, the mesa MUST have `estado=en_cosecha` and `posicion_actual=NULL`, signaling it is available for retransplant (handled by M10).
- **FR-009**: After a successful harvest, every other active mesa in the same tunnel that had `posicion_actual > 1` and `deleted_at IS NULL` MUST have its position decremented by 1 (FIFO advancement).
- **FR-010**: System MUST allow all authenticated users to list harvest records with pagination and optional filters: `mesa_id`, `tunel_id`, start date (`fecha_desde`), end date (`fecha_hasta`).
- **FR-011**: System MUST allow all authenticated users to retrieve a single harvest record by identifier, including associated mesa information.
- **FR-012**: System MUST allow all authenticated users to list all harvest records for a specific mesa. This endpoint (`GET /mesas/:id/cosechas`) is implemented in `CosechaController` using an explicit full-path route — the same pattern established in M09 and M10 — not in `MesasController`.
- **FR-013**: Harvest records MUST be immutable — no update or delete operations are permitted.
- **FR-014**: All endpoints MUST require a valid authentication token (`JwtAuthGuard`).
- **FR-015**: `POST /cosecha` MUST return HTTP 201 with response body `ok({ cosecha, mesa_id, tunel_id, posicion_recalculada: true })`.

### Key Entities

- **Cosecha (Harvest Record)**: Plain entity (no shared base class, no soft-delete). Columns: `id` (UUID primary key), `tenant_id` (UUID, nullable), `mesa_id` (UUID, required), `tunel_id` (UUID, required — denormalized from mesa at harvest time), `posicion_al_momento` (integer, always 1 — set server-side), `fecha_hora` (timestamptz, server default `now()`), `peso_kg` (decimal 10,3, required, > 0), `usuario_id` (UUID, required — from JWT), `observaciones` (text, nullable), `created_at`, `updated_at`. No `deleted_at`. Records are immutable after creation.
- **Mesa (Greenhouse Table)**: Existing entity (M08). Its `estado` transitions to `en_cosecha` and `posicion_actual` becomes null after harvest. Referenced but not owned by this module.
- **HistorialMesa (Mesa History)**: Existing entity (M08). A new entry with `tipo_evento='cosecha'` is saved via the transaction manager (`qr.manager.save`) as the final step of the atomic harvest transaction.
- **Tunel (Tunnel)**: Existing entity (M07). Provides the FIFO queue context. `tunel_id` is denormalized onto Cosecha at harvest time, sourced directly from `mesa.tunel_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operarios can register a harvest in a single action without entering tunnel, position, timestamp, or operator data manually — 100% of those fields are populated automatically.
- **SC-002**: A harvest registration that includes all required downstream effects (mesa state change, FIFO recalculation, history entry, audit record) completes as one operation with no partial states visible under any failure scenario.
- **SC-003**: Attempts to harvest a mesa not at position 1 or not in active state are rejected 100% of the time with a clear, identifiable error (`COSECHA_MESA_NO_DISPONIBLE`, HTTP 422) before any data is modified.
- **SC-004**: All authenticated users can retrieve harvest records (list, single, per-mesa) without additional permissions — read access is universal within the authenticated scope.
- **SC-005**: The harvest list endpoint supports filtering by mesa, tunnel, and date range, returning only matching records with correct pagination in all tested combinations.
- **SC-006**: After a successful harvest of a tunnel with N mesas, the remaining N-1 mesas each have their position decremented by exactly 1, with no gaps or duplicates in the position sequence.

## Assumptions

- The consuming client identifies the mesa to harvest by its UUID (`mesa_id`); the client does not need to know the tunnel or current position — the system resolves these.
- `tenant_id` on the cosecha record is populated from the JWT or request context using the same tenancy infrastructure as existing modules (M01–M10).
- The `HistorialMesa` entry created during harvest uses the same `tipo_evento` vocabulary already established in M08/M10 (`cosecha` as the event type string).
- Pagination defaults (page size, max page size) follow the same conventions used across existing modules.
- The retransplant step (what happens after `en_cosecha`) is fully handled by M10 and is out of scope for this module.
- Date range filters (`fecha_desde`, `fecha_hasta`) are inclusive on both ends and apply to the `fecha_hora` field of the cosecha record.
- No soft-delete is required on cosecha records; the design intentionally omits `deleted_at` to reinforce immutability.
- `CosechaService` is a plain injectable service with no shared base class; all queries use manual query builders with explicit tenant scope — consistent with M09 and M10.
- `MesasService` can be called within the harvest flow to look up the mesa before opening the transaction. The `HistorialMesaService` (or equivalent) is used inside the transaction via `qr.manager.save`.

## Clarifications

### Session 2026-06-08

- Q: Cosecha entity structure (plain entity, no BaseEntity, no deleted_at)? → A: Confirmed. Plain entity with columns: `id` (uuid PK), `tenant_id` (uuid nullable), `mesa_id` (uuid), `tunel_id` (uuid), `posicion_al_momento` (int, always 1), `fecha_hora` (timestamptz default now()), `peso_kg` (decimal 10,3), `usuario_id` (uuid), `observaciones` (text nullable), `created_at`, `updated_at`. No `deleted_at`.
- Q: Exact transaction order inside ONE QueryRunner? → A: Confirmed. Order: (1) INSERT cosecha, (2) UPDATE mesa estado=en_cosecha/posicion_actual=NULL, (3) FIFO decrement UPDATE for remaining mesas with posicion_actual > 1 and deleted_at IS NULL, (4) qr.manager.save(HistorialMesa, { tipo_evento: 'cosecha', ... }).
- Q: Pre-transaction validation — simplified check (mesa exists + estado/posicion), tunel_id from mesa.tunel_id with no separate tunnel validation? → A: Confirmed. Validation: (1) mesa exists in tenant, (2) estado === 'activa' AND posicion_actual === 1 → throw COSECHA_MESA_NO_DISPONIBLE 422 if not. tunel_id taken from mesa.tunel_id directly; no separate tunnel lookup needed.
- Q: GET /mesas/:id/cosechas routing — in CosechaController with explicit full-path route (same pattern as M09/M10), not in MesasController? → A: Confirmed.
- Q: POST /cosecha returns HTTP 201 with ok({ cosecha, mesa_id, tunel_id, posicion_recalculada: true })? → A: Confirmed. HTTP 201.
- Q: CosechaService is plain @Injectable() with no BaseCrudTenantService, all queries manual QueryBuilder with tenant scope? → A: Confirmed. No base class.
