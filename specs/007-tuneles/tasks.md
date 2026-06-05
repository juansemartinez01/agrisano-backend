# Tasks: M07 — Tuneles (Greenhouse Tunnels)

**Input**: Design documents from `/specs/007-tuneles/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US5)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001–T005 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add three tuneles domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// tuneles` comment (after `// stock movimientos` block):
    ```typescript
    // tuneles
    TUNEL_NOT_FOUND: 'TUNEL_NOT_FOUND',
    TUNEL_NOMBRE_DUPLICADO: 'TUNEL_NOMBRE_DUPLICADO',
    TUNEL_FIELD_IMMUTABLE: 'TUNEL_FIELD_IMMUTABLE',
    ```
  - **Acceptance**: `grep "TUNEL_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; all 3 codes present; file still compiles

- [x] T002 CREATE `src/modules/tuneles/entities/tunel.entity.ts` — Tunel entity
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Tunel
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Decorator**: `@Entity('tuneles')`
  - **Columns**:
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL; immutable after creation (enforced by controller)
    - `nombre`: `@Column({ type: 'varchar', length: 100 })` — NOT NULL
    - `capacidad_maxima`: `@Column({ type: 'int' })` — NOT NULL; integer ≥ 1 (enforced by DTO)
    - `activo`: `@Column({ type: 'boolean', default: true })` — NOT NULL
  - **⚠️ NO `@Unique` decorator** — uniqueness lives in migration partial index only
  - **Acceptance**: File exports `Tunel`; `npx tsc --noEmit` passes; no `@Unique` on entity

- [x] T003 [P] CREATE `src/modules/tuneles/dto/create-tunel.dto.ts` — create DTO
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Fields**:
    - `establecimiento_id: string` — `@IsUUID()` (required)
    - `nombre: string` — `@IsString() @IsNotEmpty() @MaxLength(100)` (required)
    - `capacidad_maxima: number` — `@IsInt() @Min(1)` (required)
  - **Acceptance**: DTO exported; all three fields required; `activo` NOT in this DTO (defaults to true in entity)

- [x] T004 [P] CREATE `src/modules/tuneles/dto/update-tunel.dto.ts` — update DTO (no establecimiento_id)
  - **Implements**: plan.md Phase 2, Task 2.2
  - **`establecimiento_id` MUST NOT appear in this DTO** — immutability enforced by controller PATCH guard
  - **Fields**:
    - `nombre?: string` — `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)`
    - `capacidad_maxima?: number` — `@IsOptional() @IsInt() @Min(1)`
    - `activo?: boolean` — `@IsOptional() @IsBoolean()`
  - **Acceptance**: DTO exported; all fields optional; no `establecimiento_id` or `tenant_id` present

- [x] T005 [P] CREATE `src/modules/tuneles/dto/query-tuneles.dto.ts` — list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Fields**:
    - `q?: string` — `@IsOptional() @IsString()` — ILIKE search on nombre
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `activo?: boolean` — `@IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()` — coerce strings; **NO default value** (FR-010)
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Acceptance**: DTO exported; `activo` has no default; extends `PageQueryDto`

**Checkpoint**: T001–T005 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 + 3 — Create and browse tunnels (Priority: P1+P2) 🎯 MVP

**Goal (US1)**: supervisor and admin_global can create tunnels for a specific establishment; uniqueness enforced; cross-tenant establishment rejected; audit written.
**Goal (US3)**: all authenticated users can list, search, filter by `establecimiento_id`/`activo`, and retrieve tunnels by ID. No default `activo` filter — all non-deleted tunnels returned by default.

**Independent Test (US1)**: POST `/tuneles` as supervisor with valid establishment + unique nombre + capacidad_maxima=10 → 201. POST same nombre + same establishment → 409 `TUNEL_NOMBRE_DUPLICADO`. POST with cross-tenant establishment → 404. POST as operario → 403. POST with capacidad_maxima=0 → 400.
**Independent Test (US3)**: GET `/tuneles` (no filters) → both active and inactive returned. GET `?activo=false` → inactive only. GET `?q=tunel` → nombre ILIKE match. GET `/tuneles/:id` → 200. GET `/admin/tuneles` as admin_global → 200; as supervisor → 403.

### Implementation for User Story 1 + 3

- [x] T006 [US1] CREATE `src/modules/tuneles/tuneles.service.ts` — complete TunelesService
  - **Implements**: plan.md Phase 3, Task 3.1
  - **⚠️ CRITICAL**: `TunelesService extends BaseCrudTenantService<Tunel>`
  - **Constructor**: `super(tunelRepo)` — inject `@InjectRepository(Tunel) private readonly tunelRepo: Repository<Tunel>` and `private readonly estService: EstablecimientosService`
  - **Export `AUDIT` const**: `{ CREATED: 'tunel_created', UPDATED: 'tunel_updated', DELETED: 'tunel_deleted' }`
  - **Implement `listTuneles(q: QueryTunelesDto)`**: build filters from `q.establecimiento_id` and `q.activo` (only when not undefined; **NO activo default**, FR-010); call `this.list(...)` with `searchColumns: ['nombre']`, `filterAllowed: ['establecimiento_id', 'activo']`, `sortAllowed: ['nombre', 'created_at']`, `sortFallback: { by: 'created_at', order: 'DESC' }`, `strictTenant: true`
  - **Implement `createTunel(dto)`**: (1) validate establishment with `estService.mustFindById(dto.establecimiento_id, { strictTenant: true })`; (2) get `tenantId`; (3) findOne for nombre conflict; (4) throw `TUNEL_NOMBRE_DUPLICADO 409` if found; (5) `this.create(dto, { strictTenant: true })`
  - **Implement `updateTunel(id, dto)`**: (1) `mustFindById(id, { strictTenant: true })`; (2) QB conflict check on nombre if changed (excluding current id); (3) throw `TUNEL_NOMBRE_DUPLICADO 409` if conflict; (4) `this.update(id, dto, { strictTenant: true })`
  - **Implement `deleteTunel(id)`**: (1) `mustFindById(id, { strictTenant: true })`; (2) `softDelete(id, { strictTenant: true })`; (3) NO cascade, NO mesa check (FR-012)
  - **Acceptance**: Service compiles; `listTuneles({})` returns all non-deleted; `createTunel` with duplicate nombre → 409; cross-tenant establishment → 404; no `any` types

- [x] T007 [P] [US1] CREATE `src/modules/tuneles/tuneles.controller.ts` — main controller (5 endpoints)
  - **Implements**: plan.md Phase 4, Task 4.1
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('tuneles')`
  - **Constructor**: inject `TunelesService`, `AuditService`, `PinoLogger`
  - **Declare `AuthRequest` type** locally (same pattern as recetas.controller.ts)
  - **Implement all 5 endpoints**:
    - `GET /` — no `@Roles`; `listTuneles(q)` → `page(items, p, limit, total)`
    - `GET /:id` — no `@Roles`; `mustFindById(id, { strictTenant: true })` → `ok(tunel)`
    - `POST /` — `@Roles('supervisor', 'admin_global')` + `@HttpCode(HttpStatus.CREATED)`; `createTunel(dto)` + audit `AUDIT.CREATED` → `ok(tunel)`
    - `PATCH /:id` — `@Roles('supervisor', 'admin_global')` — **IMMUTABLE GUARD FIRST**:
      ```typescript
      const ALLOWED = new Set(['nombre', 'capacidad_maxima', 'activo']);
      if (Object.keys((req.body as Record<string, unknown>) ?? {}).some((k) => !ALLOWED.has(k))) {
        throw new AppError({ code: ErrorCodes.TUNEL_FIELD_IMMUTABLE, message: 'Solo se pueden modificar nombre, capacidad_maxima y activo', status: 400 });
      }
      ```
      then `updateTunel(id, dto)` + audit `AUDIT.UPDATED` → `ok(updated)`
    - `DELETE /:id` — `@Roles('admin_global')`; `deleteTunel(id)` + audit `AUDIT.DELETED` → `ok({ deleted: true })`
  - **Acceptance**: POST as operario → 403; PATCH with `{ establecimiento_id: '...' }` → 400 `TUNEL_FIELD_IMMUTABLE`; GET with no filters → both active and inactive

- [x] T008 [P] [US3] CREATE `src/modules/tuneles/admin-tuneles.controller.ts` — admin panel controller
  - **Implements**: plan.md Phase 4, Task 4.2
  - **Class decorator**: `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/tuneles')`
  - **Constructor**: inject `TunelesService` only
  - **Implement** `GET /`: `svc.listTuneles(q)` + `clampPagination` → `page(items, p, limit, total)`
  - **Acceptance**: GET `/admin/tuneles` as admin_global → 200 paginated list; as supervisor → 403

- [x] T009 [US1] CREATE `src/modules/tuneles/tuneles.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.3
  - **imports**: `TypeOrmModule.forFeature([Tunel])`, `TenancyModule`, `AuditModule`, `EstablecimientosModule`
  - **providers**: `[TunelesService]`
  - **controllers**: `[TunelesController, AdminTunelesController]`
  - **exports**: `[TunelesService]` ← **MUST export for M08 Mesas**
  - **⚠️ `EstablecimientosModule` MUST be imported** — provides `EstablecimientosService`
  - **Acceptance**: Module compiles; no circular dependency errors; `TunelesService` in exports

- [x] T010 [US1] MODIFY `src/app.module.ts` — register TunelesModule
  - **Implements**: plan.md Phase 4, Task 4.4
  - **Add** `import { TunelesModule } from './modules/tuneles/tuneles.module'` at top
  - **Add** `TunelesModule` to `imports` array after `StockMovimientosModule`
  - **Acceptance**: `npx tsc --noEmit` passes; all tuneles endpoints available

**✅ MVP Checkpoint (after T010)**: Full US1 + US3 functionality working:
- POST `/tuneles` as supervisor/admin_global → 201
- Duplicate nombre in same establishment → 409 `TUNEL_NOMBRE_DUPLICADO`
- Cross-tenant establishment → 404; capacidad_maxima=0 → 400
- GET `/tuneles` (no filters) → both active and inactive
- GET `/tuneles?activo=false` → inactive only; `?q=` → ILIKE search
- GET `/tuneles/:id` → 200 or 404
- GET `/admin/tuneles` as admin_global → 200; as supervisor → 403
- Audit event `tunel_created` written

---

## Phase 3: User Story 2 — Update tunnel properties (Priority: P2)

**Goal**: supervisor and admin_global can update `nombre`, `capacidad_maxima`, `activo`; duplicate-nombre conflicts rejected; `establecimiento_id` in body rejected; operario cannot PATCH.

**Independent Test**: PATCH `/tuneles/:id` with `{ nombre: 'new' }` as supervisor → 200. PATCH with `{ establecimiento_id: '...' }` → 400 `TUNEL_FIELD_IMMUTABLE`. PATCH `{ activo: false }` → 200. PATCH as operario → 403. PATCH with `{ nombre: 'existing' }` → 409.

- [x] T011 [US2] VERIFY `src/modules/tuneles/tuneles.controller.ts` — confirm PATCH guard and update behavior
  - **Verify** `PATCH /:id` has `@Roles('supervisor', 'admin_global')` — operario gets 403
  - **Verify** ALLOWED set = `new Set(['nombre', 'capacidad_maxima', 'activo'])` — `establecimiento_id` in body → 400 `TUNEL_FIELD_IMMUTABLE`
  - **Verify** `updateTunel` QB conflict check excludes current record id
  - **Verify** audit event `tunel_updated` written
  - **Acceptance**: All PATCH scenarios from spec US2 pass

---

## Phase 4: User Story 4 — Soft-delete tunnel (Priority: P3)

**Goal**: admin_global soft-deletes a tunnel; mesas unaffected; nombre reusable after delete; supervisor cannot delete.

**Independent Test**: DELETE `/tuneles/:id` as admin_global → 200 `{ deleted: true }`. Verify `deleted_at` set. POST new tunnel with same nombre+establishment → 201. DELETE as supervisor → 403.

- [x] T012 [US4] VERIFY `src/modules/tuneles/tuneles.service.ts` + `src/modules/tuneles/tuneles.controller.ts` — confirm delete behavior
  - **Verify service** `deleteTunel`: `mustFindById` → `softDelete`; no mesa check; no cascade
  - **Verify controller** `DELETE /:id` has `@Roles('admin_global')` — supervisor gets 403
  - **Verify** audit event `tunel_deleted` written
  - **Verify** uniqueness partial index: soft-deleted nombre does NOT block new tunnel (findOne uses TypeORM default which excludes soft-deleted)
  - **Acceptance**: All DELETE scenarios from spec US4 pass

---

## Phase 5: Migration & Final Verification

- [x] T013 VERIFY `migrations/1770800000000-TunelesInit.ts` — confirm migration exists (created in plan phase)
  - **Action**: VERIFY ONLY — file already exists, do NOT recreate or modify
  - **Check**: exports `TunelesInit1770800000000`; `up()` creates `tuneles` table + 3 indexes + partial unique index `UQ_tuneles_tenant_est_nombre WHERE deleted_at IS NULL`; `down()` drops in reverse; no FK constraints; timestamp `1770800000000 > 1770600000000` (M06)
  - **Acceptance**: File exists at `migrations/1770800000000-TunelesInit.ts`; compiles without errors

- [x] T014 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` types; all imports resolve

**✅ Final Checkpoint (M07 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 14 tasks checked
- No default `activo` filter on GET /tuneles
- Partial unique index confirmed; soft-deleted nombre reusable
- `TunelesService` exported for M08
- `EstablecimientosModule` in TunelesModule imports

---

## Dependencies & Execution Order

```
Phase 1 (T001–T005) ──► Phase 2 MVP (T006–T010) ──► Phase 3 (T011 verify) ──► Phase 4 (T012 verify) ──► Phase 5 (T013–T014)
```

- Foundation T001 first, then T002–T005 in parallel
- US1+US3: T006 → T007 [P] + T008 [P] → T009 → T010
- US2 (T011) and US4 (T012): verify only — code written in T006/T007
- Verify: T013 [P] + T014 [P]

---

## Notes

- Module is structurally identical to M04 Recetas — follow exact same patterns
- `TunelesService` DOES extend `BaseCrudTenantService<Tunel>`
- PATCH ALLOWED = `new Set(['nombre', 'capacidad_maxima', 'activo'])` — no `descripcion` field
- `listTuneles` has NO default `activo` filter (FR-010)
- Migration already exists — VERIFY ONLY (T013)
- `TunelesService` must be in `exports` of `TunelesModule` — M08 will inject it
- `create()` from `BaseCrudTenantService` sets `tenant_id` automatically
- In `updateTunel`, QB conflict check must exclude current record by id
