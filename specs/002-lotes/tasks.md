# Tasks: M02 — Lotes

**Input**: Design documents from `/specs/002-lotes/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US3)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001–T004 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add four lotes domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// lotes` comment:
    ```typescript
    LOTE_NOT_FOUND: 'LOTE_NOT_FOUND',
    LOTE_NUMERO_DUPLICADO: 'LOTE_NUMERO_DUPLICADO',
    LOTE_REFERENCED_BY_BANDEJA: 'LOTE_REFERENCED_BY_BANDEJA',
    LOTE_TIPO_IMMUTABLE: 'LOTE_TIPO_IMMUTABLE',
    ```
  - **Acceptance**: `grep "LOTE_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; file still compiles

- [x] T002 [P] CREATE `src/modules/lotes/entities/lote.entity.ts` — Lote entity + LoteTipo enum
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Lote
  - **Export** `LoteTipo` enum: `SEMILLA = 'semilla'`, `SUSTRATO = 'sustrato'`
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Columns**: `tipo: enum(LoteTipo) NOT NULL`, `numero_lote: varchar(100) NOT NULL`, `proveedor: varchar(200) nullable`, `observaciones: text nullable`, `activo: boolean DEFAULT true`
  - **Decorator**: `@Entity('lotes')` — do NOT add `@Unique` (uniqueness lives in migration partial index only)
  - **Acceptance**: File exports `Lote` and `LoteTipo`; `npx tsc --noEmit` passes

- [x] T003 [P] CREATE `src/modules/lotes/dto/create-lote.dto.ts` — create DTO
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Fields**: `tipo: LoteTipo` (`@IsEnum(LoteTipo)`), `numero_lote: string` (`@IsString @IsNotEmpty @MaxLength(100)`), `proveedor?: string` (`@IsOptional @IsString @MaxLength(200)`), `observaciones?: string` (`@IsOptional @IsString`)
  - **Acceptance**: DTO exported; `tipo` is required; `proveedor` and `observaciones` optional

- [x] T004 [P] CREATE `src/modules/lotes/dto/update-lote.dto.ts` — update DTO (no tipo field)
  - **Implements**: plan.md Phase 2, Task 2.2
  - **`tipo` MUST NOT appear in this DTO** — immutability enforced by omission
  - **Fields**: `numero_lote?: string` (`@IsOptional @IsString @IsNotEmpty @MaxLength(100)`), `proveedor?: string` (`@IsOptional @IsString @MaxLength(200)`), `observaciones?: string` (`@IsOptional @IsString`), `activo?: boolean` (`@IsOptional @IsBoolean`)
  - **Acceptance**: DTO exported; all fields optional; no `tipo` field present

- [x] T005 [P] CREATE `src/modules/lotes/dto/query-lotes.dto.ts` — list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Add**: `q?: string` (`@IsOptional`), `tipo?: LoteTipo` (`@IsOptional @IsEnum(LoteTipo)`), `activo?: boolean` (`@IsOptional @IsBoolean @Transform` — coerce `'true'`/`'false'` string to boolean), `sortBy?: string` (`@IsOptional`), `sortOrder?: 'ASC' | 'DESC'` (`@IsOptional @IsIn(['ASC','DESC'])`)
  - **Acceptance**: DTO exported; `activo` transforms string `'true'` to boolean `true`

**Checkpoint**: T001–T005 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 — Manage lots as supervisor or admin_global (Priority: P1) 🎯 MVP

**Goal**: supervisor and admin_global can create lots, update their details, list/filter/search lots. Audit events recorded. Duplicate numero_lote rejected. tipo immutability enforced.

**Independent Test**: POST `/lotes` as supervisor → 201. POST same `numero_lote+tipo` → 409. PATCH with `{ tipo }` → 400. GET `/lotes?q=abc` as operario → OR search. GET `/admin/lotes` as admin_global → 200. GET `/admin/lotes` as supervisor → 403.

### Implementation for User Story 1

- [x] T006 [US1] CREATE `src/modules/lotes/lotes.service.ts` — complete service implementation
  - **Implements**: plan.md Phase 3, Task 3.1
  - **Extend** `BaseCrudTenantService<Lote>` from `src/common/crud/base-crud.service`
  - **Constructor**: `super(loteRepo)` — inject only `@InjectRepository(Lote) loteRepo`; NO UsersService dependency
  - **Export** `AUDIT` const: `{ CREATED: 'lote_created', UPDATED: 'lote_updated', DELETED: 'lote_deleted' }`
  - **Implement** `listLotes(q: QueryLotesDto)`:
    - Build `filters` object from `q.tipo` and `q.activo`
    - Call `this.list({ ...q, filters }, { filterAllowed: ['tipo','activo'], sortAllowed: ['numero_lote','proveedor','created_at'], sortFallback: { by: 'created_at', order: 'DESC' }, strictTenant: true, customizeQb: q.q ? ... : undefined })`
    - When `q.q` is present, use `customizeQb` with TypeORM `Brackets` for OR search: `WHERE (numero_lote ILIKE :search OR proveedor ILIKE :search)` — see research.md Decision 3
  - **Implement** `createLote(dto: CreateLoteDto)`:
    1. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
    2. `findOne({ where: { tenant_id: tenantId, tipo: dto.tipo, numero_lote: dto.numero_lote } })` — TypeORM excludes soft-deleted by default
    3. If found → throw `AppError({ code: ErrorCodes.LOTE_NUMERO_DUPLICADO, status: 409, message: '...' })`
    4. `return this.create(dto, { strictTenant: true })`
  - **Implement** `updateLote(id: string, dto: UpdateLoteDto)`:
    1. If `dto.numero_lote` is present: load current lot, check uniqueness excluding current ID (QueryBuilder with same `tipo` + new `numero_lote`), throw `LOTE_NUMERO_DUPLICADO 409` if conflict
    2. `return this.update(id, dto, { strictTenant: true })`
  - **Implement** `deleteLote(id: string)` (full implementation including forward-compatible bandeja check — used in US3):
    1. `await this.mustFindById(id, { strictTenant: true })` — throws `NOT_FOUND` 404 if missing
    2. **Forward-compatible bandeja check** (research.md Decision 5):
       ```typescript
       try {
         const [{ cnt }] = await this.loteRepo.manager.query(
           `SELECT COUNT(*)::int AS cnt FROM bandejas WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1`,
           [id]
         ) as [{ cnt: number }];
         if (cnt > 0) throw new AppError({ code: ErrorCodes.LOTE_REFERENCED_BY_BANDEJA, status: 409, message: '...' });
       } catch (err: unknown) {
         if (err instanceof AppError) throw err;
         // bandejas table not yet deployed (M04) — skip gracefully
       }
       ```
    3. `await this.softDelete(id, { strictTenant: true })`
  - **Acceptance**: Service compiles; `createLote` throws 409 on duplicate `numero_lote` for same tipo; `listLotes` OR search works; no `any` types

- [x] T007 [P] [US1] CREATE `src/modules/lotes/lotes.controller.ts` — main controller (all 5 endpoints)
  - **Implements**: plan.md Phase 4, Task 4.1
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('lotes')`
  - **Constructor**: inject `LotesService`, `AuditService`, `PinoLogger`
  - **Implement all 5 endpoints**:
    - `GET /` — no `@Roles` (all authenticated pass via RolesGuard when no roles required); call `svc.listLotes(q)`; return `page(items, p, limit, total)` via `clampPagination`
    - `GET /:id` — no `@Roles`; call `this.svc.mustFindById(id, { strictTenant: true })`; return `ok(lote)`
    - `POST /` — `@Roles('supervisor', 'admin_global')` `@HttpCode(201)`; call `svc.createLote(dto)`; write audit `AUDIT.CREATED`; return `ok(lote)`
    - `PATCH /:id` — `@Roles('supervisor', 'admin_global')` — **FIRST LINE IN HANDLER**: `if ('tipo' in ((req.body as Record<string, unknown>) ?? {})) throw new AppError({ code: ErrorCodes.LOTE_TIPO_IMMUTABLE, status: 400, message: 'El campo tipo no puede ser modificado' })`; then call `svc.updateLote(id, dto)`; write audit `AUDIT.UPDATED`; return `ok(updated)`
    - `DELETE /:id` — `@Roles('admin_global')`; call `svc.deleteLote(id)`; write audit `AUDIT.DELETED`; return `ok({ deleted: true })`
  - **Audit write pattern**: same as M01 admin-users.controller.ts; include `tenant_id: req.tenantId ?? null`
  - **Acceptance**: Controller compiles; PATCH with `{ tipo: 'sustrato' }` in body → 400 `LOTE_TIPO_IMMUTABLE`; POST as operario → 403; all responses use `ok()` or `page()` (no raw entities)

- [x] T008 [P] [US1] CREATE `src/modules/lotes/admin-lotes.controller.ts` — admin panel controller
  - **Implements**: plan.md Phase 4, Task 4.2
  - **Class decorator**: `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/lotes')`
  - **Constructor**: inject `LotesService` only
  - **Implement** `GET /`: call `svc.listLotes(q)` with `clampPagination`; return `page(items, p, limit, total)`
  - **Acceptance**: GET `/admin/lotes` as admin_global → 200 paginated list; as supervisor → 403

- [x] T009 [US1] CREATE `src/modules/lotes/lotes.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.3
  - **imports**: `TypeOrmModule.forFeature([Lote])`, `TenancyModule`, `AuditModule`
  - **providers**: `[LotesService]`
  - **controllers**: `[LotesController, AdminLotesController]`
  - **exports**: `[LotesService]`
  - **NO UsersModule** — lots have no user-assignment logic
  - **Acceptance**: Module compiles; no circular dependency errors

- [x] T010 [US1] MODIFY `src/app.module.ts` — register LotesModule
  - **Implements**: plan.md Phase 4, Task 4.4
  - **Add** `import { LotesModule } from './modules/lotes/lotes.module'` at top
  - **Add** `LotesModule` to `imports` array after `EstablecimientosModule`
  - **Acceptance**: `npx tsc --noEmit` passes; `npm run start:dev` starts without error

**✅ MVP Checkpoint (after T010)**: All US1 functionality working:
- POST/GET/PATCH `/lotes` work for supervisor and admin_global
- GET `/lotes` works for all authenticated users (operario included)
- OR search operational
- Duplicate numero_lote → 409
- PATCH with tipo → 400
- GET `/admin/lotes` → 200 for admin_global, 403 for others
- Audit events written
- `npx tsc --noEmit` passes

---

## Phase 3: User Story 2 — Browse the lot catalog as any authenticated user (Priority: P2)

**Goal**: All authenticated users (including operario) can list, filter, and retrieve lots. Implemented via the same controller endpoints as US1 — this phase is a verification step confirming operario read access works correctly.

**Independent Test**: GET `/lotes` as operario → 200 paginated list. GET `/lotes?tipo=semilla` → only semilla lots. GET `/lotes?activo=false` → only inactive lots. GET `/lotes/:id` as operario → 200. GET `/lotes?q=test` → OR search result.

**Prerequisite**: US1 complete (T006–T010) — read paths share the same controller.

### Implementation for User Story 2

- [x] T011 [US2] VERIFY `src/modules/lotes/lotes.controller.ts` — confirm read endpoint role guards are correct
  - **Implements**: spec.md US2 acceptance scenarios; plan.md Phase 4, Task 4.1
  - **Verify** `GET /` has no `@Roles()` decorator — RolesGuard passes when `required.length === 0` (see `roles.guard.ts` line 12)
  - **Verify** `GET /:id` has no `@Roles()` decorator
  - **Verify** `listLotes` passes `activo` filter correctly when `activo=false` is supplied (requires boolean transform in DTO)
  - **Acceptance**: Operario token can call GET `/lotes` and GET `/lotes/:id` → 200; filter `?activo=false` returns only inactive lots; filter `?tipo=sustrato` returns only sustrato lots

**Checkpoint**: US2 verified. All authenticated roles can browse lots with full filter/search support.

---

## Phase 4: User Story 3 — Delete lots as admin_global (Priority: P3)

**Goal**: admin_global can soft-delete lots; deletion is blocked if a bandeja references the lot; forward-compatible check skips when bandejas table does not exist.

**Independent Test**: DELETE `/lotes/:id` as admin_global (unreferenced) → 200, lot soft-deleted, audit written. DELETE as supervisor → 403. After M04: DELETE lot referenced by bandeja → 409 LOTE_REFERENCED_BY_BANDEJA.

**Prerequisite**: US1 complete — `deleteLote` was already fully implemented in T006 (including try/catch bandeja check).

### Implementation for User Story 3

- [x] T012 [US3] VERIFY `src/modules/lotes/lotes.service.ts` — confirm deleteLote forward-compatible implementation
  - **Implements**: spec.md US3; plan.md Phase 3 § deleteLote; research.md Decision 5
  - **Verify** `deleteLote` contains the try/catch pattern that:
    1. Calls `mustFindById` before the check
    2. Issues raw `SELECT COUNT(*)::int AS cnt FROM bandejas WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1`
    3. Throws `LOTE_REFERENCED_BY_BANDEJA 409` if `cnt > 0`
    4. Catches non-AppError exceptions and continues silently (table not yet deployed)
  - **Verify** `softDelete` is called after the check passes
  - **Acceptance**: DELETE `/lotes/:id` as admin_global → 200; soft-deleted lot has `deleted_at` set in DB; audit event `lote_deleted` written; same lot can be recreated with same `numero_lote+tipo` (partial index no longer blocks it)

**Checkpoint**: US3 verified. All three user stories independently functional.

---

## Phase 5: Migration & Final Verification

**Purpose**: Confirm migration integrity and run full compile + smoke tests.

- [ ] T013 VERIFY `migrations/1770300000000-LotesInit.ts` — confirm migration was created in plan phase
  - **Action**: VERIFY (file already exists — do NOT recreate)
  - **Check**:
    - File exports class `LotesInit1770300000000 implements MigrationInterface`
    - `up()` creates `lote_tipo` ENUM, then `lotes` table, then all 4 indexes including the partial unique index `WHERE "deleted_at" IS NULL`
    - `down()` drops indexes in reverse order, then table, then ENUM type
  - **Acceptance**: File exists at `migrations/1770300000000-LotesInit.ts`; timestamp `1770300000000 > 1770200000000` (M01); `npx tsc --noEmit` includes it without errors

- [ ] T014 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` type warnings; all imports resolve

- [ ] T015 Run migration against local database
  - **Command**: `npm run migration:run` (or equivalent from package.json)
  - **Prerequisite**: T013 verified; local DB running with M01 migration already applied
  - **Acceptance**: Migration runs without error; `lotes` table and `lote_tipo` enum exist; `UQ_lotes_tenant_tipo_numero` partial index exists; running again does NOT fail

- [ ] T016 [P] Run eslint on lotes module
  - **Command**: `npx eslint src/modules/lotes/ --ext .ts`
  - **Prerequisite**: T010 complete
  - **Acceptance**: Zero errors

- [ ] T017 Manual smoke tests (6 paths from plan.md Phase 6)
  - **Prerequisite**: T015 complete; server running (`npm run start:dev`)
  - **Tests**:
    1. `POST /lotes` as supervisor with `tipo=semilla` and unique `numero_lote` → **201**
    2. `POST /lotes` same `numero_lote+tipo` → **409** `LOTE_NUMERO_DUPLICADO`
    3. `PATCH /lotes/:id` with `{ tipo: 'sustrato' }` → **400** `LOTE_TIPO_IMMUTABLE`
    4. `GET /lotes?q=abc` as operario → **200**, matches `numero_lote` OR `proveedor`
    5. `DELETE /lotes/:id` as admin_global → **200**, audit event `lote_deleted` in DB
    6. `GET /admin/lotes` as supervisor → **403**
  - **Acceptance**: All 6 paths return expected status codes; responses use `ok()`/`page()` wrappers

**✅ Final Checkpoint (M02 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 17 tasks checked
- All 6 smoke tests passing
- Audit events recorded for create, update, delete operations
- Partial unique index correctly allows re-use of `numero_lote` after soft-delete

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational) ──► Phase 2 (US1 MVP) ──► Phase 3 (US2 verify) ──► Phase 4 (US3 verify) ──► Phase 5 (Migration & Verify)
```

- **Foundational (T001–T005)**: No dependencies — start immediately
- **US1 (T006–T010)**: All T001–T005 must be done — BLOCKS all user story work
- **US2 (T011)**: US1 complete — operario read paths verified
- **US3 (T012)**: US1 complete — deleteLote implemented in T006; this is verification only
- **Verify (T013–T017)**: All code phases complete

### Within Each Phase

- Foundation: T001 first, then T002–T005 in parallel
- US1: T006 → T007 [P] + T008 [P] → T009 → T010
- US2: T011 (verify only, after T010)
- US3: T012 (verify only, after T010)
- Verify: T013 [P] + T014 [P] → T015 → T016 [P] + T017

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create Lote entity
T003: Create CreateLoteDto
T004: Create UpdateLoteDto
T005: Create QueryLotesDto

# US1 parallel batch (after T006):
T007: Create LotesController
T008: Create AdminLotesController

# Final parallel batch (after T012):
T013: Verify migration file
T014: Run tsc --noEmit
T016: Run eslint
```

---

## Implementation Strategy

### MVP First (US1 + admin list)

1. Complete Phase 1: Foundational (T001–T005)
2. Complete Phase 2: US1 (T006–T010)
3. **STOP and VALIDATE**: All create/update/list paths working; tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation → US1 → **demo supervisor creates and searches lots** (MVP)
2. Verify US2 (T011) → **confirm operario read access**
3. Verify US3 (T012) → **confirm admin_global delete + forward-compatible bandeja check**
4. Migration + verification (T013–T017) → **production ready**

---

## Notes

- `[P]` tasks touch different files — safe to work in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- US2 (T011) and US3 (T012) are **verify** tasks — the code was already written in T006/T007; no new files
- The OR search uses `Brackets` from TypeORM (import from `typeorm`) to prevent the OR leaking into surrounding AND conditions
- The `tipo` immutability check reads from `req.body` (the raw Express body, available before ValidationPipe strips unknown fields)
- Migration (T013) already exists — do NOT recreate it; just verify and run it
