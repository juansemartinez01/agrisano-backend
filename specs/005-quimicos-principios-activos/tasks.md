# Tasks: M05 â€” Quimicos y Principios Activos

**Input**: Design documents from `/specs/005-quimicos-principios-activos/`

**Prerequisites**: plan.md âœ… | spec.md âœ… | research.md âœ… | data-model.md âœ… | contracts/api-spec.json âœ…

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1â€“US5)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001â€“T009 are done.

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` â€” add six quimicos domain error codes
  - **Implements**: plan.md Â§ Error Codes Added
  - **Add** under a `// quimicos` comment after the existing recetas block:
    ```typescript
    // quimicos
    QUIMICO_NOT_FOUND: 'QUIMICO_NOT_FOUND',
    QUIMICO_NOMBRE_DUPLICADO: 'QUIMICO_NOMBRE_DUPLICADO',
    QUIMICO_FIELD_IMMUTABLE: 'QUIMICO_FIELD_IMMUTABLE',
    PRINCIPIO_ACTIVO_NOT_FOUND: 'PRINCIPIO_ACTIVO_NOT_FOUND',
    PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO: 'PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO',
    PRINCIPIO_ACTIVO_REFERENCIADO: 'PRINCIPIO_ACTIVO_REFERENCIADO',
    ```
  - **Acceptance**: `grep "QUIMICO_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; all 6 codes present; `npx tsc --noEmit` still passes

- [x] T002 [P] CREATE `src/modules/quimicos/entities/quimico.entity.ts` â€” Quimico entity
  - **Implements**: plan.md Â§ Entity Summary; data-model.md Â§ Quimico
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Decorator**: `@Entity('quimicos')`
  - **Columns**:
    - `establecimiento_id`: `@Column({ type: 'uuid' })` â€” NOT NULL; immutable after creation (enforced at controller, not DB FK)
    - `nombre`: `@Column({ type: 'varchar', length: 150 })` â€” NOT NULL
    - `unidad_medida`: `@Column({ type: 'varchar', length: 30 })` â€” NOT NULL
    - `stock_actual`: `@Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })` â€” NOT NULL; read-only via API
    - `activo`: `@Column({ type: 'boolean', default: true })` â€” NOT NULL
  - **Add runtime-only property** (not a DB column, populated by `getQuimicoWithPrincipios()`):
    ```typescript
    principios_activos?: import('./principio-activo.entity').PrincipioActivo[];
    ```
  - **âš ï¸ NO `@Unique` decorator** â€” uniqueness lives in migration partial index only
  - **âš ï¸ NO `@ManyToMany`** â€” join table managed manually (research.md Decision 1)
  - **Acceptance**: File exports `Quimico`; `npx tsc --noEmit` passes; no `@Unique`, no `@ManyToMany`

- [x] T003 [P] CREATE `src/modules/quimicos/entities/principio-activo.entity.ts` â€” PrincipioActivo global catalog entity
  - **Implements**: plan.md Â§ Entity Summary; data-model.md Â§ PrincipioActivo
  - **âš ï¸ DO NOT extend `BaseEntity`** â€” plain entity; no `tenant_id`; no `deleted_at`
  - **Decorator**: `@Entity('principios_activos')`
  - **Columns**:
    - `id`: `@PrimaryGeneratedColumn('uuid')`
    - `nombre`: `@Column({ type: 'varchar', length: 100, unique: true })` â€” globally UNIQUE
    - `created_at`: `@CreateDateColumn({ type: 'timestamptz' })`
    - `updated_at`: `@UpdateDateColumn({ type: 'timestamptz' })`
  - **Import** `PrimaryGeneratedColumn`, `CreateDateColumn`, `UpdateDateColumn`, `Column`, `Entity` from `typeorm`
  - **Acceptance**: File exports `PrincipioActivo`; no `tenant_id` field; no `deleted_at`; `id` uses `@PrimaryGeneratedColumn('uuid')`; `npx tsc --noEmit` passes

- [x] T004 [P] CREATE `src/modules/quimicos/entities/quimico-principio-activo.entity.ts` â€” join table entity
  - **Implements**: plan.md Â§ Entity Summary; data-model.md Â§ QuimicoPrincipioActivo
  - **âš ï¸ DO NOT extend `BaseEntity`** â€” plain join table; composite PK only
  - **Decorator**: `@Entity('quimico_principio_activo')`
  - **Columns**:
    - `quimico_id`: `@PrimaryColumn({ type: 'uuid' })`
    - `principio_activo_id`: `@PrimaryColumn({ type: 'uuid' })`
  - **Import** `PrimaryColumn`, `Entity` from `typeorm`
  - **No FK decorators** â€” FK constraints live in migration only
  - **Acceptance**: File exports `QuimicoPrincipioActivo`; composite PK; no extra columns; `npx tsc --noEmit` passes

- [x] T005 [P] CREATE `src/modules/quimicos/dto/create-quimico.dto.ts` â€” create DTO
  - **Implements**: plan.md Â§ Files to Create #4
  - **Fields**:
    - `establecimiento_id: string` â€” `@IsUUID()` (required)
    - `nombre: string` â€” `@IsString() @IsNotEmpty() @MaxLength(150)` (required)
    - `unidad_medida: string` â€” `@IsString() @IsNotEmpty() @MaxLength(30)` (required)
    - `principios_activos?: string[]` â€” `@IsOptional() @IsArray() @IsUUID('4', { each: true })` â€” array of existing PA UUIDs; optional
  - **âš ï¸ NO `stock_actual` field** â€” initialized to 0 in service (FR-005)
  - **Acceptance**: DTO exported; all 3 required fields present; `principios_activos` optional UUID array; no `stock_actual`

- [x] T006 [P] CREATE `src/modules/quimicos/dto/update-quimico.dto.ts` â€” update DTO
  - **Implements**: plan.md Â§ Files to Create #5; spec.md FR-007/FR-008
  - **Fields** (all optional):
    - `nombre?: string` â€” `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)`
    - `unidad_medida?: string` â€” `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(30)`
    - `activo?: boolean` â€” `@IsOptional() @IsBoolean()`
    - `principios_activos?: string[]` â€” `@IsOptional() @IsArray() @IsUUID('4', { each: true })` â€” when present (even empty), replaces all existing links; when absent, links untouched
  - **âš ï¸ `establecimiento_id` MUST NOT appear in this DTO** â€” immutability enforced by controller guard
  - **âš ï¸ `stock_actual` MUST NOT appear in this DTO** â€” enforced by controller guard
  - **Acceptance**: All fields optional; no `establecimiento_id`; no `stock_actual`; `principios_activos` is optional UUID array

- [x] T007 [P] CREATE `src/modules/quimicos/dto/query-quimicos.dto.ts` â€” list/filter query DTO
  - **Implements**: plan.md Â§ Files to Create #6
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Fields**:
    - `q?: string` â€” `@IsOptional() @IsString()` â€” ILIKE search on nombre
    - `establecimiento_id?: string` â€” `@IsOptional() @IsUUID()`
    - `activo?: boolean` â€” `@IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)` â€” **NO default** (spec FR-001: no default activo filter)
    - `sortBy?: string` â€” `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` â€” `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Import** `Transform` from `class-transformer`
  - **Acceptance**: DTO exported; `activo` has no default; extends `PageQueryDto`; `activo=false` (string) transforms to boolean `false`

- [x] T008 [P] CREATE `src/modules/quimicos/dto/create-principio-activo.dto.ts` â€” create PA DTO
  - **Implements**: plan.md Â§ Files to Create #7
  - **Fields**:
    - `nombre: string` â€” `@IsString() @IsNotEmpty() @MaxLength(100)` (required)
  - **Acceptance**: DTO exported; `nombre` is required; `@MaxLength(100)` applied

- [x] T009 [P] CREATE `src/modules/quimicos/dto/update-principio-activo.dto.ts` â€” update PA DTO
  - **Implements**: plan.md Â§ Files to Create #8
  - **Fields**:
    - `nombre: string` â€” `@IsString() @IsNotEmpty() @MaxLength(100)` (required, not optional â€” spec requires nombre on PATCH)
  - **Acceptance**: DTO exported; `nombre` is required (NOT optional); `@MaxLength(100)` applied

**Checkpoint**: T001â€“T009 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 + 2 â€” Browse and Register Chemicals (Priority: P1+P2) ðŸŽ¯ MVP

**Goal (US1)**: Any authenticated user can list, search, and filter chemicals; retrieve single chemical with principios_activos[] nested.
**Goal (US2)**: supervisor/admin_global can create a new chemical; unknown principio_activo IDs rejected; duplicate nombre per establishment rejected; stock initialized to 0; audit written.

**Independent Test (US1)**: GET `/quimicos` (no filters) â†’ 200 paginated list (active and inactive). GET `?activo=true` â†’ active only. GET `?establecimiento_id=X` â†’ filtered. GET `/quimicos/:id` â†’ 200 with `principios_activos[]` array. GET unauthenticated â†’ 401.
**Independent Test (US2)**: POST `/quimicos` as supervisor with valid establishment + unique nombre â†’ 201, `stock_actual=0`. POST same nombre+establishment â†’ 409 `QUIMICO_NOMBRE_DUPLICADO`. POST with unknown `principios_activos` UUIDs â†’ 400 with `unknown_ids`. POST as operario â†’ 403.

### Implementation for User Story 1 + 2

- [x] T010 [US1] CREATE `src/modules/quimicos/quimicos.service.ts` â€” complete QuimicosService
  - **Implements**: plan.md Â§ Key Implementation Details; research.md Decisions 1, 3, 4, 7
  - **âš ï¸ CRITICAL**: `QuimicosService extends BaseCrudTenantService<Quimico>`
  - **Constructor**: `super(quimicoRepo)` â€” inject:
    - `@InjectRepository(Quimico) private readonly quimicoRepo: Repository<Quimico>`
    - `@InjectRepository(QuimicoPrincipioActivo) private readonly qpaRepo: Repository<QuimicoPrincipioActivo>`
    - `@InjectRepository(PrincipioActivo) private readonly paRepo: Repository<PrincipioActivo>`
    - `private readonly estService: EstablecimientosService`
    - `private readonly dataSource: DataSource`
  - **Export `AUDIT` const**:
    ```typescript
    export const AUDIT = {
      QUIMICO_CREATED: 'quimico_created',
      QUIMICO_UPDATED: 'quimico_updated',
      QUIMICO_DELETED: 'quimico_deleted',
      PA_CREATED: 'principio_activo_created',
      PA_UPDATED: 'principio_activo_updated',
      PA_DELETED: 'principio_activo_deleted',
    } as const;
    ```
  - **Implement `listQuimicos(q: QueryQuimicosDto)`**:
    ```typescript
    async listQuimicos(q: QueryQuimicosDto): Promise<{ items: Quimico[]; total: number }> {
      const filters: Record<string, unknown> = {};
      if (q.establecimiento_id !== undefined) filters['establecimiento_id'] = q.establecimiento_id;
      if (q.activo !== undefined) filters['activo'] = q.activo; // NO default (spec FR-001)
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
  - **Implement `getQuimicoWithPrincipios(id: string)`** (two-query approach):
    ```typescript
    async getQuimicoWithPrincipios(id: string): Promise<Quimico> {
      const quimico = await this.mustFindById(id, { strictTenant: true });
      const links = await this.qpaRepo.find({ where: { quimico_id: id } });
      if (links.length === 0) {
        quimico.principios_activos = [];
        return quimico;
      }
      const paIds = links.map((l) => l.principio_activo_id);
      quimico.principios_activos = await this.paRepo.findBy({ id: In(paIds) });
      return quimico;
    }
    ```
    Import `In` from `typeorm`.
  - **Implement `validatePrincipioActivoIds(ids: string[])`** (private helper):
    ```typescript
    private async validatePrincipioActivoIds(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      const found = await this.paRepo.findBy({ id: In(ids) });
      if (found.length !== ids.length) {
        const foundSet = new Set(found.map((p) => p.id));
        const unknownIds = ids.filter((id) => !foundSet.has(id));
        throw new AppError({
          code: ErrorCodes.BAD_REQUEST,
          message: 'Principios activos no encontrados',
          status: 400,
          details: { unknown_ids: unknownIds },
        });
      }
    }
    ```
  - **Implement `createQuimico(dto: CreateQuimicoDto)`**:
    1. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` â€” 404 if not in tenant
    2. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
    3. Uniqueness check: `await this.quimicoRepo.findOne({ where: { tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, nombre: dto.nombre } })` â†’ throw `QUIMICO_NOMBRE_DUPLICADO` 409 if conflict
    4. `const paIds = dto.principios_activos ?? []`
    5. `await this.validatePrincipioActivoIds(paIds)` â€” throws 400 with unknown IDs if any missing
    6. `const quimico = await this.create({ establecimiento_id: dto.establecimiento_id, nombre: dto.nombre, unidad_medida: dto.unidad_medida, stock_actual: 0 }, { strictTenant: true })` â€” **stock_actual hardcoded to 0**
    7. If `paIds.length > 0`: `await this.qpaRepo.insert(paIds.map(paId => ({ quimico_id: quimico.id, principio_activo_id: paId })))`
    8. `return this.getQuimicoWithPrincipios(quimico.id)`
  - **Implement `updateQuimico(id: string, dto: UpdateQuimicoDto)`**:
    1. `const current = await this.mustFindById(id, { strictTenant: true })`
    2. If `dto.nombre !== undefined && dto.nombre !== current.nombre`: QB uniqueness check excluding current id â†’ throw `QUIMICO_NOMBRE_DUPLICADO` 409 if conflict
    3. If `dto.principios_activos !== undefined` (replace semantics):
       - `await this.validatePrincipioActivoIds(dto.principios_activos)` â€” validate before touching DB
       - `await runInTx(this.dataSource, async (mgr) => {`
         - `await mgr.delete(QuimicoPrincipioActivo, { quimico_id: id })`
         - `if (dto.principios_activos!.length > 0):`
           - `await mgr.insert(QuimicoPrincipioActivo, dto.principios_activos!.map(paId => ({ quimico_id: id, principio_activo_id: paId })))`
       - `})`
    4. `const updatePayload: Partial<Quimico> = {}`
    5. Assign `nombre`, `unidad_medida`, `activo` from dto if defined
    6. `if (Object.keys(updatePayload).length > 0) await this.update(id, updatePayload, { strictTenant: true })`
    7. `return this.getQuimicoWithPrincipios(id)`
  - **Implement `deleteQuimico(id: string)`**:
    1. `await this.mustFindById(id, { strictTenant: true })`
    2. `await this.softDelete(id, { strictTenant: true })`
  - **Import** `runInTx` from `src/common/database/transaction`
  - **Acceptance**: Service compiles; `listQuimicos({})` returns both active and inactive; `createQuimico` with duplicate nombre â†’ 409; unknown PA UUIDs â†’ 400 with `unknown_ids`; `stock_actual` always 0 on create; no `any` types

- [x] T011 [P] [US5] CREATE `src/modules/quimicos/principios-activos.service.ts` â€” PrincipiosActivosService
  - **Implements**: plan.md Â§ Service Summary; research.md Decision 2
  - **âš ï¸ CRITICAL**: Plain `@Injectable()` â€” DO NOT extend `BaseCrudTenantService` (no tenant_id on entity)
  - **Constructor**: inject:
    - `@InjectRepository(PrincipioActivo) private readonly paRepo: Repository<PrincipioActivo>`
    - `@InjectRepository(QuimicoPrincipioActivo) private readonly qpaRepo: Repository<QuimicoPrincipioActivo>`
  - **Implement `listAll()`**:
    ```typescript
    async listAll(): Promise<PrincipioActivo[]> {
      return this.paRepo.find({ order: { nombre: 'ASC' } });
    }
    ```
  - **Implement `create(dto: CreatePrincipioActivoDto)`**:
    1. `const conflict = await this.paRepo.findOne({ where: { nombre: dto.nombre } })`
    2. If conflict â†’ throw `AppError({ code: ErrorCodes.PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO, message: 'Ya existe un principio activo con ese nombre', status: 409 })`
    3. `const pa = this.paRepo.create({ nombre: dto.nombre })`
    4. `return this.paRepo.save(pa)`
  - **Implement `update(id: string, dto: UpdatePrincipioActivoDto)`**:
    1. `const current = await this.paRepo.findOne({ where: { id } })` â†’ throw `PRINCIPIO_ACTIVO_NOT_FOUND` 404 if not found
    2. If `dto.nombre !== current.nombre`: conflict check excluding current id
    3. `current.nombre = dto.nombre`
    4. `return this.paRepo.save(current)`
  - **Implement `delete(id: string)`**:
    1. `const pa = await this.paRepo.findOne({ where: { id } })` â†’ throw `PRINCIPIO_ACTIVO_NOT_FOUND` 404 if not found
    2. `const refCount = await this.qpaRepo.count({ where: { principio_activo_id: id } })`
    3. If `refCount > 0` â†’ throw `AppError({ code: ErrorCodes.PRINCIPIO_ACTIVO_REFERENCIADO, message: 'No se puede eliminar: este principio activo estÃ¡ siendo usado por uno o mÃ¡s quÃ­micos', status: 409 })`
    4. `await this.paRepo.delete(id)` â€” **hard delete**
  - **Acceptance**: Service compiles; `listAll()` returns all sorted by nombre; `delete()` of referenced PA â†’ 409 `PRINCIPIO_ACTIVO_REFERENCIADO`; `delete()` of unreferenced PA â†’ hard removes record; no `any` types

- [x] T012 [P] [US1] CREATE `src/modules/quimicos/quimicos.controller.ts` â€” main quimicos controller (all 5 endpoints)
  - **Implements**: plan.md Â§ Controller Summary; spec.md US1â€“US4
  - **Class decorators**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('quimicos')`
  - **Constructor**: inject `QuimicosService`, `AuditService`, `PinoLogger`
  - **Declare `AuthRequest` type** locally (same pattern as recetas.controller.ts)
  - **Implement all 5 endpoints**:
    - `GET /` â€” no `@Roles` (all authenticated); call `svc.listQuimicos(q)` with `clampPagination`; return `page(items, p, limit, total)` â€” **no audit on read**
    - `GET /:id` â€” no `@Roles`; call `svc.getQuimicoWithPrincipios(id)`; return `ok(quimico)` â€” **no audit on read**
    - `POST /` â€” `@Roles('supervisor', 'admin_global')` + `@HttpCode(HttpStatus.CREATED)`:
      - Extract `principios_activos` from body (pass as separate arg to service): `const { principios_activos, ...rest } = dto`
      - Call `svc.createQuimico(dto)` (service receives full dto including principios_activos)
      - Write audit `AUDIT.QUIMICO_CREATED` with `extra: { quimicoId: quimico.id, nombre: quimico.nombre, establecimiento_id: quimico.establecimiento_id }`; return `ok(quimico)`
    - `PATCH /:id` â€” `@Roles('supervisor', 'admin_global')` â€” **PATCH GUARD MUST BE FIRST LOGIC**:
      ```typescript
      const ALLOWED = new Set(['nombre', 'unidad_medida', 'activo', 'principios_activos']);
      if (Object.keys((req.body as Record<string, unknown>) ?? {}).some((k) => !ALLOWED.has(k))) {
        throw new AppError({
          code: ErrorCodes.QUIMICO_FIELD_IMMUTABLE,
          message: 'Solo se pueden modificar: nombre, unidad_medida, activo, principios_activos',
          status: 400,
        });
      }
      ```
      then call `svc.updateQuimico(id, dto)`; write audit `AUDIT.QUIMICO_UPDATED` with `extra: { quimicoId: id, fields: Object.keys(dto) }`; return `ok(updated)`
    - `DELETE /:id` â€” `@Roles('admin_global')`; call `svc.deleteQuimico(id)`; write audit `AUDIT.QUIMICO_DELETED` with `extra: { quimicoId: id }`; return `ok({ deleted: true })`
  - **Audit write pattern** (follow recetas.controller.ts exactly):
    ```typescript
    const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, actorEmail: req.user?.email, action: AUDIT.QUIMICO_CREATED, entity: 'quimico', extra: { ... } });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', { request_id: req.id, method: req.method, path: req.url, status_code: 201, actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null, action: AUDIT.QUIMICO_CREATED, entity: 'quimico', tenant_id: req.tenantId ?? null, payload });
    ```
  - **Acceptance**: Controller compiles; POST as operario â†’ 403; PATCH with `{ establecimiento_id: '...' }` â†’ 400 `QUIMICO_FIELD_IMMUTABLE`; PATCH with `{ stock_actual: 5 }` â†’ 400 `QUIMICO_FIELD_IMMUTABLE`; GET /:id returns `principios_activos[]` array; all responses use `ok()`/`page()`

- [x] T013 [P] [US1] CREATE `src/modules/quimicos/admin-quimicos.controller.ts` â€” admin panel controller
  - **Implements**: plan.md Â§ Controller Summary; spec.md US4 acceptance scenario 3; research.md Decision 6
  - **Class decorators**: `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/quimicos')`
  - **Constructor**: inject `QuimicosService` only
  - **Implement** `GET /`: call `svc.listQuimicos(q)` with `clampPagination`; return `page(items, p, limit, total)`
  - **No mandatory filters** â€” admin_global can optionally pass `establecimiento_id`/`activo`; no defaults applied
  - **Acceptance**: GET `/admin/quimicos` as admin_global â†’ 200 with all non-deleted chemicals (active + inactive) in tenant; as supervisor â†’ 403; no `establecimiento_id` required

- [x] T014 [P] [US5] CREATE `src/modules/quimicos/principios-activos.controller.ts` â€” PA catalog controller
  - **Implements**: plan.md Â§ Controller Summary; spec.md US5
  - **Class decorators**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('principios-activos')`
  - **Constructor**: inject `PrincipiosActivosService`, `AuditService`, `PinoLogger`
  - **Implement all 4 endpoints**:
    - `GET /` â€” no `@Roles` (all authenticated); call `svc.listAll()`; return `ok(list)` â€” **no audit on read**
    - `POST /` â€” `@Roles('admin_global')` + `@HttpCode(HttpStatus.CREATED)`; call `svc.create(dto)`; write audit `AUDIT.PA_CREATED` with `extra: { paId: pa.id, nombre: pa.nombre }`; return `ok(pa)`
    - `PATCH /:id` â€” `@Roles('admin_global')`; call `svc.update(id, dto)`; write audit `AUDIT.PA_UPDATED` with `extra: { paId: id, nombre: dto.nombre }`; return `ok(updated)`
    - `DELETE /:id` â€” `@Roles('admin_global')`; call `svc.delete(id)`; write audit `AUDIT.PA_DELETED` with `extra: { paId: id }`; return `ok({ deleted: true })`
  - **Acceptance**: Controller compiles; GET returns full catalog (no pagination); POST as admin_global â†’ 201; POST as supervisor â†’ 403; DELETE of referenced PA â†’ 409; DELETE of unreferenced PA â†’ 200; all responses use `ok()`

- [x] T015 [US1] CREATE `src/modules/quimicos/quimicos.module.ts` â€” module wiring
  - **Implements**: plan.md Â§ Files to Create #14
  - **imports**: `TypeOrmModule.forFeature([Quimico, PrincipioActivo, QuimicoPrincipioActivo])`, `TenancyModule`, `AuditModule`, `EstablecimientosModule`
  - **providers**: `[QuimicosService, PrincipiosActivosService]`
  - **controllers**: `[QuimicosController, PrincipiosActivosController, AdminQuimicosController]`
  - **exports**: `[QuimicosService, PrincipiosActivosService]`
  - **âš ï¸ ALL THREE entities must be in `TypeOrmModule.forFeature([...])`** â€” both services inject repositories for `QuimicoPrincipioActivo` and `PrincipioActivo`
  - **âš ï¸ `EstablecimientosModule` MUST be imported** â€” provides `EstablecimientosService` injected into `QuimicosService`
  - **Acceptance**: Module compiles; no circular dependency errors; all 3 entities, 2 providers, 3 controllers registered

- [x] T016 [US1] MODIFY `src/app.module.ts` â€” register QuimicosModule
  - **Implements**: plan.md Â§ app.module.ts Change
  - **Add** `import { QuimicosModule } from './modules/quimicos/quimicos.module'` at top
  - **Add** `QuimicosModule` to `imports` array after `RecetasModule`
  - **Acceptance**: `npx tsc --noEmit` passes; `npm run start:dev` starts without error; all quimicos, principios-activos, and admin/quimicos endpoints registered

**âœ… MVP Checkpoint (after T016)**: Full US1 + US2 functionality working:
- POST `/quimicos` as supervisor â†’ 201 with `stock_actual: 0` and `principios_activos[]` nested
- Duplicate nombre in same establishment â†’ 409 `QUIMICO_NOMBRE_DUPLICADO`
- Unknown principio_activo UUIDs in POST body â†’ 400 with `unknown_ids` list
- Cross-tenant establishment â†’ 404
- GET `/quimicos` (no filters) â†’ paginated, both active and inactive
- GET `/quimicos?activo=true` â†’ active only; `?activo=false` â†’ inactive only
- GET `/quimicos?establecimiento_id=X` â†’ filtered by establishment
- GET `/quimicos/:id` â†’ 200 with `principios_activos[]` array nested
- GET `/admin/quimicos` as admin_global â†’ 200; as supervisor â†’ 403
- GET `/principios-activos` (all authenticated) â†’ full catalog, ordered by nombre
- Audit event `quimico_created` written
- `npx tsc --noEmit` passes

---

## Phase 3: User Story 3 â€” Update Chemical Details (Priority: P2)

**Goal**: supervisor/admin_global can update nombre, unidad_medida, activo, and principios_activos; replace-or-ignore semantics for principios_activos; immutable fields strictly rejected; duplicate-nombre check excludes current record.

**Independent Test**: PATCH `/quimicos/:id` as supervisor with `{ nombre: 'new' }` â†’ 200. PATCH with `{ establecimiento_id: '...' }` â†’ 400 `QUIMICO_FIELD_IMMUTABLE`. PATCH with `{ stock_actual: 5 }` â†’ 400 `QUIMICO_FIELD_IMMUTABLE`. PATCH with `{ principios_activos: [] }` â†’ 200, all PA links removed. PATCH without `principios_activos` â†’ 200, existing links unchanged. PATCH as operario â†’ 403.

**Prerequisite**: US1+US2 complete (T010â€“T016) â€” PATCH endpoint implemented in T012.

### Implementation for User Story 3

- [x] T017 [US3] VERIFY `src/modules/quimicos/quimicos.controller.ts` + `src/modules/quimicos/quimicos.service.ts` â€” confirm PATCH behavior
  - **Implements**: spec.md US3 acceptance scenarios; plan.md Â§ PATCH guard; research.md Decisions 3, 4
  - **Verify controller** `PATCH /:id` handler:
    - `@Roles('supervisor', 'admin_global')` â€” operario must get 403
    - PATCH guard is THE FIRST LOGIC in the handler:
      - `ALLOWED = new Set(['nombre', 'unidad_medida', 'activo', 'principios_activos'])`
      - `establecimiento_id` in body â†’ 400 `QUIMICO_FIELD_IMMUTABLE`
      - `stock_actual` in body â†’ 400 `QUIMICO_FIELD_IMMUTABLE`
    - Audit event `AUDIT.QUIMICO_UPDATED` written after successful update
  - **Verify service** `updateQuimico`:
    - Nombre uniqueness check excludes current record (`id != :id` in QB)
    - `principios_activos: []` â†’ replaces all links (DELETE executed inside `runInTx`, no INSERT)
    - `principios_activos` omitted â†’ no DELETE, links untouched
    - `runInTx` wraps DELETE + INSERT atomically
  - **Acceptance**: PATCH `{ nombre: 'new' }` â†’ 200; PATCH `{ establecimiento_id: '...' }` â†’ 400; PATCH `{ stock_actual: 5 }` â†’ 400; PATCH `{ principios_activos: [] }` â†’ 200 with empty list; PATCH `{ principios_activos: [<invalid-uuid>] }` â†’ 400 `BAD_REQUEST` with `unknown_ids`

**Checkpoint**: US3 verified. supervisor/admin_global can update chemicals; immutable fields strictly rejected; replace-or-ignore semantics confirmed.

---

## Phase 4: User Story 4 â€” Delete a Chemical (Priority: P3)

**Goal**: admin_global can soft-delete a chemical; deleted record excluded from all listings; nombre available for reuse after soft-delete; supervisor cannot delete.

**Independent Test**: DELETE `/quimicos/:id` as admin_global â†’ 200 `{ deleted: true }`. Verify `deleted_at` set. POST same nombre+establishment after delete â†’ 201. DELETE as supervisor â†’ 403. GET `/admin/quimicos` â†’ deleted chemical not visible.

**Prerequisite**: US1+US2 complete â€” DELETE endpoint implemented in T012.

### Implementation for User Story 4

- [x] T018 [US4] VERIFY `src/modules/quimicos/quimicos.service.ts` + `src/modules/quimicos/quimicos.controller.ts` â€” confirm delete behavior
  - **Implements**: spec.md US4 acceptance scenarios; plan.md Â§ deleteQuimico
  - **Verify service** `deleteQuimico`:
    1. `mustFindById(id, { strictTenant: true })` â€” throws 404 if not found or wrong tenant
    2. `softDelete(id, { strictTenant: true })` â€” sets `deleted_at`; inherited from `BaseCrudTenantService`
  - **Verify controller** `DELETE /:id` has `@Roles('admin_global')` â€” supervisor must get 403
  - **Verify** audit event `quimico_deleted` written after successful soft-delete
  - **Verify** uniqueness partial index behavior: soft-deleted nombre does NOT block new creation (TypeORM excludes soft-deleted by default in `findOne`; partial index `WHERE deleted_at IS NULL` handles DB level)
  - **Verify** GET `/admin/quimicos` after soft-delete: deleted record NOT visible (admin endpoint uses same `listQuimicos()` which applies standard TypeORM soft-delete exclusion)
  - **Acceptance**: DELETE as admin_global â†’ 200; `deleted_at` set; POST same nombre after delete â†’ 201; DELETE as supervisor â†’ 403; admin list does not include deleted

**Checkpoint**: US4 verified. admin_global can soft-delete chemicals; historical records preserved; nombre reuse confirmed; admin list excludes soft-deleted.

---

## Phase 5: User Story 5 â€” Manage Active Principles Catalog (Priority: P2)

**Goal**: admin_global can create/update/delete active principles; globally unique nombres enforced; deletion blocked when referenced; all authenticated users can list the full catalog.

**Independent Test**: GET `/principios-activos` (authenticated) â†’ 200 full list ordered by nombre. POST `/principios-activos` as admin_global â†’ 201. Duplicate nombre â†’ 409 `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`. DELETE unreferenced PA â†’ 200, hard deleted. DELETE referenced PA â†’ 409 `PRINCIPIO_ACTIVO_REFERENCIADO`. POST/PATCH/DELETE as supervisor â†’ 403.

**Prerequisite**: US1+US2 complete (T011, T014â€“T016 implement all PA endpoints).

### Implementation for User Story 5

- [x] T019 [US5] VERIFY `src/modules/quimicos/principios-activos.service.ts` + `src/modules/quimicos/principios-activos.controller.ts` â€” confirm full PA behavior
  - **Implements**: spec.md US5 acceptance scenarios; plan.md Â§ PrincipiosActivosService; research.md Decision 2
  - **Verify service** `delete(id)`:
    - `qpaRepo.count({ where: { principio_activo_id: id } })` â€” checks `quimico_principio_activo` table for references
    - If count > 0 â†’ throws `PRINCIPIO_ACTIVO_REFERENCIADO` 409
    - `paRepo.delete(id)` â€” hard delete (no `softDelete`)
  - **Verify** `listAll()` returns all PAs without tenant filter (global catalog)
  - **Verify** uniqueness check on update excludes current id (`WHERE id != :id AND nombre = :nombre`)
  - **Verify** all 4 endpoints have correct `@Roles`: GET has none (all authenticated), POST/PATCH/DELETE require `admin_global`
  - **Verify** audit events `PA_CREATED`, `PA_UPDATED`, `PA_DELETED` written
  - **Acceptance**: GET â†’ full catalog without pagination; DELETE of referenced PA â†’ 409; DELETE of unreferenced PA â†’ 200, record removed from DB; POST as supervisor â†’ 403; duplicate nombre â†’ 409 `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`

**Checkpoint**: US5 verified. Active principles catalog fully managed by admin_global; global catalog accessible to all authenticated users; referential integrity enforced.

---

## Phase 6: Migration & Final Verification

**Purpose**: Confirm migration integrity and run full compile + smoke tests.

- [x] T020 VERIFY `migrations/1770600000000-QuimicosInit.ts` â€” confirm migration created in plan phase
  - **Action**: VERIFY ONLY â€” file already exists, do NOT recreate or modify
  - **Check**:
    - File exports class `QuimicosInit1770600000000 implements MigrationInterface`
    - `up()` creates `principios_activos` table, then `quimicos` table (with `stock_actual decimal(10,3)`), then `quimico_principio_activo` join table with composite PK and FK constraints (CASCADE on both)
    - 5 indexes: `IDX_quimicos_tenant_id`, `IDX_quimicos_establecimiento_id`, `IDX_quimicos_activo`, `UQ_quimicos_tenant_est_nombre` (partial WHERE deleted_at IS NULL), `IDX_qpa_principio_activo_id`
    - `down()` drops all 5 indexes, then all 3 tables in reverse order (join table first)
    - Timestamp `1770600000000 > 1770500000000` (M04 recetas)
  - **Acceptance**: File exists; `npx tsc --noEmit` includes it without errors

- [ ] T021 [P] Run `npx tsc --noEmit` â€” full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; all imports resolve; no `any` type issues

- [ ] T022 Run migration against local database
  - **Command**: `npm run migration:run` (check `package.json` for exact script name)
  - **Prerequisite**: T020 verified; local DB running with M01â€“M04 migrations applied
  - **Acceptance**: Migration runs without error; all 3 tables exist; all 5 indexes present; running again does NOT fail

- [ ] T023 [P] Run eslint on quimicos module
  - **Command**: `npx eslint src/modules/quimicos/ --ext .ts` (after T016 complete)
  - **Acceptance**: Zero errors

- [ ] T024 Manual smoke tests â€” all 22 paths
  - **Prerequisite**: T022 complete; server running (`npm run start:dev`)
  - **US1 tests (browse)**:
    1. `GET /quimicos` (no filters, authenticated) â†’ **200** paginated list (both active and inactive)
    2. `GET /quimicos?activo=true` â†’ **200** active only
    3. `GET /quimicos?activo=false` â†’ **200** inactive only
    4. `GET /quimicos?establecimiento_id=X` â†’ **200** filtered
    5. `GET /quimicos/:id` â†’ **200** with `principios_activos[]` array nested
    6. `GET /quimicos/:id` (invalid id) â†’ **404**
    7. `GET /quimicos` (unauthenticated) â†’ **401**
    8. `GET /admin/quimicos` as admin_global â†’ **200** non-deleted chemicals (active + inactive)
    9. `GET /admin/quimicos` as supervisor â†’ **403**
  - **US2 tests (create)**:
    10. `POST /quimicos` as supervisor with valid establishment, nombre, unidad_medida â†’ **201** `stock_actual: 0`
    11. `POST /quimicos` with `principios_activos: [<valid-uuid>]` â†’ **201** with PA nested in response
    12. `POST /quimicos` same nombre + establishment â†’ **409** `QUIMICO_NOMBRE_DUPLICADO`
    13. `POST /quimicos` with unknown PA UUID â†’ **400** with `unknown_ids` list
    14. `POST /quimicos` with cross-tenant establishment â†’ **404**
    15. `POST /quimicos` as operario â†’ **403**
  - **US3 tests (update)**:
    16. `PATCH /quimicos/:id` with `{ nombre: 'new' }` as supervisor â†’ **200**
    17. `PATCH /quimicos/:id` with `{ establecimiento_id: '...' }` â†’ **400** `QUIMICO_FIELD_IMMUTABLE`
    18. `PATCH /quimicos/:id` with `{ stock_actual: 5 }` â†’ **400** `QUIMICO_FIELD_IMMUTABLE`
    19. `PATCH /quimicos/:id` with `{ principios_activos: [] }` â†’ **200** empty `principios_activos[]`
  - **US4 tests (delete)**:
    20. `DELETE /quimicos/:id` as admin_global â†’ **200** `{ deleted: true }` + audit `quimico_deleted`
    21. `DELETE /quimicos/:id` as supervisor â†’ **403**
  - **US5 tests (principios activos)**:
    22. `GET /principios-activos` (authenticated) â†’ **200** full catalog ordered by nombre
    23. `POST /principios-activos` as admin_global â†’ **201** + audit `principio_activo_created`
    24. `POST /principios-activos` duplicate nombre â†’ **409** `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`
    25. `POST /principios-activos` as supervisor â†’ **403**
    26. `PATCH /principios-activos/:id` as admin_global â†’ **200** + audit `principio_activo_updated`
    27. `DELETE /principios-activos/:id` (referenced) â†’ **409** `PRINCIPIO_ACTIVO_REFERENCIADO`
    28. `DELETE /principios-activos/:id` (unreferenced) â†’ **200** + hard deleted from DB + audit `principio_activo_deleted`
  - **Acceptance**: All 28 paths return expected status codes; `principios_activos[]` nested in quimico detail responses; stock_actual always 0 on create; all audit events present; `npx tsc --noEmit` passes

**âœ… Final Checkpoint (M05 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 24 tasks checked
- All 28 smoke tests passing
- No default activo filter confirmed
- PATCH guard blocks `establecimiento_id` and `stock_actual`
- replace-or-ignore semantics confirmed for principios_activos
- PrincipioActivo hard delete with reference check confirmed
- `EstablecimientosModule` imported in `QuimicosModule`
- All 6 audit event types confirmed in audit log

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational T001â€“T009)
  â””â”€â”€â–º Phase 2 (US1+US2 MVP T010â€“T016)
         â””â”€â”€â–º Phase 3 (US3 verify T017)
         â””â”€â”€â–º Phase 4 (US4 verify T018)
         â””â”€â”€â–º Phase 5 (US5 verify T019)
                â””â”€â”€â–º Phase 6 (Migration & Verify T020â€“T024)
```

- **Foundational (T001â€“T009)**: No dependencies â€” T001 first, T002â€“T009 in parallel
- **US1+US2 (T010â€“T016)**: All T001â€“T009 must be done
  - T010 first (QuimicosService); T011â€“T014 in parallel after T010; T015 after T011â€“T014; T016 after T015
- **US3 (T017), US4 (T018), US5 (T019)**: All T010â€“T016 must be done (verify only)
- **Verify (T020â€“T024)**: All code phases complete

### Within Each Phase

- Foundation: T001 first (error codes), then T002â€“T009 in parallel (entities + DTOs)
- US1+US2: T010 â†’ T011 [P] + T012 [P] + T013 [P] + T014 [P] â†’ T015 â†’ T016
- US3/US4/US5: T017, T018, T019 can run in parallel (all verify, different concerns)
- Verify: T020 [P] + T021 [P] â†’ T022 â†’ T023 [P] + T024

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create Quimico entity
T003: Create PrincipioActivo entity
T004: Create QuimicoPrincipioActivo entity
T005: Create CreateQuimicoDto
T006: Create UpdateQuimicoDto
T007: Create QueryQuimicosDto
T008: Create CreatePrincipioActivoDto
T009: Create UpdatePrincipioActivoDto

# US1+US2 parallel batch (after T010):
T011: Create PrincipiosActivosService
T012: Create QuimicosController
T013: Create AdminQuimicosController
T014: Create PrincipiosActivosController

# Post-MVP verify batch (all after T016):
T017: Verify PATCH (US3)
T018: Verify DELETE (US4)
T019: Verify PA management (US5)

# Final verify parallel batch:
T020: Verify migration file
T021: Run tsc --noEmit
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Foundational (T001â€“T009)
2. Complete Phase 2: US1+US2 (T010â€“T016)
3. **STOP and VALIDATE**: POST/GET quimicos work; principios_activos nested in GET /:id; stock_actual = 0; tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation â†’ US1+US2 â†’ **demo supervisor creates chemicals, browses catalog** (MVP)
2. Verify US3 (T017) â†’ **confirm PATCH guard; replace-or-ignore semantics**
3. Verify US4 (T018) â†’ **confirm soft-delete; nombre reuse after deletion**
4. Verify US5 (T019) â†’ **confirm PA catalog management; referential integrity**
5. Migration + verification (T020â€“T024) â†’ **production ready**

---

## Notes

- `[P]` tasks touch different files â€” safe to work in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- US3 (T017), US4 (T018), US5 (T019) are **verify** tasks â€” code already written in T010â€“T014; no new files
- `QuimicosService` DOES extend `BaseCrudTenantService<Quimico>` â€” do NOT omit `extends`
- `PrincipiosActivosService` is plain `@Injectable()` â€” do NOT extend `BaseCrudTenantService` (no tenant_id)
- `QuimicoPrincipioActivo` is an explicit entity registered in `TypeOrmModule.forFeature([...])` â€” both services inject its repository
- The PATCH guard checks `req.body` (raw Express body) â€” must be THE FIRST logic in the PATCH handler
- `stock_actual` is hardcoded to `0` in `createQuimico` â€” never read from DTO
- `principios_activos` replace semantics: undefined = leave links alone; `[]` = remove all links; `[ids...]` = replace with new list
- Migration (T020) already exists â€” **do NOT recreate it**
- All 3 entities must be in `TypeOrmModule.forFeature([Quimico, PrincipioActivo, QuimicoPrincipioActivo])` in the module
- `PrincipioActivo` hard delete uses `paRepo.delete(id)` (not `softDelete`)
- The `DataSource` must be injected in `QuimicosService` for `runInTx` usage
