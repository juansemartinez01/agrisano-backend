# Tasks: M01 — Establecimientos

**Input**: Design documents from `/specs/001-establecimientos/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US4)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until this phase completes.

**⚠️ CRITICAL**: No user story work can begin until T001–T006 are done.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add three establecimientos domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// establecimientos` comment:
    ```typescript
    ESTABLECIMIENTO_NOT_FOUND: 'ESTABLECIMIENTO_NOT_FOUND',
    ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
    ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
    ```
  - **Acceptance**: `grep "ESTABLECIMIENTO_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; file still compiles

- [x] T002 [P] CREATE `src/modules/establecimientos/entities/establecimiento.entity.ts` — Establecimiento entity
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Establecimiento
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Columns**: `nombre: varchar(150) NOT NULL`, `ubicacion: varchar(300) nullable`, `activo: boolean DEFAULT true`
  - **Decorator**: `@Entity('establecimientos')`
  - **Acceptance**: File exports `Establecimiento` class; `npx tsc --noEmit` passes on this file

- [x] T003 [P] CREATE `src/modules/establecimientos/entities/usuario-establecimiento.entity.ts` — join table entity
  - **Implements**: plan.md Phase 1, Task 1.3; data-model.md § UsuarioEstablecimiento
  - **Does NOT extend BaseEntity** (no tenant_id, no soft delete)
  - **Columns**: `id: uuid PK`, `user_id: uuid NOT NULL`, `establecimiento_id: uuid NOT NULL`, `assigned_at: timestamptz DEFAULT now()`
  - **Constraint**: `@Unique('UQ_ue_user_establecimiento', ['user_id', 'establecimiento_id'])`
  - **No FK relations** in entity (FKs live in migration only)
  - **Acceptance**: File exports `UsuarioEstablecimiento`; `npx tsc --noEmit` passes

- [x] T004 [P] CREATE `src/modules/establecimientos/dto/create-establecimiento.dto.ts` — create DTO
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Fields**: `nombre: string` (`@IsString @IsNotEmpty @MaxLength(150)`), `ubicacion?: string` (`@IsOptional @IsString @MaxLength(300)`)
  - **Acceptance**: DTO exported; class-validator decorators applied; no `any`

- [x] T005 [P] CREATE `src/modules/establecimientos/dto/update-establecimiento.dto.ts` — update DTO
  - **Implements**: plan.md Phase 2, Task 2.2
  - **Extend** `PartialType(CreateEstablecimientoDto)` from `@nestjs/mapped-types`
  - **Add** `activo?: boolean` with `@IsOptional @IsBoolean`
  - **Acceptance**: DTO exported; all fields optional; `activo` field present

- [x] T006 [P] CREATE `src/modules/establecimientos/dto/query-establecimientos.dto.ts` — list query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Add**: `q?: string` (`@IsOptional`), `activo?: boolean` (`@IsOptional @IsBoolean @Transform`), `sortBy?: string`, `sortOrder?: 'ASC' | 'DESC'`
  - **Acceptance**: DTO exported; `activo` is transformed from string `'true'`/`'false'` to boolean

**Checkpoint**: All 6 files exist. `npx tsc --noEmit` passes. No user story work until this checkpoint is clear.

---

## Phase 2: User Story 1 — Manage establishments as admin_global (Priority: P1) 🎯 MVP

**Goal**: admin_global can create, read, update, deactivate, and delete establishments; audit events are recorded for each operation; admin panel list endpoint works.

**Independent Test**: POST `/establecimientos` as admin_global → 201. GET `/establecimientos` → paginated list. PATCH `/:id` with `activo:false` → 200, two audit events. DELETE `/:id` → 200. GET `/admin/establecimientos` → 200. Non-admin_global role → 403 on write endpoints.

### Implementation for User Story 1

- [x] T007 [US1] CREATE `src/modules/establecimientos/establecimientos.service.ts` — service with admin_global paths
  - **Implements**: plan.md Phase 3, Task 3.1 (admin_global paths only)
  - **Extend** `BaseCrudTenantService<Establecimiento>` from `src/common/crud/base-crud.service`
  - **Constructor**: inject `@InjectRepository(Establecimiento) estRepo`, `@InjectRepository(UsuarioEstablecimiento) ueRepo`, `UsersService`; call `super(estRepo)`
  - **Define** module-level `AUDIT` const with keys: `CREATED`, `UPDATED`, `DEACTIVATED`, `DELETED`, `USER_ASSIGNED`, `USER_REMOVED` (string values, plan.md research.md Decision 4)
  - **Implement** `listForUser(q: QueryEstablecimientosDto, actor: {userId: string; roles: string[]})`:
    - If `actor.roles.includes('admin_global')`: call `this.list(q, { searchColumns: ['nombre'], filterAllowed: ['activo'], sortAllowed: ['nombre', 'created_at'], strictTenant: true })`
    - Else: placeholder `return { items: [], total: 0 }` (supervisor/operario paths added in T014)
  - **Implement** `findOneForUser(id: string, actor: {userId: string; roles: string[]})`:
    - If `admin_global`: call `this.mustFindById(id, { strictTenant: true })`
    - Else: throw `AppError({ code: ErrorCodes.ESTABLECIMIENTO_NOT_FOUND, message: 'Establecimiento no encontrado', status: 404 })` (full implementation in T014)
  - **Implement** `createEstablecimiento(dto: CreateEstablecimientoDto)`: call `this.create(dto, { strictTenant: true })`
  - **Implement** `updateEstablecimiento(id: string, dto: UpdateEstablecimientoDto)`:
    - Load current row: `const prev = await this.mustFindById(id, { strictTenant: true })`
    - Apply: `const updated = await this.update(id, dto, { strictTenant: true })`
    - Return `{ updated, wasDeactivated: prev.activo === true && dto.activo === false }`
  - **Implement** `deleteEstablecimiento(id: string)`:
    - Call `this.mustFindById(id, { strictTenant: true })` first (throws 404 if missing)
    - Call `this.softDelete(id, { strictTenant: true })`
  - **Export** `AUDIT` const (or re-export audit action strings for use in controllers)
  - **Acceptance**: Service compiles with `npx tsc --noEmit`; admin_global list/create/update/delete methods work; no `any` types

- [x] T008 [P] [US1] CREATE `src/modules/establecimientos/establecimientos.controller.ts` — main controller with admin_global CRUD endpoints
  - **Implements**: plan.md Phase 4, Task 4.1
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('establecimientos')`
  - **Constructor**: inject `EstablecimientosService`, `AuditService`, `PinoLogger`
  - **Implement all 5 base endpoints** (assignment endpoints added in T013):
    - `GET /` — `@Roles('admin_global')` (supervisor/operario added in T015/T016); extract actor from `req.user`; call `listForUser(q, actor)`; return `page(items, p, limit, total)` via `clampPagination`
    - `GET /:id` — `@Roles('admin_global')`; call `findOneForUser(id, actor)`; return `ok(est)`
    - `POST /` — `@Roles('admin_global')`; call `createEstablecimiento(dto)`; write audit `AUDIT.CREATED`; return `ok(est)` with `@HttpCode(201)`
    - `PATCH /:id` — `@Roles('admin_global')`; call `updateEstablecimiento(id, dto)`; write audit `AUDIT.UPDATED` (and separately `AUDIT.DEACTIVATED` if `wasDeactivated`); return `ok(updated)`
    - `DELETE /:id` — `@Roles('admin_global')`; call `deleteEstablecimiento(id)`; write audit `AUDIT.DELETED`; return `ok({ deleted: true })`
  - **Audit write pattern** (see research.md Decision 7 + admin-users.controller.ts pattern):
    ```typescript
    const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, actorEmail: req.user?.email, action: AUDIT.CREATED, entity: 'establecimiento', extra: { id: est.id } });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', { request_id: req.id, method: req.method, path: req.url, status_code: 201, actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null, action: AUDIT.CREATED, entity: 'establecimiento', tenant_id: req.tenantId ?? null, payload });
    ```
  - **Acceptance**: Controller compiles; `POST /establecimientos` as admin_global returns 201; audit event written; no raw entities in responses

- [x] T009 [P] [US1] CREATE `src/modules/establecimientos/admin-establecimientos.controller.ts` — admin panel controller
  - **Implements**: plan.md Phase 4, Task 4.2
  - **Class decorator**: `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/establecimientos')`
  - **Constructor**: inject `EstablecimientosService`
  - **Implement** `GET /` endpoint: extract actor from `req.user`; call `svc.listForUser(q, actor)` (admin_global always); apply `clampPagination`; return `page(items, p, limit, total)`
  - **Acceptance**: Controller compiles; GET `/admin/establecimientos` as admin_global returns paginated list

- [x] T010 [US1] CREATE `src/modules/establecimientos/establecimientos.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.3
  - **imports**: `TypeOrmModule.forFeature([Establecimiento, UsuarioEstablecimiento])`, `TenancyModule`, `AuditModule`, `UsersModule`
  - **providers**: `[EstablecimientosService]`
  - **controllers**: `[EstablecimientosController, AdminEstablecimientosController]`
  - **exports**: `[EstablecimientosService]`
  - **Acceptance**: Module compiles; all providers resolve without circular dependency errors

- [x] T011 [US1] MODIFY `src/app.module.ts` — register EstablecimientosModule
  - **Implements**: plan.md Phase 4, Task 4.4
  - **Add** `import { EstablecimientosModule } from './modules/establecimientos/establecimientos.module'` at top
  - **Add** `EstablecimientosModule` to the `imports` array (after `FilesModule`)
  - **Acceptance**: `npx tsc --noEmit` passes on app.module.ts; `npm run start:dev` starts without error

**Checkpoint**: US1 complete. POST/GET/PATCH/DELETE `/establecimientos` work for admin_global. Audit events written. GET `/admin/establecimientos` works. `npx tsc --noEmit` passes.

---

## Phase 3: User Story 4 — Manage establishment assignments as admin_global (Priority: P2)

**Goal**: admin_global can assign users to establishments, remove them, and list assigned users; duplicate assignment returns 409; audit events recorded.

**Independent Test**: POST `/establecimientos/:id/usuarios/:userId` → 201, audit written. Repeat → 409. GET `/:id/usuarios` as admin_global → list with user details. DELETE `/:id/usuarios/:userId` → 200, audit written.

**Prerequisite**: US1 complete (T007–T011).

### Implementation for User Story 4

- [x] T012 [US4] MODIFY `src/modules/establecimientos/establecimientos.service.ts` — add assignment methods
  - **Implements**: plan.md Phase 3, Task 3.1 (assignUser, removeUser, listUsers methods)
  - **Implement** `assignUser(establecimientoId: string, assigneeUserId: string)`:
    1. `const tenantId = this.getTenantId({ strictTenant: true })`
    2. Verify establishment: `await this.mustFindById(establecimientoId, { strictTenant: true })`
    3. Verify assignee user: `const user = await this.usersService.getByIdAdmin(assigneeUserId, false)`; if `!user || user.tenant_id !== tenantId` → throw `AppError({ code: ErrorCodes.NOT_FOUND, message: 'User not found in this tenant', status: 404 })`
    4. Try insert: `await this.ueRepo.save(this.ueRepo.create({ user_id: assigneeUserId, establecimiento_id: establecimientoId }))`
    5. Catch UNIQUE violation (TypeORM `QueryFailedError` with code `'23505'`) → rethrow as `AppError({ code: ErrorCodes.ASSIGNMENT_CONFLICT, message: 'User already assigned to this establishment', status: 409 })`
    6. Return saved assignment record
  - **Implement** `removeUser(establecimientoId: string, assigneeUserId: string)`:
    1. Verify establishment: `await this.mustFindById(establecimientoId, { strictTenant: true })`
    2. Find assignment: `const ue = await this.ueRepo.findOne({ where: { establecimiento_id: establecimientoId, user_id: assigneeUserId } })`; if null → throw `AppError({ code: ErrorCodes.ASSIGNMENT_NOT_FOUND, status: 404 })`
    3. `await this.ueRepo.remove(ue)`
  - **Implement** `listUsers(establecimientoId: string, actor: {userId: string; roles: string[]})`:
    1. Verify access: `await this.findOneForUser(establecimientoId, actor)` (throws 404 if not accessible)
    2. `return this.ueRepo.find({ where: { establecimiento_id: establecimientoId } })`
  - **Acceptance**: Methods compile; `assignUser` throws 409 on duplicate; `removeUser` throws 404 on missing assignment

- [x] T013 [US4] MODIFY `src/modules/establecimientos/establecimientos.controller.ts` — add assignment endpoints
  - **Implements**: plan.md Phase 4, Task 4.1 (assignment endpoints)
  - **Add** three endpoints (all with `@Roles('admin_global')` except listUsers which adds 'supervisor' in T015):
    - `POST /:id/usuarios/:userId` — `@Roles('admin_global')` `@HttpCode(201)`; call `svc.assignUser(id, userId)`; write audit `AUDIT.USER_ASSIGNED` with `targetUserId: userId`; return `ok(assignment)`
    - `DELETE /:id/usuarios/:userId` — `@Roles('admin_global')`; call `svc.removeUser(id, userId)`; write audit `AUDIT.USER_REMOVED`; return `ok({ removed: true })`
    - `GET /:id/usuarios` — `@Roles('admin_global')` (supervisor added in T015); call `svc.listUsers(id, actor)`; return `ok(assignments)`
  - **Acceptance**: POST `/establecimientos/:id/usuarios/:userId` creates assignment + audit; second POST → 409; DELETE removes assignment + audit; GET returns list

**Checkpoint**: US4 complete. Assignment management fully working for admin_global with audit. Duplicate assignment returns 409.

---

## Phase 4: User Story 2 — View assigned establishments as supervisor (Priority: P2)

**Goal**: Supervisors can list and view only their assigned establishments; requesting an unassigned establishment returns 404 (not 403); supervisors can list users of an assigned establishment.

**Independent Test**: GET `/establecimientos` as supervisor → only assigned establishments. GET `/establecimientos/:id` for assigned → 200. GET `/establecimientos/:id` for unassigned → 404 (not 403). GET `/establecimientos/:id/usuarios` as supervisor → 200 for assigned. POST/PATCH/DELETE → 403.

**Prerequisite**: US4 complete (T012–T013) — assignments needed to test supervisor scoping.

### Implementation for User Story 2

- [x] T014 [US2] MODIFY `src/modules/establecimientos/establecimientos.service.ts` — add supervisor/operario access paths
  - **Implements**: plan.md Phase 3 Task 3.1 (supervisor/operario paths); research.md Decision 2 and Decision 3
  - **Update** `listForUser` — replace the `else` placeholder with the INNER JOIN path:
    ```typescript
    return this.list(q, {
      searchColumns: ['nombre'],
      filterAllowed: ['activo'],
      sortAllowed: ['nombre', 'created_at'],
      strictTenant: true,
      customizeQb: (qb, alias) => {
        qb.innerJoin(
          'usuario_establecimiento',
          'ue',
          `ue.establecimiento_id = ${alias}.id AND ue.user_id = :userId`,
          { userId: actor.userId },
        );
      },
    });
    ```
  - **Update** `findOneForUser` — replace the `else` throw with a real assignment check:
    ```typescript
    const qb = this.estRepo.createQueryBuilder('e')
      .innerJoin('usuario_establecimiento', 'ue', 'ue.establecimiento_id = e.id AND ue.user_id = :userId', { userId: actor.userId })
      .where('e.id = :id', { id })
      .andWhere('e.tenant_id = :tenantId', { tenantId: this.getTenantId({ strictTenant: true }) });
    const row = await qb.getOne();
    if (!row) throw new AppError({ code: ErrorCodes.ESTABLECIMIENTO_NOT_FOUND, message: 'Establecimiento no encontrado', status: 404 });
    return row;
    ```
  - **Acceptance**: Supervisor calling `listForUser` returns only assigned; `findOneForUser` for unassigned throws 404 (not 403); existing admin_global paths unchanged

- [x] T015 [US2] MODIFY `src/modules/establecimientos/establecimientos.controller.ts` — extend @Roles for supervisor access
  - **Implements**: plan.md Phase 4, Task 4.1 (supervisor role access)
  - **Update** `GET /` decorator: `@Roles('admin_global', 'supervisor')` (operario added in T016)
  - **Update** `GET /:id` decorator: `@Roles('admin_global', 'supervisor')` (operario added in T016)
  - **Update** `GET /:id/usuarios` decorator: `@Roles('admin_global', 'supervisor')` — supervisors can view users of their assigned establishment; the service `listUsers` already calls `findOneForUser` which enforces 404 for unassigned
  - **Acceptance**: Supervisor GET `/establecimientos` returns scoped list; GET `/:id` for unassigned → 404; GET `/:id/usuarios` for assigned → 200; POST/PATCH/DELETE still → 403 for supervisor

**Checkpoint**: US2 complete. Supervisors can read assigned establishments. Unassigned → 404. User list accessible for assigned establishments.

---

## Phase 5: User Story 3 — View assigned establishment as operario (Priority: P3)

**Goal**: Operarios can list and view only their single assigned establishment; all other establishments return 404; operarios cannot access assignment management endpoints.

**Independent Test**: GET `/establecimientos` as operario → only assigned establishment. GET `/establecimientos/:id` for assigned → 200. GET `/establecimientos/:id` for unassigned → 404. GET `/:id/usuarios` as operario → 403. POST/PATCH/DELETE → 403.

**Prerequisite**: US2 complete (T014–T015) — supervisor and operario paths share the same service implementation.

### Implementation for User Story 3

- [x] T016 [US3] MODIFY `src/modules/establecimientos/establecimientos.controller.ts` — extend @Roles for operario access on read endpoints
  - **Implements**: plan.md Phase 4, Task 4.1 (operario role); spec.md US3 acceptance scenarios
  - **Update** `GET /` decorator: `@Roles('admin_global', 'supervisor', 'operario')`
  - **Update** `GET /:id` decorator: `@Roles('admin_global', 'supervisor', 'operario')`
  - **DO NOT** add `'operario'` to `GET /:id/usuarios`, `POST /:id/usuarios/:userId`, or `DELETE /:id/usuarios/:userId` — operarios must get 403 on those
  - **Verify** service `listForUser` already handles `'operario'` role the same as `'supervisor'` (uses same INNER JOIN path — no `roles.includes('admin_global')`)
  - **Acceptance**: Operario GET `/establecimientos` returns only their establishment; GET `/:id/usuarios` → 403; POST (create) → 403

**Checkpoint**: US3 complete. All four user stories are independently functional. All role-based access rules enforced.

---

## Phase 6: Migration & Verification

**Purpose**: Persist schema to database and verify full stack works end to end.

- [ ] T017 [P] CREATE `migrations/1770200000000-EstablecimientosInit.ts` — full migration
  - **Implements**: plan.md Phase 5, Task 5.1; data-model.md § Migration
  - **Class**: `EstablecimientosInit1770200000000 implements MigrationInterface`
  - **`up()`**:
    1. CREATE TABLE `establecimientos` (id uuid PK, tenant_id uuid, nombre varchar(150) NOT NULL, ubicacion varchar(300), activo boolean DEFAULT true, timestamps, deleted_at)
    2. CREATE INDEX `IDX_establecimientos_tenant_id`
    3. CREATE TABLE `usuario_establecimiento` (id uuid PK, user_id uuid NOT NULL, establecimiento_id uuid NOT NULL, assigned_at timestamptz) with UNIQUE constraint `UQ_ue_user_establecimiento(user_id, establecimiento_id)` and FK constraints (CASCADE)
    4. CREATE INDEX on user_id and establecimiento_id
    5. INSERT INTO roles … `ON CONFLICT (name) DO NOTHING` for operario, supervisor, admin_global
  - **`down()`**: DROP TABLE usuario_establecimiento; DROP TABLE establecimientos; (do NOT remove roles)
  - **Acceptance**: File matches pattern of existing migrations in `migrations/`; timestamp > `1770146493842`

- [ ] T018 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` warnings; all imports resolve correctly

- [ ] T019 Run migration against local database
  - **Command**: `npm run migration:run` (or equivalent from package.json scripts)
  - **Prerequisite**: T017 complete; local DB running
  - **Acceptance**: Migration runs without error; `establecimientos` and `usuario_establecimiento` tables exist; roles `operario`, `supervisor`, `admin_global` are seeded; running again does NOT fail

- [ ] T020 [P] Run eslint on establecimientos module
  - **Command**: `npx eslint src/modules/establecimientos/ --ext .ts`
  - **Prerequisite**: T016 complete
  - **Acceptance**: Zero errors

- [ ] T021 Manual smoke tests (6 paths from plan.md Phase 6, Task 6.3)
  - **Prerequisite**: T019 complete; server running (`npm run start:dev`)
  - **Tests**:
    1. `POST /establecimientos` as admin_global → 201; establishment in DB
    2. `GET /establecimientos` as admin_global → paginated list with new establishment
    3. `GET /establecimientos` as supervisor (assigned) → only assigned
    4. `GET /establecimientos/:id` as supervisor (unassigned) → **404** (not 403)
    5. `POST /establecimientos/:id/usuarios/:userId` → 201; repeat → **409**
    6. `GET /establecimientos/:id/usuarios` as supervisor → 200
  - **Acceptance**: All 6 paths return expected status codes; no raw entity responses

**✅ Final Checkpoint (M01 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 21 tasks checked
- All 6 smoke tests passing
- Audit events recorded for CRUD + assignment operations

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational) ──► Phase 2 (US1) ──► Phase 3 (US4) ──► Phase 4 (US2) ──► Phase 5 (US3) ──► Phase 6 (Migration & Verify)
```

- **Foundational (T001–T006)**: No dependencies — start immediately
- **US1 (T007–T011)**: All T001–T006 must be done — BLOCKS all user story work
- **US4 (T012–T013)**: US1 must be complete (T011) — assignment management builds on CRUD
- **US2 (T014–T015)**: US4 must be complete — supervisor paths require assignments to exist for testing
- **US3 (T016)**: US2 must be complete — operario uses same service paths; just adds role to guards
- **Migration & Verify (T017–T021)**: All code phases complete

### User Story Dependencies

- **US1 (P1)**: Foundation complete → independent (no story deps)
- **US4 (P2)**: US1 complete → can be tested independently (admin_global assign/remove)
- **US2 (P2)**: US4 recommended first (need assignments to test scoping) → supervisor read
- **US3 (P3)**: US2 complete → operario is operationally identical to supervisor; adds role to guards

### Within Each Phase

- Foundation: T001 first, then T002–T006 in parallel
- US1: T007 → T008 [P] + T009 [P] → T010 → T011
- US4: T012 → T013
- US2: T014 → T015
- US3: T016
- Verify: T017 [P] + T018 [P] → T019 → T020 [P] + T021

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create Establecimiento entity
T003: Create UsuarioEstablecimiento entity
T004: Create CreateEstablecimientoDto
T005: Create UpdateEstablecimientoDto
T006: Create QueryEstablecimientosDto

# US1 parallel batch (after T007):
T008: Create EstablecimientosController
T009: Create AdminEstablecimientosController

# Final parallel batch (after T016):
T017: Create migration file
T018: Run tsc --noEmit
T020: Run eslint
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Foundational (T001–T006)
2. Complete Phase 2: US1 (T007–T011)
3. **STOP and VALIDATE**: admin_global CRUD works, audit written, tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation → US1 → **demo admin_global CRUD** (MVP)
2. Add US4 → **demo assignment management** (admin_global assigns supervisors/operarios)
3. Add US2 → **demo supervisor scoped read** (verify 404 for unassigned)
4. Add US3 → **demo operario read** (verify operario restrictions)
5. Migration + verification → **production ready**

### Solo Developer Path

Follow tasks sequentially: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021

---

## Notes

- `[P]` tasks touch different files — safe to work on in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- Service is modified incrementally (T007 → T012 → T014); each addition is a pure extension
- Migration (T017) is independent of compilation checks (T018) — run both in parallel
- The `AUDIT` constants defined in the service should be exported for use in controllers, OR duplicate the strings inline in controllers (both approaches are valid)
- `activo=false` → two audit events: `establecimiento_updated` AND `establecimiento_deactivated` (see plan.md § updateEstablecimiento)
- tenant_id in audit writes: include `tenant_id: req.tenantId ?? null` (pattern from admin-users.controller.ts comment)
