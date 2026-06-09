# Tasks: M13 — Trazabilidad (Traceability)

**Input**: Design documents from `specs/013-trazabilidad/`

**Prerequisites**: plan.md ✅, spec.md ✅, contracts/ ✅

**No tests**: Read-only aggregation module; manual REST verification only (project pattern).

**Organization**: Tasks grouped by user story. No new entities, no migration, no new error codes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1 = cosecha chain, US2 = mesa index)
- All paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Create file stubs for the three new files. No logic yet.

- [x] T001 Create empty stub `src/modules/trazabilidad/trazabilidad.service.ts` with class declaration, imports placeholder, and all result interfaces (MesaRow, MesaBandejaRaw, SiembraRow, BandejaCicloRow, AplicacionRow, PackingRow, CosechaMesaRow) as defined in plan.md — use `numero_lote` (not `codigo`) for lote fields in SiembraRow
- [x] T002 [P] Create empty stub `src/modules/trazabilidad/trazabilidad.controller.ts` with class declaration and import placeholders
- [x] T003 [P] Create empty stub `src/modules/trazabilidad/trazabilidad.module.ts` with @Module decorator shell (imports, providers, controllers arrays empty for now)

**Checkpoint**: Three files exist, TypeScript compiles with no logic errors.

---

## Phase 2: Foundational — Service Shell

**Purpose**: Wire TrazabilidadService constructor and dependencies. No query logic yet.

**⚠️ CRITICAL**: Service must be injectable before any query method is added.

- [x] T004 In `src/modules/trazabilidad/trazabilidad.service.ts`, implement the `@Injectable()` class constructor with four injected dependencies: `DataSource` (from `typeorm`), `TenancyService` (from `TenancyModule`), `CosechaService` (from `src/modules/cosecha/cosecha.service`), `MesasService` (from `src/modules/mesas/mesas.service`). No `@InjectRepository`. Declare both public method signatures (`getTrazabilidadByCosecha` and `getTrazabilidadByMesa`) as stubs returning `Promise<unknown>` temporarily.

**Checkpoint**: Service compiles. `TrazabilidadService` is injectable with correct constructor signature.

---

## Phase 3: User Story 1 — Full Harvest Cycle Traceability Chain (Priority: P1) 🎯 MVP

**Goal**: `GET /trazabilidad/cosecha/:cosecha_id` returns the complete traceability chain for a single harvest cycle — mesa info, cycle bandejas with siembra/lote lineage, packing (or null), greenhouse and nursery chemical applications.

**Independent Test**: Call `GET /trazabilidad/cosecha/:cosecha_id` with a valid cosecha_id; verify the response includes `cosecha`, `mesa`, `packing` (null or object), `bandejas_ciclo` (empty array or populated), `aplicaciones_invernadero`, and `aplicaciones_nursery`. Call with an unknown cosecha_id → expect 404.

### Implementation for User Story 1

- [x] T005 [US1] In `src/modules/trazabilidad/trazabilidad.service.ts`, implement `getTrazabilidadByCosecha(cosecha_id: string)`:
  - **Step 1**: `const tenantId = this.tenancy.requireTenantId()` then `const cosecha = await this.cosechaService.getCosechaById(cosecha_id, tenantId)` (throws `COSECHA_NOT_FOUND` 404 if not found/wrong tenant)
  - **Step 2**: Raw query — `SELECT id, codigo_qr, estado, tunel_id, establecimiento_id FROM mesas WHERE id = $1 AND deleted_at IS NULL` — param: `[cosecha.mesa_id]` — assign result[0] to `mesa`
  - **Step 3**: Raw query — `SELECT MAX(fecha_trasplante) AS cycle_date FROM mesa_bandeja WHERE mesa_id = $1 AND fecha_trasplante <= $2` — params: `[cosecha.mesa_id, cosecha.fecha_hora]` — assign `result[0]?.cycle_date ?? null` to `cycleDate`

- [x] T006 [US1] Continue `getTrazabilidadByCosecha` — add Steps 4–5:
  - **Step 4** (only if `cycleDate` is not null): Raw query — `SELECT mb.bandeja_id, mb.fecha_trasplante, b.siembra_id, b.lote_semilla_id, b.lote_sustrato_id, b.estado FROM mesa_bandeja mb JOIN bandejas b ON b.id = mb.bandeja_id WHERE mb.mesa_id = $1 AND mb.fecha_trasplante = $2` — params: `[cosecha.mesa_id, cycleDate]`. Then `bandejaIds = mbRows.map(r => r.bandeja_id)`. Use `Promise.all` to fetch siembra for each bandeja row in parallel: `SELECT s.id, s.fecha_hora, s.usuario_id, ls.id AS lote_semilla_id, ls.numero_lote AS lote_semilla_numero, lsu.id AS lote_sustrato_id, lsu.numero_lote AS lote_sustrato_numero FROM siembras s JOIN lotes ls ON ls.id = s.lote_semilla_id JOIN lotes lsu ON lsu.id = s.lote_sustrato_id WHERE s.id = $1` — param: `[mb.siembra_id]`. Assign result as `BandejaCicloRow[]` stored in `bandejasCiclo`. If `cycleDate` is null: `bandejasCiclo = []`, `bandejaIds = []`.
  - **Step 5**: Raw query — `SELECT lp.id, lp.fecha_hora, lp.peso_bruto_kg, lp.usuario_id, lp.observaciones, array_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias FROM lotes_packing lp LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id WHERE lp.cosecha_id = $1 AND lp.tenant_id = $2 GROUP BY lp.id` — params: `[cosecha_id, tenantId]`. Assign `packingRows[0] ?? null` to `packing`.

- [x] T007 [US1] Continue `getTrazabilidadByCosecha` — add Steps 6–7 and return:
  - **Step 6** (only if `cycleDate` is not null): Raw query — `SELECT a.id, a.fecha_hora, a.observaciones, a.usuario_id, a.receta_id, json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles FROM aplicaciones_quimicas a JOIN aplicacion_quimica_mesa aqm ON aqm.aplicacion_id = a.id LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id WHERE aqm.mesa_id = $1 AND a.fecha_hora >= $2 AND a.fecha_hora <= $3 AND a.tenant_id = $4 GROUP BY a.id ORDER BY a.fecha_hora ASC` — params: `[cosecha.mesa_id, cycleDate, cosecha.fecha_hora, tenantId]`. Assign to `aplicacionesInvernadero`. If `cycleDate` is null: `aplicacionesInvernadero = []`.
  - **Step 7** (only if `bandejaIds.length > 0`): Raw query — `SELECT a.id, a.fecha_hora, a.receta_id, a.observaciones, a.usuario_id, json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles FROM aplicaciones_quimicas a JOIN aplicacion_quimica_bandeja aqb ON aqb.aplicacion_id = a.id LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id WHERE aqb.bandeja_id = ANY($1::uuid[]) AND a.contexto = 'nursery' AND a.tenant_id = $2 GROUP BY a.id ORDER BY a.fecha_hora ASC` — params: `[bandejaIds, tenantId]`. Assign to `aplicacionesNursery`. If `bandejaIds.length === 0`: `aplicacionesNursery = []`.
  - **Return**: `{ cosecha, mesa: mesa ?? null, packing, bandejas_ciclo: bandejasCiclo, aplicaciones_invernadero: aplicacionesInvernadero, aplicaciones_nursery: aplicacionesNursery }`. Replace the stub return type with the concrete return type.

- [x] T008 [US1] In `src/modules/trazabilidad/trazabilidad.controller.ts`, add the US1 route handler: `@Get('trazabilidad/cosecha/:cosecha_id')` method `getTrazabilidadByCosecha(@Param('cosecha_id') cosechaId: string, @Req() req: AuthRequest)`. Body: `const tenantId = req.tenantId ?? ''; const result = await this.svc.getTrazabilidadByCosecha(cosechaId, tenantId);` — WAIT: the service uses `this.tenancy.requireTenantId()` internally, so the controller does NOT need to pass tenantId. Correct signature: `async getTrazabilidadByCosecha(@Param('cosecha_id') cosechaId: string)` and body: `const result = await this.svc.getTrazabilidadByCosecha(cosechaId); return ok(result);`. Add `AuthRequest` type definition matching M12 pattern (`Request & { user: JwtPayload; id: string; tenantId?: string | null; method: string; url: string }`). Add class-level `@UseGuards(JwtAuthGuard)` and `@Controller()` with no prefix.

**Checkpoint**: `GET /trazabilidad/cosecha/:cosecha_id` returns 200 with full chain. Returns 404 for unknown cosecha_id. Returns empty arrays when no cycle/applications found.

---

## Phase 4: User Story 2 — Mesa Harvest Index (Priority: P2)

**Goal**: `GET /trazabilidad/mesa/:mesa_id` returns all harvest cycles for a mesa, ordered newest-first, each with a packing summary (or null).

**Independent Test**: Call `GET /trazabilidad/mesa/:mesa_id` with a valid mesa_id; verify the response includes `mesa` info and `cosechas` array ordered by `fecha_hora` DESC. Each entry has `cosecha_id`, `fecha_hora`, `peso_kg`, and `packing` (null or object with `peso_bruto_kg` and `categorias`). Call with an unknown mesa_id → expect 404.

### Implementation for User Story 2

- [x] T009 [US2] In `src/modules/trazabilidad/trazabilidad.service.ts`, implement `getTrazabilidadByMesa(mesa_id: string)`:
  - **Step 1**: `const tenantId = this.tenancy.requireTenantId()` then `const mesa = await this.mesasService.getMesaById(mesa_id, tenantId)` (throws `MESA_NOT_FOUND` 404 if not found/wrong tenant). `mesa` is typed as `MesaWithTunel` (import from `src/modules/mesas/mesas.service`).
  - **Step 2**: Raw query — `SELECT c.id, c.fecha_hora, c.peso_kg, c.tunel_id, lp.id AS packing_id, lp.peso_bruto_kg, json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias FROM cosechas c LEFT JOIN lotes_packing lp ON lp.cosecha_id = c.id LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id WHERE c.mesa_id = $1 AND c.tenant_id = $2 GROUP BY c.id, lp.id, lp.peso_bruto_kg ORDER BY c.fecha_hora DESC` — params: `[mesa_id, tenantId]`. Typed as `CosechaMesaRow[]`.
  - **Return**: `{ mesa: { id: mesa.id, codigo_qr: mesa.codigo_qr, estado: mesa.estado, tunel_id: mesa.tunel_id, establecimiento_id: mesa.establecimiento_id }, cosechas: rows.map(r => ({ cosecha_id: r.id, fecha_hora: r.fecha_hora, peso_kg: r.peso_kg, packing: r.packing_id ? { peso_bruto_kg: r.peso_bruto_kg, categorias: r.categorias ?? [] } : null })) }`. Replace stub return type with concrete type.

- [x] T010 [US2] In `src/modules/trazabilidad/trazabilidad.controller.ts`, add the US2 route handler: `@Get('trazabilidad/mesa/:mesa_id')` method `getTrazabilidadByMesa(@Param('mesa_id') mesaId: string)`. Body: `const result = await this.svc.getTrazabilidadByMesa(mesaId); return ok(result);`. Inject `TrazabilidadService` as constructor param (already declared from T008). Ensure `ok` import from `src/common/http/api-response` is present.

**Checkpoint**: `GET /trazabilidad/mesa/:mesa_id` returns 200 with mesa info and cosechas array. Returns 404 for unknown mesa_id. Returns empty `cosechas` array for mesa with no harvests.

---

## Phase 5: Module + AppModule Wire-Up

**Purpose**: Register the module so endpoints are served.

- [x] T011 In `src/modules/trazabilidad/trazabilidad.module.ts`, implement the full `@Module` decorator: `imports: [TenancyModule, CosechaModule, MesasModule]`, `providers: [TrazabilidadService]`, `controllers: [TrazabilidadController]`, `exports: []`. Add all necessary imports at the top of the file (TenancyModule from `src/infra/tenancy/tenancy.module` or wherever TenancyModule lives — check existing modules for the correct path).
- [x] T012 In `src/app.module.ts`, add `TrazabilidadModule` to the `imports` array after `PackingModule`. Add the import statement at the top: `import { TrazabilidadModule } from './modules/trazabilidad/trazabilidad.module'`.

**Checkpoint**: `npm run build` (or `nest build`) succeeds with no TypeScript errors. Both endpoints appear in the route list at startup.

---

## Phase 6: Verification

**Purpose**: End-to-end manual validation of both endpoints.

- [ ] T013 [P] Verify `GET /trazabilidad/cosecha/:cosecha_id` — happy path: use a cosecha_id from an existing harvest with a packing record and at least one prior trasplante; confirm all 6 keys present in response (`cosecha`, `mesa`, `packing`, `bandejas_ciclo`, `aplicaciones_invernadero`, `aplicaciones_nursery`); confirm `bandejas_ciclo` contains the correct bandeja set for the last trasplante before the cosecha date; confirm detalles are nested in each aplicacion.
- [ ] T014 [P] Verify `GET /trazabilidad/cosecha/:cosecha_id` — edge cases: (a) cosecha with no prior trasplante → `bandejas_ciclo: []` and `aplicaciones_nursery: []`; (b) cosecha with no packing → `packing: null`; (c) unknown cosecha_id → 404; (d) cosecha_id from another tenant → 404.
- [ ] T015 [P] Verify `GET /trazabilidad/mesa/:mesa_id` — happy path: use a mesa_id with multiple cosechas; confirm response has `mesa` object and `cosechas` array ordered newest-first; confirm each cosecha entry with packing shows `peso_bruto_kg` and `categorias`; confirm entries without packing show `packing: null`.
- [ ] T016 [P] Verify `GET /trazabilidad/mesa/:mesa_id` — edge cases: (a) mesa with no cosechas → `cosechas: []`; (b) unknown mesa_id → 404; (c) mesa_id from another tenant → 404; (d) unauthenticated request → 401.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (US1)**: Depends on Phase 2 — service stub must exist
- **Phase 4 (US2)**: Depends on Phase 2 — can start in parallel with Phase 3 if working on a separate branch
- **Phase 5 (Module + AppModule)**: Depends on Phases 3 and 4 both complete
- **Phase 6 (Verification)**: Depends on Phase 5

### Within Each Phase

- T005 → T006 → T007 (sequential: same method, additive steps)
- T008 (controller US1 handler) can start once T005 stub is defined
- T009 is independent of T005–T007 (different method)
- T010 (controller US2 handler) can start once T009 stub is defined
- T011 → T012 (module then appModule)
- T013–T016 all [P] — independent verification cases

### Parallel Opportunities

```
# Phase 1: all three file stubs in parallel
T001 (service stub + interfaces)
T002 (controller stub)     ← [P] with T001
T003 (module stub)         ← [P] with T001, T002

# Phase 3 (US1) and Phase 4 (US2): independent methods, can overlap if on separate branches
T005–T007 (getTrazabilidadByCosecha)
T009 (getTrazabilidadByMesa)  ← [P] with T005–T007 if separate developer

# Phase 6: all verification cases in parallel
T013 T014 T015 T016  ← [P] all
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004)
3. Complete Phase 3: US1 (T005–T008)
4. Wire module minimally (T011–T012)
5. **STOP and VALIDATE**: `GET /trazabilidad/cosecha/:cosecha_id` works end-to-end

### Incremental Delivery

1. Setup + Foundational → skeleton compiles
2. US1 complete → harvest chain endpoint working
3. US2 complete → mesa index endpoint working
4. Module wired + verified → M13 fully shipped

---

## Notes

- No new entities, no migration, no new error codes — fastest module to implement in the project
- `lotes` table column is `numero_lote` (not `codigo`) — confirmed from siembra.service.ts
- `TenancyService.requireTenantId()` is called in the SERVICE methods, not in the controller
- Controller uses `@Controller()` with no prefix — route strings on each `@Get()` handler
- `@UseGuards(JwtAuthGuard)` only — no `RolesGuard`, no `@Roles()` decorator
- `Promise.all` for per-bandeja siembra fetches in Step 4 (parallel, not sequential)
- Both `json_agg(...) FILTER (WHERE ...)` patterns handle LEFT JOINs returning null rows cleanly
- `CosechaModule` and `MesasModule` must be in `TrazabilidadModule.imports` so their services are injectable
