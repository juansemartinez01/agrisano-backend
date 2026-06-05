# Tasks: M04 — Recetas (Nursery Recipes)

**Input**: Design documents from `/specs/004-recetas/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US4)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001–T005 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add three recetas domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// recetas` comment:
    ```typescript
    // recetas
    RECETA_NOT_FOUND: 'RECETA_NOT_FOUND',
    RECETA_NOMBRE_DUPLICADO: 'RECETA_NOMBRE_DUPLICADO',
    RECETA_FIELD_IMMUTABLE: 'RECETA_FIELD_IMMUTABLE',
    ```
  - **Acceptance**: `grep "RECETA_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; all 3 codes present; file still compiles

- [x] T002 CREATE `src/modules/recetas/entities/receta.entity.ts` — Receta entity
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Receta
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Decorator**: `@Entity('recetas')`
  - **Columns**:
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL; immutable after creation (enforced by controller)
    - `nombre`: `@Column({ type: 'varchar', length: 150 })` — NOT NULL
    - `descripcion`: `@Column({ type: 'text', nullable: true })` — `string | null`
    - `activo`: `@Column({ type: 'boolean', default: true })` — NOT NULL
  - **⚠️ NO `@Unique` decorator** — uniqueness lives in migration partial index `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` only
  - **Acceptance**: File exports `Receta`; `npx tsc --noEmit` passes; no `@Unique` on entity

- [x] T003 [P] CREATE `src/modules/recetas/dto/create-receta.dto.ts` — create DTO
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Fields**:
    - `establecimiento_id: string` — `@IsUUID()` (required)
    - `nombre: string` — `@IsString() @IsNotEmpty() @MaxLength(150)` (required)
    - `descripcion?: string` — `@IsOptional() @IsString()`
  - **Acceptance**: DTO exported; `establecimiento_id` and `nombre` required; `descripcion` optional; `activo` NOT in this DTO (defaults to true in entity)

- [x] T004 [P] CREATE `src/modules/recetas/dto/update-receta.dto.ts` — update DTO (no establecimiento_id)
  - **Implements**: plan.md Phase 2, Task 2.2
  - **`establecimiento_id` MUST NOT appear in this DTO** — immutability enforced by controller guard (not DTO omission alone)
  - **Fields**:
    - `nombre?: string` — `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)`
    - `descripcion?: string` — `@IsOptional() @IsString()`
    - `activo?: boolean` — `@IsOptional() @IsBoolean()`
  - **Acceptance**: DTO exported; all fields optional; no `establecimiento_id` or `tenant_id` field present

- [x] T005 [P] CREATE `src/modules/recetas/dto/query-recetas.dto.ts` — list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Fields**:
    - `q?: string` — `@IsOptional() @IsString()` — ILIKE search on nombre
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `activo?: boolean` — `@IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)` — coerce `'true'`/`'false'` strings; **NO default value** (FR-007: no default filter)
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Import** `Transform` from `class-transformer`
  - **Acceptance**: DTO exported; `activo` has no default; `activo=false` (string) transforms to boolean `false`; extends `PageQueryDto`

**Checkpoint**: T001–T005 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 + 2 — Manage and browse the recipe catalog (Priority: P1+P2) 🎯 MVP

**Goal (US1)**: supervisor and admin_global can create recipes for a specific establishment; uniqueness enforced; cross-tenant establishment rejected; audit written.
**Goal (US2)**: all authenticated users can list, search, filter by `establecimiento_id`/`activo`, and retrieve recipes by ID. No default `activo` filter — all non-deleted recipes returned by default.

**Independent Test (US1)**: POST `/recetas` as supervisor with valid establishment + unique nombre → 201. POST same nombre + same establishment → 409 `RECETA_NOMBRE_DUPLICADO`. POST with cross-tenant establishment → 404. POST as operario → 403.
**Independent Test (US2)**: GET `/recetas` (no filters) → both active and inactive returned. GET `?activo=false` → inactive only. GET `?q=herb` → nombre ILIKE match. GET `/recetas/:id` → 200. GET `/admin/recetas` as admin_global → 200; as supervisor → 403.

### Implementation for User Story 1 + 2

- [x] T006 [US1] CREATE `src/modules/recetas/recetas.service.ts` — complete RecetasService
  - **Implements**: plan.md Phase 3, Task 3.1; research.md Decisions 1, 3, 4, 5, 6
  - **⚠️ CRITICAL**: `RecetasService extends BaseCrudTenantService<Receta>` — DO extend the base class (unlike M03 SiembraService)
  - **Constructor**: `super(recetaRepo)` — inject `@InjectRepository(Receta) private readonly recetaRepo: Repository<Receta>` and `private readonly estService: EstablecimientosService`
  - **Export `AUDIT` const**: `{ CREATED: 'receta_created', UPDATED: 'receta_updated', DELETED: 'receta_deleted' }`
  - **Implement `listRecetas(q: QueryRecetasDto)`**:
    ```typescript
    async listRecetas(q: QueryRecetasDto): Promise<{ items: Receta[]; total: number }> {
      const filters: Record<string, unknown> = {};
      if (q.establecimiento_id !== undefined) filters['establecimiento_id'] = q.establecimiento_id;
      if (q.activo !== undefined) filters['activo'] = q.activo; // ← NO default (FR-007)
      return this.list(
        { ...q, filters },
        {
          searchColumns: ['nombre'],
          filterAllowed: ['establecimiento_id', 'activo'],
          sortAllowed: ['nombre', 'created_at'],
          sortFallback: { by: 'created_at', order: 'DESC' },
          strictTenant: true,
        },
      );
    }
    ```
  - **Implement `createReceta(dto: CreateRecetaDto)`**:
    1. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` — throws 404 if not in tenant
    2. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
    3. `const conflict = await this.recetaRepo.findOne({ where: { tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, nombre: dto.nombre } })` — TypeORM excludes soft-deleted by default
    4. If `conflict` → `throw new AppError({ code: ErrorCodes.RECETA_NOMBRE_DUPLICADO, message: 'Ya existe una receta con ese nombre en este establecimiento', status: 409 })`
    5. `return this.create(dto, { strictTenant: true })` — `tenant_id` set automatically from tenantContext; `establecimiento_id` passes through from `dto`
  - **Implement `updateReceta(id: string, dto: UpdateRecetaDto)`**:
    1. `const current = await this.mustFindById(id, { strictTenant: true })` — throws 404
    2. If `dto.nombre !== undefined && dto.nombre !== current.nombre`:
       - `const tenantId = this.getTenantId({ strictTenant: true }) as string`
       - QB conflict check: `WHERE tenant_id = tenantId AND establecimiento_id = current.establecimiento_id AND nombre = dto.nombre AND id != id`
       - If found → `throw new AppError({ code: ErrorCodes.RECETA_NOMBRE_DUPLICADO, status: 409 })`
    3. `return this.update(id, dto, { strictTenant: true })`
  - **Implement `deleteReceta(id: string)`**:
    1. `await this.mustFindById(id, { strictTenant: true })` — throws 404
    2. `await this.softDelete(id, { strictTenant: true })`
    3. **No M08 reference check** (per spec clarification Q4 — forward-compat deferred to M08)
  - **Acceptance**: Service compiles; `listRecetas({})` returns both active and inactive; `createReceta` with duplicate nombre → 409; `createReceta` with cross-tenant establishment → 404; no `any` types

- [x] T007 [P] [US1] CREATE `src/modules/recetas/recetas.controller.ts` — main controller (all 5 endpoints)
  - **Implements**: plan.md Phase 4, Task 4.1
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('recetas')`
  - **Constructor**: inject `RecetasService`, `AuditService`, `PinoLogger`
  - **Declare `AuthRequest` type** locally (same pattern as `lotes.controller.ts`):
    ```typescript
    type AuthRequest = Request & {
      user: JwtPayload;
      id: string;
      tenantId?: string | null;
      method: string;
      url: string;
      body: Record<string, unknown>;
    };
    ```
  - **Implement all 5 endpoints**:
    - `GET /` — no `@Roles` (all authenticated); call `svc.listRecetas(q)` with `clampPagination`; return `page(items, p, limit, total)`
    - `GET /:id` — no `@Roles`; call `this.svc.mustFindById(id, { strictTenant: true })`; return `ok(receta)`
    - `POST /` — `@Roles('supervisor', 'admin_global')` `@HttpCode(HttpStatus.CREATED)`; call `svc.createReceta(dto)`; write audit `AUDIT.CREATED` with `extra: { recetaId: receta.id, nombre: receta.nombre, establecimiento_id: receta.establecimiento_id }`; return `ok(receta)`
    - `PATCH /:id` — `@Roles('supervisor', 'admin_global')` — **IMMUTABLE FIELDS GUARD MUST BE FIRST LINE IN HANDLER**:
      ```typescript
      const ALLOWED = new Set(['nombre', 'descripcion', 'activo']);
      if (Object.keys((req.body as Record<string, unknown>) ?? {}).some((k) => !ALLOWED.has(k))) {
        throw new AppError({
          code: ErrorCodes.RECETA_FIELD_IMMUTABLE,
          message: 'Solo se pueden modificar nombre, descripcion y activo',
          status: 400,
        });
      }
      ```
      then call `svc.updateReceta(id, dto)`; write audit `AUDIT.UPDATED` with `extra: { recetaId: id, fields: Object.keys(dto) }`; return `ok(updated)`
    - `DELETE /:id` — `@Roles('admin_global')`; call `svc.deleteReceta(id)`; write audit `AUDIT.DELETED` with `extra: { recetaId: id }`; return `ok({ deleted: true })`
  - **Audit write pattern** (follow `lotes.controller.ts` exactly):
    ```typescript
    const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, actorEmail: req.user?.email, action: AUDIT.CREATED, entity: 'receta', extra: { ... } });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', { request_id: req.id, method: req.method, path: req.url, status_code: 201, actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null, action: AUDIT.CREATED, entity: 'receta', tenant_id: req.tenantId ?? null, payload });
    ```
  - **Acceptance**: Controller compiles; POST as operario → 403; PATCH with `{ establecimiento_id: '...' }` → 400 `RECETA_FIELD_IMMUTABLE`; GET with no filters → both active and inactive; all responses use `ok()` or `page()`

- [x] T008 [P] [US2] CREATE `src/modules/recetas/admin-recetas.controller.ts` — admin panel controller
  - **Implements**: plan.md Phase 4, Task 4.2
  - **Class decorator**: `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/recetas')`
  - **Constructor**: inject `RecetasService` only
  - **Implement** `GET /`: call `svc.listRecetas(q)` with `clampPagination`; return `page(items, p, limit, total)`
  - **Acceptance**: GET `/admin/recetas` as admin_global → 200 paginated list; as supervisor → 403; returns both active and inactive recipes

- [x] T009 [US1] CREATE `src/modules/recetas/recetas.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.3
  - **imports**: `TypeOrmModule.forFeature([Receta])`, `TenancyModule`, `AuditModule`, `EstablecimientosModule`
  - **providers**: `[RecetasService]`
  - **controllers**: `[RecetasController, AdminRecetasController]`
  - **exports**: `[RecetasService]`
  - **⚠️ `EstablecimientosModule` MUST be imported** — provides `EstablecimientosService` injected into `RecetasService`
  - **Acceptance**: Module compiles; no circular dependency errors; `EstablecimientosModule` present in imports

- [x] T010 [US1] MODIFY `src/app.module.ts` — register RecetasModule
  - **Implements**: plan.md Phase 4, Task 4.4
  - **Add** `import { RecetasModule } from './modules/recetas/recetas.module'` at top
  - **Add** `RecetasModule` to `imports` array after `SiembraModule`
  - **Acceptance**: `npx tsc --noEmit` passes; `npm run start:dev` starts without error; all recetas and admin/recetas endpoints available

**✅ MVP Checkpoint (after T010)**: Full US1 + US2 functionality working:
- POST `/recetas` as supervisor/admin_global → 201
- Duplicate nombre in same establishment → 409 `RECETA_NOMBRE_DUPLICADO`
- Cross-tenant establishment → 404
- GET `/recetas` (no filters) → both active and inactive
- GET `/recetas?activo=true` → active only; `?activo=false` → inactive only
- GET `/recetas?q=search` → nombre ILIKE search
- GET `/recetas/:id` → 200 or 404
- GET `/admin/recetas` as admin_global → 200; as supervisor → 403
- Audit events `receta_created` written
- `npx tsc --noEmit` passes

---

## Phase 3: User Story 3 — Update recipe details as supervisor or admin_global (Priority: P3)

**Goal**: supervisor and admin_global can update `nombre`, `descripcion`, and `activo`; duplicate-nombre conflicts rejected; `establecimiento_id` in body rejected; operario cannot PATCH.

**Independent Test**: PATCH `/recetas/:id` as supervisor with `{ nombre: 'new-name' }` → 200. PATCH with `{ nombre: 'existing-name' }` → 409. PATCH with `{ establecimiento_id: '...' }` → 400 `RECETA_FIELD_IMMUTABLE`. PATCH `{ activo: false }` → 200. PATCH as operario → 403.

**Prerequisite**: US1+US2 complete (T006–T010) — PATCH endpoint implemented in T007.

### Implementation for User Story 3

- [x] T011 [US3] VERIFY `src/modules/recetas/recetas.controller.ts` — confirm PATCH immutable fields guard and update behavior
  - **Implements**: spec.md US3 acceptance scenarios; plan.md Phase 4 § PATCH guard; research.md Decision 2
  - **Verify** the `PATCH /:id` handler has `@Roles('supervisor', 'admin_global')` — operario must get 403
  - **Verify** the immutable fields guard is THE VERY FIRST LOGIC IN THE HANDLER (before any service call):
    - Uses `ALLOWED = new Set(['nombre', 'descripcion', 'activo'])`
    - `Object.keys((req.body as Record<string, unknown>) ?? {}).some((k) => !ALLOWED.has(k))` → true → throws `RECETA_FIELD_IMMUTABLE 400`
    - Specifically: `establecimiento_id` in body → 400; `tenant_id` in body → 400; any unknown field → 400
  - **Verify** `updateReceta` in service checks for nombre conflict excluding current record id (QB with `id != :currentId`)
  - **Verify** audit event `receta_updated` written after successful update
  - **Acceptance**: PATCH `{ nombre: 'new' }` as supervisor → 200; PATCH `{ establecimiento_id: '...' }` → 400; PATCH `{ activo: false }` → 200 with activo changed; PATCH as operario → 403; nombre duplicate → 409

**Checkpoint**: US3 verified. supervisor/admin_global can update recipes; immutable fields strictly rejected.

---

## Phase 4: User Story 4 — Delete a recipe as admin_global (Priority: P3)

**Goal**: admin_global can soft-delete a recipe; record preserved in DB; nombre available for reuse after deletion; supervisor cannot delete.

**Independent Test**: DELETE `/recetas/:id` as admin_global → 200 `{ deleted: true }`. Verify `deleted_at` set in DB. POST new recipe with same nombre for same establishment → 201 (soft-deleted record does not block). DELETE as supervisor → 403.

**Prerequisite**: US1+US2 complete — `deleteReceta` implemented in T006; DELETE endpoint in T007.

### Implementation for User Story 4

- [x] T012 [US4] VERIFY `src/modules/recetas/recetas.service.ts` + `src/modules/recetas/recetas.controller.ts` — confirm delete behavior
  - **Implements**: spec.md US4 acceptance scenarios; plan.md Phase 3 § deleteReceta; research.md Decision 1
  - **Verify service** `deleteReceta`:
    1. `mustFindById(id, { strictTenant: true })` — throws `RECETA_NOT_FOUND 404` if not found or wrong tenant
    2. `softDelete(id, { strictTenant: true })` — sets `deleted_at`; inherited from `BaseCrudTenantService`
    3. **No M08 reference check** — per spec clarification Q4; forward-compat deferred to M08
  - **Verify controller** `DELETE /:id` has `@Roles('admin_global')` — supervisor must get 403
  - **Verify** audit event `receta_deleted` written after successful delete
  - **Verify** uniqueness partial index: soft-deleted nombre does NOT block new creation with same nombre (verify `createReceta` uses `findOne` without `withDeleted` — TypeORM excludes soft-deleted by default)
  - **Acceptance**: DELETE as admin_global → 200; `deleted_at` set in DB; POST same nombre+establishment after delete → 201; DELETE as supervisor → 403; audit event present

**Checkpoint**: US4 verified. admin_global can soft-delete recipes; traceability preserved; nombre reuse confirmed.

---

## Phase 5: Migration & Final Verification

**Purpose**: Confirm migration integrity and run full compile + smoke tests.

- [ ] T013 VERIFY `migrations/1770500000000-RecetasInit.ts` — confirm migration created in plan phase
  - **Action**: VERIFY ONLY — file already exists, do NOT recreate or modify
  - **Check**:
    - File exports class `RecetasInit1770500000000 implements MigrationInterface`
    - `up()` creates `recetas` table, then 3 regular indexes (`IDX_recetas_tenant_id`, `IDX_recetas_establecimiento_id`, `IDX_recetas_activo`), then partial unique index `UQ_recetas_tenant_est_nombre ON recetas(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL`
    - `down()` drops indexes in reverse order (`UQ_` first, then activo, establecimiento, tenant), then table
    - **No FK constraints** on `establecimiento_id` (loose coupling)
    - Timestamp `1770500000000 > 1770400000000` (M03 siembra)
  - **Acceptance**: File exists at `migrations/1770500000000-RecetasInit.ts`; `npx tsc --noEmit` includes it without errors

- [ ] T014 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` type warnings; all imports resolve

- [ ] T015 Run migration against local database
  - **Command**: `npm run migration:run` (check `package.json` for exact script name)
  - **Prerequisite**: T013 verified; local DB running with M01–M03 migrations applied
  - **Acceptance**: Migration runs without error; `recetas` table exists; all 4 indexes exist including `UQ_recetas_tenant_est_nombre`; running again does NOT fail

- [ ] T016 [P] Run eslint on recetas module
  - **Command**: `npx eslint src/modules/recetas/ --ext .ts` (after T010 complete)
  - **Acceptance**: Zero errors

- [ ] T017 Manual smoke tests (13 paths from plan.md Phase 6)
  - **Prerequisite**: T015 complete; server running (`npm run start:dev`)
  - **US1 tests**:
    1. `POST /recetas` as supervisor with valid establishment + unique nombre → **201**
    2. `POST /recetas` same nombre + same establishment → **409** `RECETA_NOMBRE_DUPLICADO`
    3. `POST /recetas` with establishment from different tenant → **404**
    4. `POST /recetas` as operario → **403**
  - **US2 tests**:
    5. `GET /recetas` (no filters) → **200** — both active and inactive returned
    6. `GET /recetas?activo=true` → **200** — active only
    7. `GET /recetas?activo=false` → **200** — inactive only
    8. `GET /recetas?q=herb` → **200** — nombre ILIKE match
    9. `GET /recetas/:id` → **200** or **404** `RECETA_NOT_FOUND`
    10. `GET /admin/recetas` as admin_global → **200** paginated list
    11. `GET /admin/recetas` as supervisor → **403**
  - **US3 tests**:
    12. `PATCH /recetas/:id` with `{ establecimiento_id: '...' }` as supervisor → **400** `RECETA_FIELD_IMMUTABLE`
    13. `PATCH /recetas/:id` with `{ activo: false }` as supervisor → **200**
  - **US4 tests**:
    14. `DELETE /recetas/:id` as admin_global → **200** `{ deleted: true }` + audit
    15. `DELETE /recetas/:id` as supervisor → **403**
  - **Acceptance**: All 15 paths return expected status codes; responses use `ok()`/`page()` wrappers; audit events for create, update, delete present in DB

**✅ Final Checkpoint (M04 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 17 tasks checked
- All 15 smoke tests passing
- No default `activo` filter confirmed (both active and inactive returned without filter)
- Partial unique index confirmed: duplicate nombre rejected; soft-deleted nombre reusable
- `EstablecimientosModule` imported in `RecetasModule`

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational) ──► Phase 2 (US1+US2 MVP) ──► Phase 3 (US3 verify) ──► Phase 4 (US4 verify) ──► Phase 5 (Verify)
```

- **Foundational (T001–T005)**: No dependencies — start immediately; T001 first, T002–T005 in parallel
- **US1+US2 (T006–T010)**: All T001–T005 must be done — BLOCKS all user story work
- **US3 (T011)**: US1+US2 complete — PATCH endpoint implemented in T007; this is verification only
- **US4 (T012)**: US1+US2 complete — DELETE endpoint implemented in T007; this is verification only
- **Verify (T013–T017)**: All code phases complete

### Within Each Phase

- Foundation: T001 first (error codes), then T002–T005 in parallel (entity + DTOs)
- US1+US2: T006 → T007 [P] + T008 [P] → T009 → T010
- US3: T011 (verify only, after T010)
- US4: T012 (verify only, after T010)
- Verify: T013 [P] + T014 [P] → T015 → T016 [P] + T017

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create Receta entity
T003: Create CreateRecetaDto
T004: Create UpdateRecetaDto
T005: Create QueryRecetasDto

# US1+US2 controllers parallel batch (after T006):
T007: Create RecetasController (all 5 endpoints)
T008: Create AdminRecetasController

# Verify parallel batch (after T012):
T013: Verify migration file
T014: Run tsc --noEmit
T016: Run eslint (after T015)
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Foundational (T001–T005)
2. Complete Phase 2: US1+US2 (T006–T010)
3. **STOP and VALIDATE**: POST/GET recetas work; no default activo filter confirmed; tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation → US1+US2 → **demo supervisor creates recipes + operario browses catalog** (MVP)
2. Verify US3 (T011) → **confirm supervisor can update; immutable fields rejected**
3. Verify US4 (T012) → **confirm admin_global deletes; nombre reuse after soft-delete**
4. Migration + verification (T013–T017) → **production ready**

---

## Notes

- `[P]` tasks touch different files — safe to work in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- US3 (T011) and US4 (T012) are **verify** tasks — the code was already written in T006/T007; no new files
- `RecetasService` DOES extend `BaseCrudTenantService<Receta>` — do NOT omit `extends` (unlike M03 SiembraService which was plain Injectable)
- The `listRecetas` method does NOT add a default `activo` filter — FR-007 requires all non-deleted records when no filter is provided
- The PATCH immutable guard checks `req.body` (raw Express body before ValidationPipe) — must be THE FIRST logic in the PATCH handler
- Migration (T013) already exists — **do NOT recreate it**
- `EstablecimientosModule` must be in `RecetasModule.imports` — otherwise NestJS DI cannot inject `EstablecimientosService`
- `create()` from `BaseCrudTenantService` sets `tenant_id` automatically; `establecimiento_id` passes through from `dto`
- In `updateReceta`, the QB conflict check must exclude the current record by ID to allow updating a recipe without changing nombre (or rename to same value)
