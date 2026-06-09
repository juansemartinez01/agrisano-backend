# Feature Specification: M13 — Trazabilidad (Traceability)

**Feature Branch**: `014-trazabilidad`

**Created**: 2026-06-09

**Status**: Clarified

**Input**: User description: "Module M13 — Trazabilidad: read-only traceability chain aggregation across all prior domain modules."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Full Harvest Cycle Traceability (Priority: P1)

An authenticated user selects a specific harvest record and wants to see the complete end-to-end traceability chain for that cycle: which greenhouse table produced it, which trays were transplanted into it, what seeds and substrates those trays came from, and all chemical applications performed on the table and trays during that cycle.

**Why this priority**: This is the core value proposition of the module — linking a harvested product all the way back to seeds, substrates, and chemical inputs. It is the primary query a quality manager or auditor will run.

**Independent Test**: Can be fully tested by calling `GET /trazabilidad/cosecha/:cosecha_id` with a valid harvest ID and verifying the response assembles data correctly from all contributing tables.

**Acceptance Scenarios**:

1. **Given** a valid `cosecha_id` belonging to the authenticated user's tenant, **When** the user calls `GET /trazabilidad/cosecha/:cosecha_id`, **Then** the response includes the harvest record, the associated mesa, the bandejas transplanted in that cycle with their siembra and lote data, the packing lots (or null if none), and all chemical applications scoped to that cycle.
2. **Given** a harvest that has no transplant record before its date, **When** the user calls the endpoint, **Then** `bandejas_ciclo` is an empty array and the rest of the chain is still returned.
3. **Given** a harvest that has no packing yet, **When** the user calls the endpoint, **Then** the `packing` field is `null` and no error is thrown.
4. **Given** a `cosecha_id` that does not belong to the user's tenant, **When** the user calls the endpoint, **Then** the system returns a 404 error.

---

### User Story 2 — Browse All Harvest Cycles for a Mesa (Priority: P2)

An authenticated user wants to see a historical overview of all harvest cycles for a specific greenhouse table — ordered by date descending — to understand the table's production history and navigate to any individual cycle's full traceability detail.

**Why this priority**: This index view is the natural entry point before drilling into endpoint 1. It gives users context about a table's history and lets them pick a specific cycle to investigate.

**Independent Test**: Can be fully tested by calling `GET /trazabilidad/mesa/:mesa_id` with a valid mesa ID and verifying the response lists all cosechas with their packing summaries, ordered newest-first.

**Acceptance Scenarios**:

1. **Given** a valid `mesa_id` belonging to the authenticated user's tenant with multiple harvest cycles, **When** the user calls `GET /trazabilidad/mesa/:mesa_id`, **Then** the response includes the mesa info and a list of cosechas ordered by `fecha_hora` descending, each with `cosecha_id`, `fecha_hora`, `peso_kg`, and a packing summary if it exists.
2. **Given** a mesa that has no harvest cycles, **When** the user calls the endpoint, **Then** `cosechas` is an empty array and the mesa info is still returned.
3. **Given** a mesa where some cycles have packing and some do not, **When** the user calls the endpoint, **Then** each cosecha entry correctly shows a packing summary or `null`.
4. **Given** a `mesa_id` that does not belong to the user's tenant, **When** the user calls the endpoint, **Then** the system returns a 404 error.

---

### Edge Cases

- What happens when the transplant batch date equals the harvest date exactly? The system must include that transplant batch (condition is `<=`).
- How does the system handle a mesa with thousands of harvest cycles? No pagination is required — responses are unbounded but expected to be manageable in practice.
- What if chemical applications span multiple bandejas and the same application appears in both nursery and greenhouse scopes? Each scope is queried independently using its respective join table; there is no deduplication between scopes.
- What if `cosecha.mesa_id` references a mesa that was later deleted or reassigned? The query scopes the mesa to the tenant; if it no longer exists or belongs to a different tenant, the cosecha is still accessible but the mesa join returns partial data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST return the complete traceability chain for a given harvest cycle when queried by `cosecha_id`, including mesa info, cycle bandejas with seed and substrate lineage, packing summary, and chemical applications in both greenhouse and nursery scopes.
- **FR-002**: System MUST determine the cycle's transplant date using a two-step query: (1) find `MAX(fecha_trasplante)` from `mesa_bandeja` where `mesa_id = cosecha.mesa_id AND fecha_trasplante <= cosecha.fecha_hora`; (2) retrieve all `mesa_bandeja` rows for that mesa where `fecha_trasplante = cycle_date`. This two-step approach defines the full bandeja set for the cycle.
- **FR-003**: System MUST scope greenhouse chemical applications to those joined via `aplicacion_quimica_mesa` where `mesa_id = cosecha.mesa_id` and `fecha_hora` falls between the cycle transplant date and the harvest `fecha_hora` (both inclusive). Each application MUST include its nested `aplicaciones_quimicas_detalle` records.
- **FR-004**: System MUST scope nursery chemical applications to those joined via `aplicacion_quimica_bandeja` where `bandeja_id IN (cycle bandeja ids)` and `contexto = 'nursery'`. No date restriction is applied — bandejas can only receive nursery applications before transplant by domain invariant. Each application MUST include its nested `aplicaciones_quimicas_detalle` records.
- **FR-005**: System MUST return `bandejas_ciclo` as an empty array when no transplant record exists before the harvest date.
- **FR-006**: System MUST return `packing` as `null` when no packing lots exist for the harvest.
- **FR-007**: System MUST return a 404 error when the requested `cosecha_id` does not belong to the authenticated user's tenant.
- **FR-008**: System MUST return a 404 error when the requested `mesa_id` does not belong to the authenticated user's tenant.
- **FR-009**: System MUST return a mesa's full harvest cycle index when queried by `mesa_id`, ordered by `fecha_hora` descending, with no limit on the number of records returned. Each entry includes the cosecha summary and a packing summary (via LEFT JOIN to `lotes_packing` and `lotes_packing_categorias`) if available.
- **FR-010**: All endpoints MUST require a valid JWT and enforce tenant isolation; no role restriction beyond authentication is required.
- **FR-011**: All responses MUST use the `ok()` response helper consistent with the project's API response standard.
- **FR-012**: System MUST NOT expose data from any other tenant regardless of query parameters.

### Key Entities *(include if feature involves data)*

- **Cosecha**: A harvest event tied to a specific mesa and date/time; the anchor entity for traceability chain queries.
- **Mesa**: A greenhouse growing table; provides spatial and operational context for the harvest.
- **MesaBandeja**: The join record linking a mesa to a set of bandejas for a specific transplant cycle; used to determine which trays belong to a given cycle.
- **Bandeja**: A nursery tray; carries seed and substrate lineage via its siembra record.
- **Siembra**: A seeding event linking a bandeja to a seed lot (lote_semilla) and a substrate lot (lote_sustrato).
- **LotePacking / LotePackingCategoria**: Packing output records associated with a cosecha; summarized in responses.
- **AplicacionQuimica**: A chemical application event; scoped to either the mesa (greenhouse) or bandejas (nursery) via join tables.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A complete traceability chain response for any harvest cycle is returned in a single request with no additional round-trips required from the client.
- **SC-002**: All chain queries correctly reflect tenant boundaries — no cross-tenant data leaks under any query parameter combination.
- **SC-003**: Cycle determination (identifying the correct transplant batch) produces the same result regardless of how many historical cycles a mesa has accumulated.
- **SC-004**: The mesa harvest index returns cycles in strict descending date order for all mesas with one or more cosechas.
- **SC-005**: Edge cases (no packing, no transplant, empty chemical lists) are handled gracefully with correct null or empty-array values — no 500 errors.

## Assumptions

- No new database tables or migrations are needed; this module reads exclusively from tables created by M03, M08, M09, M10, M11, and M12.
- Authentication is enforced by `JwtAuthGuard` only; no role distinction (`admin`, `operario`, `supervisor`) is required for read access.
- No pagination is required for either endpoint — harvest cycle counts per mesa are assumed manageable within a single response.
- The nursery chemical scope uses the `aplicacion_quimica_bandeja` join table to identify applications on bandejas; the greenhouse scope uses the `aplicacion_quimica_mesa` join table.
- The cycle transplant date is a single point in time (the max `fecha_trasplante` ≤ `cosecha.fecha_hora`); all `mesa_bandeja` records sharing that exact date form the cycle's bandeja set.
- Packing summary in the mesa index includes: category counts and `peso_bruto_kg` total per cosecha; detailed category breakdowns are only available in the cosecha traceability endpoint.
- Chemical application detail (`aplicaciones_quimicas_detalle`) is included in the traceability chain to show which active ingredients and quantities were applied.
- `historial_mesa` is available as supporting context but is not a primary data source for the traceability chain endpoints defined in this module.
- The service layer uses `DataSource` directly for all queries (raw QueryBuilder joins across multiple tables); it does NOT extend `BaseCrudTenantService` and does NOT inject individual repositories via `@InjectRepository`.
- The controller uses `@Controller()` with no prefix argument; route strings are declared on each handler (`'trazabilidad/cosecha/:cosecha_id'` and `'trazabilidad/mesa/:mesa_id'`). The module imports `CosechaModule` (which exports `CosechaService`) and `MesasModule` (which exports `MesasService`) only for tenant-ownership validation; no other cross-module imports are required.

## Clarifications

### Session 2026-06-09

- Q: Service architecture — does TrazabilidadService use BaseCrudTenantService and @InjectRepository? → A: No. TrazabilidadService is a plain `@Injectable()` that injects `DataSource` directly and uses raw QueryBuilder joins for all multi-table reads. No `BaseCrudTenantService`, no `@InjectRepository`.
- Q: Cycle determination strategy for GET /trazabilidad/cosecha/:cosecha_id? → A: Two-step. Step 1: `SELECT MAX(fecha_trasplante) FROM mesa_bandeja WHERE mesa_id = cosecha.mesa_id AND fecha_trasplante <= cosecha.fecha_hora`. Step 2: Retrieve all `mesa_bandeja` rows where `mesa_id = cosecha.mesa_id AND fecha_trasplante = cycle_date`. All rows from step 2 form the cycle's bandeja set.
- Q: Greenhouse chemical application scope and nesting? → A: JOIN `aplicacion_quimica_mesa` on `aplicacion_id`; filter by `mesa_id = cosecha.mesa_id`, `fecha_hora >= cycle_trasplante_date`, `fecha_hora <= cosecha.fecha_hora`, `tenant_id = tenantId`. Nested `aplicaciones_quimicas_detalle` included in each application.
- Q: Nursery chemical application scope and date restriction? → A: JOIN `aplicacion_quimica_bandeja` on `aplicacion_id`; filter by `bandeja_id IN (cycle_bandeja_ids)`, `contexto = 'nursery'`, `tenant_id = tenantId`. No date restriction needed — domain invariant guarantees nursery applications only occur before transplant. Nested `aplicaciones_quimicas_detalle` included.
- Q: Controller routing and module dependencies? → A: `@Controller()` with no prefix. Route strings on handlers: `'trazabilidad/cosecha/:cosecha_id'` and `'trazabilidad/mesa/:mesa_id'`. Imports `CosechaModule` and `MesasModule` for tenant-ownership validation only.
- Q: Cosecha list in mesa index — pagination or unbounded? → A: Unbounded. Query: `cosechas WHERE mesa_id = :mesa_id AND tenant_id = :tenantId ORDER BY fecha_hora DESC`. Packing via LEFT JOIN to `lotes_packing` + `lotes_packing_categorias`. No limit applied.
