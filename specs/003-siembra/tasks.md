# Tasks: M03 — Siembra (Seeding Events)

**Input**: Design documents from `/specs/003-siembra/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each user story phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US4)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001–T007 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add five siembra domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// siembra` comment:
    ```typescript
    // siembra
    SIEMBRA_NOT_FOUND: 'SIEMBRA_NOT_FOUND',
    SIEMBRA_HAS_TRASPLANTADAS: 'SIEMBRA_HAS_TRASPLANTADAS',
    SIEMBRA_FIELD_IMMUTABLE: 'SIEMBRA_FIELD_IMMUTABLE',
    BANDEJA_NOT_FOUND: 'BANDEJA_NOT_FOUND',
    LOTE_TIPO_INCORRECTO: 'LOTE_TIPO_INCORRECTO',
    ```
  - **Acceptance**: `grep "SIEMBRA_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; file still compiles; all 5 codes present

- [x] T002 [P] CREATE `src/modules/siembra/entities/siembra.entity.ts` — Siembra entity
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Siembra
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Decorator**: `@Entity('siembras')`
  - **Columns**:
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `fecha`: `@Column({ type: 'date' })` — stored as `'YYYY-MM-DD'` string; TypeScript type `string`
    - `observaciones`: `@Column({ type: 'text', nullable: true })` — `string | null`
    - `usuario_id`: `@Column({ type: 'uuid' })` — NOT NULL; always from JWT, never from body
  - **⚠️ NO `@OneToMany`** relation to Bandeja — avoids TypeORM eager loading globally; bandejas loaded only via explicit QueryBuilder in service
  - **Acceptance**: File exports `Siembra`; `npx tsc --noEmit` passes; `fecha` is typed as `string` not `Date`

- [x] T003 [P] CREATE `src/modules/siembra/entities/bandeja.entity.ts` — Bandeja entity + BandejaEstado enum
  - **Implements**: plan.md Phase 1, Task 1.3; data-model.md § Bandeja
  - **Export** `BandejaEstado` enum: `EN_NURSERY = 'en_nursery'`, `TRASPLANTADA = 'trasplantada'`
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Decorator**: `@Entity('bandejas')`
  - **Columns**:
    - `siembra_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `lote_semilla_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `lote_sustrato_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `estado`: `@Column({ type: 'enum', enum: BandejaEstado, default: BandejaEstado.EN_NURSERY })`
    - `fecha_entrada_nursery`: `@Column({ type: 'timestamptz' })` — `Date`, NOT NULL
    - `fecha_trasplante`: `@Column({ type: 'timestamptz', nullable: true })` — `Date | null`
    - `mesa_id`: `@Column({ type: 'uuid', nullable: true })` — `string | null`; set by M11
    - `observaciones`: `@Column({ type: 'text', nullable: true })` — `string | null`
    - `codigo`: `@Column({ type: 'varchar', length: 100, nullable: true })` — `string | null`; reserved for future QR
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL; denormalized from siembra at creation
  - **Acceptance**: File exports `Bandeja` and `BandejaEstado`; `npx tsc --noEmit` passes

- [x] T004 [P] CREATE `src/modules/siembra/dto/create-siembra.dto.ts` — create DTO with nested BandejaGroupDto
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Define `BandejaGroupDto` class FIRST** in the same file (required before `CreateSiembraDto` for `@Type()` decorator):
    ```typescript
    export class BandejaGroupDto {
      @IsUUID() lote_semilla_id!: string;
      @IsUUID() lote_sustrato_id!: string;
      @IsInt() @Min(1) cantidad!: number;
    }
    ```
  - **Define `CreateSiembraDto` class**:
    - `establecimiento_id`: `@IsUUID()` — required
    - `fecha?: string`: `@IsOptional() @IsDateString()` — defaults to today in service if omitted
    - `observaciones?: string`: `@IsOptional() @IsString()`
    - `bandejas: BandejaGroupDto[]`: `@IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BandejaGroupDto)` — min 1 element; `cantidad` must be `>= 1`
  - **Imports needed**: `Type` from `class-transformer`; `IsUUID, IsOptional, IsString, IsDateString, IsArray, ArrayMinSize, ValidateNested, IsInt, Min` from `class-validator`
  - **Acceptance**: DTO exported; `bandejas: []` → validation error; `cantidad: 0` → validation error; `establecimiento_id` missing → validation error

- [x] T005 [P] CREATE `src/modules/siembra/dto/update-siembra.dto.ts` — update DTO (observaciones only)
  - **Implements**: plan.md Phase 2, Task 2.2
  - **Contains ONLY** `observaciones?: string` (`@IsOptional() @IsString()`)
  - **⚠️ CRITICAL**: Do NOT add any other fields — immutability for all other fields is enforced by the controller checking `req.body` BEFORE this DTO is bound (see T010 PATCH guard)
  - **Acceptance**: DTO exported; only `observaciones` field present; no `fecha`, `establecimiento_id`, `usuario_id`, or `bandejas` fields

- [x] T006 [P] CREATE `src/modules/siembra/dto/query-siembras.dto.ts` — list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Add**:
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `fecha_desde?: string` — `@IsOptional() @IsDateString()`
    - `fecha_hasta?: string` — `@IsOptional() @IsDateString()`
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Acceptance**: DTO exported; all fields optional; extends `PageQueryDto` (inherits `page` and `limit`)

- [x] T007 [P] CREATE `src/modules/siembra/dto/query-bandejas.dto.ts` — bandeja list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.4
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Add**:
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `siembra_id?: string` — `@IsOptional() @IsUUID()`
    - `lote_semilla_id?: string` — `@IsOptional() @IsUUID()`
    - `estado?: BandejaEstado` — `@IsOptional() @IsEnum(BandejaEstado)` — **no default here; default applied in service**
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Import** `BandejaEstado` from `../entities/bandeja.entity`
  - **Acceptance**: DTO exported; `estado` is optional in DTO (default `en_nursery` applied at service level, not DTO level)

**Checkpoint**: T001–T007 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 — Record a seeding event as operario (Priority: P1) 🎯 MVP

**Goal**: operario, supervisor, and admin_global can create a seeding event with one or more bandeja groups; all bandejas created atomically in one transaction; lot type pre-validated before transaction opens; GET /siembras/:id returns seeding with nested bandejas including lot refs.

**Independent Test**: POST `/siembras` as operario with two lot groups (3+2 trays) → 201, response includes siembra with 5 bandejas nested. POST with `lote_semilla_id` pointing to a sustrato lot → 422 `LOTE_TIPO_INCORRECTO`. POST with `bandejas: []` → 400 validation error. GET `/siembras/:id` → siembra with `bandejas[]` each having `lote_semilla` and `lote_sustrato`. Audit event `siembra_created` written.

### Implementation for User Story 1

- [x] T008 [P] CREATE `src/modules/siembra/siembra.service.ts` — complete SiembraService (plain Injectable, no base class)
  - **Implements**: plan.md Phase 3, Task 3.1; research.md Decisions 1, 3, 4, 5, 7, 8, 9
  - **⚠️ CRITICAL**: Do NOT extend `BaseCrudTenantService` — this service uses explicit `QueryRunner` transactions
  - **Decorator**: `@Injectable()` only
  - **Export** `AUDIT` const: `{ CREATED: 'siembra_created', UPDATED: 'siembra_updated', DELETED: 'siembra_deleted' }`
  - **Constructor injections**:
    ```typescript
    constructor(
      private readonly dataSource: DataSource,
      @InjectRepository(Siembra) private readonly siembraRepo: Repository<Siembra>,
      @InjectRepository(Bandeja) private readonly bandejaRepo: Repository<Bandeja>,
      private readonly lotesService: LotesService,
      private readonly estService: EstablecimientosService,
      private readonly tenancy: TenancyService,
    ) {}
    ```
  - **Declare interface** at top of file:
    ```typescript
    interface LoteRef { id: string; numero_lote: string; tipo: string }
    type BandejaWithRefs = Bandeja & { lote_semilla?: LoteRef; lote_sustrato?: LoteRef };
    interface SiembraWithBandejas extends Siembra { bandejas: BandejaWithRefs[] }
    ```
  - **Implement `listSiembras(q: QuerySiembrasDto)`** — manual QB with tenant scope:
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. `clampPagination(q.page, q.limit, 200)` from `src/common/query/query-utils`
    3. Whitelist-guarded sort: `const SORT_ALLOWED = ['fecha', 'created_at']; sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? q.sortBy! : 'created_at'`
    4. `createQueryBuilder('s').where('s.tenant_id = :tenantId', { tenantId })`
    5. If `q.establecimiento_id`: `.andWhere('s.establecimiento_id = :estId', { estId: q.establecimiento_id })`
    6. If `q.fecha_desde`: `.andWhere('s.fecha >= :desde', { desde: q.fecha_desde })`
    7. If `q.fecha_hasta`: `.andWhere('s.fecha <= :hasta', { hasta: q.fecha_hasta })`
    8. `.orderBy(...).skip(skip).take(limit).getManyAndCount()` → return `{ items, total }`
  - **Implement `getSiembraWithBandejas(id: string)`** — loads siembra + nested bandejas with lot refs in one QB (no N+1):
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. `findOne({ where: { id, tenant_id: tenantId } })` — throw `SIEMBRA_NOT_FOUND 404` if null
    3. QB on bandejaRepo with `leftJoinAndMapOne('b.lote_semilla', 'lotes', 'ls', 'ls.id = b.lote_semilla_id')` and `leftJoinAndMapOne('b.lote_sustrato', 'lotes', 'lsu', 'lsu.id = b.lote_sustrato_id')`
    4. `.where('b.siembra_id = :id', { id }).andWhere('b.tenant_id = :tenantId', { tenantId })`
    5. `.select(['b.id', 'b.siembra_id', 'b.lote_semilla_id', 'b.lote_sustrato_id', 'b.estado', 'b.fecha_entrada_nursery', 'b.fecha_trasplante', 'b.mesa_id', 'b.observaciones', 'b.codigo', 'b.establecimiento_id', 'b.created_at', 'b.updated_at', 'ls.id', 'ls.numero_lote', 'ls.tipo', 'lsu.id', 'lsu.numero_lote', 'lsu.tipo'])`
    6. Return `{ ...siembra, bandejas: rows }`
  - **Implement `createSiembra(dto: CreateSiembraDto, userId: string)`** — ⚠️ CRITICAL TRANSACTION PATTERN:
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. Validate establishment: `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` — throws 404 if not in tenant
    3. **Pre-validate ALL lots BEFORE transaction opens** (per spec clarification Q3, research Decision 4):
       ```typescript
       for (const group of dto.bandejas) {
         const semilla = await this.lotesService.mustFindById(group.lote_semilla_id, { strictTenant: true });
         if (semilla.tipo !== LoteTipo.SEMILLA) throw new AppError({ code: ErrorCodes.LOTE_TIPO_INCORRECTO, status: 422, message: `lote_semilla_id '${group.lote_semilla_id}' debe ser tipo semilla` });
         const sustrato = await this.lotesService.mustFindById(group.lote_sustrato_id, { strictTenant: true });
         if (sustrato.tipo !== LoteTipo.SUSTRATO) throw new AppError({ code: ErrorCodes.LOTE_TIPO_INCORRECTO, status: 422, message: `lote_sustrato_id '${group.lote_sustrato_id}' debe ser tipo sustrato` });
       }
       ```
    4. **Explicit QueryRunner transaction** (research Decision 3):
       ```typescript
       const qr = this.dataSource.createQueryRunner();
       await qr.connect();
       await qr.startTransaction();
       try {
         const siembra = qr.manager.create(Siembra, {
           tenant_id: tenantId,
           establecimiento_id: dto.establecimiento_id,
           fecha: dto.fecha ?? new Date().toISOString().split('T')[0],
           observaciones: dto.observaciones ?? null,
           usuario_id: userId,
         });
         const savedSiembra = await qr.manager.save(Siembra, siembra);
         const now = new Date();
         for (const group of dto.bandejas) {
           for (let i = 0; i < group.cantidad; i++) {
             const bandeja = qr.manager.create(Bandeja, {
               tenant_id: tenantId,
               siembra_id: savedSiembra.id,
               lote_semilla_id: group.lote_semilla_id,
               lote_sustrato_id: group.lote_sustrato_id,
               estado: BandejaEstado.EN_NURSERY,
               fecha_entrada_nursery: now,
               establecimiento_id: dto.establecimiento_id,
             });
             await qr.manager.save(Bandeja, bandeja);
           }
         }
         await qr.commitTransaction();
         return this.getSiembraWithBandejas(savedSiembra.id);
       } catch (err) {
         await qr.rollbackTransaction();
         throw err;
       } finally {
         await qr.release();
       }
       ```
  - **Implement `updateSiembra(id: string, dto: UpdateSiembraDto)`**:
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. `findOne({ where: { id, tenant_id: tenantId } })` — throw `SIEMBRA_NOT_FOUND 404` if null
    3. `siembra.observaciones = dto.observaciones ?? null`
    4. `return this.siembraRepo.save(siembra)` — return plain `Siembra`
  - **Implement `deleteSiembra(id: string)`**:
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. `findOne({ where: { id, tenant_id: tenantId } })` — throw `SIEMBRA_NOT_FOUND 404` if null
    3. Check trasplantada count: `this.bandejaRepo.count({ where: { siembra_id: id, estado: BandejaEstado.TRASPLANTADA } })` — throw `SIEMBRA_HAS_TRASPLANTADAS 409` if `> 0`
    4. **Explicit QueryRunner transaction with bulk cascade delete** (research Decision 9):
       ```typescript
       const qr = this.dataSource.createQueryRunner();
       await qr.connect();
       await qr.startTransaction();
       try {
         await qr.manager.query(
           `UPDATE bandejas SET deleted_at = now() WHERE siembra_id = $1 AND deleted_at IS NULL`,
           [id],
         );
         await qr.manager.softDelete(Siembra, id);
         await qr.commitTransaction();
       } catch (err) {
         await qr.rollbackTransaction();
         throw err;
       } finally {
         await qr.release();
       }
       ```
    — bulk UPDATE, NOT individual per-tray softDelete (single query per spec clarification Q6)
  - **Imports needed**: `DataSource, Repository` from `typeorm`; `InjectRepository` from `@nestjs/typeorm`; `Injectable` from `@nestjs/common`; `Siembra` from `./entities/siembra.entity`; `Bandeja, BandejaEstado` from `./entities/bandeja.entity`; `LotesService` from `../lotes/lotes.service`; `LoteTipo` from `../lotes/entities/lote.entity`; `EstablecimientosService` from `../establecimientos/establecimientos.service`; `TenancyService` from `../tenancy/tenancy.service`; `AppError` from `src/common/errors/app-error`; `ErrorCodes` from `src/common/errors/error-codes`; `clampPagination` from `src/common/query/query-utils`; all DTOs
  - **Acceptance**: Service compiles; `createSiembra` with wrong lote tipo → throws 422 before opening QB; `deleteSiembra` with `trasplantada` bandeja → 409; cascade delete uses single bulk UPDATE; no `any` types

- [x] T009 [P] CREATE `src/modules/siembra/bandeja.service.ts` — BandejaService extends BaseCrudTenantService
  - **Implements**: plan.md Phase 3, Task 3.2; research.md Decision 2
  - **⚠️ This service DOES extend `BaseCrudTenantService<Bandeja>`** (unlike SiembraService)
  - **Class**: `BandejaService extends BaseCrudTenantService<Bandeja>`
  - **Constructor**: `super(bandejaRepo)` — inject only `@InjectRepository(Bandeja) bandejaRepo`
  - **Implement `listBandejas(q: QueryBandejasDto)`** — default `estado=en_nursery` when not provided:
    ```typescript
    async listBandejas(q: QueryBandejasDto): Promise<{ items: Bandeja[]; total: number }> {
      const estadoFilter = q.estado ?? BandejaEstado.EN_NURSERY; // ← default applied here
      const filters: Record<string, unknown> = { estado: estadoFilter };
      if (q.establecimiento_id) filters['establecimiento_id'] = q.establecimiento_id;
      if (q.siembra_id) filters['siembra_id'] = q.siembra_id;
      if (q.lote_semilla_id) filters['lote_semilla_id'] = q.lote_semilla_id;
      return this.list(
        { ...q, filters },
        {
          filterAllowed: ['estado', 'establecimiento_id', 'siembra_id', 'lote_semilla_id'],
          sortAllowed: ['fecha_entrada_nursery', 'created_at'],
          sortFallback: { by: 'created_at', order: 'DESC' },
          strictTenant: true,
        },
      );
    }
    ```
  - **Implement `getBandeja(id: string)`**:
    1. `await this.findById(id, { strictTenant: true })` — returns null if not found
    2. If null → throw `AppError({ code: ErrorCodes.BANDEJA_NOT_FOUND, status: 404, message: 'Bandeja no encontrada' })`
    3. Return bandeja
  - **Acceptance**: Service compiles; `listBandejas({})` with no `estado` filter defaults to `en_nursery`; `getBandeja('non-existent-id')` throws `BANDEJA_NOT_FOUND`; extends `BaseCrudTenantService<Bandeja>` correctly

- [x] T010 [US1] CREATE `src/modules/siembra/siembra.controller.ts` — all siembra endpoints
  - **Implements**: plan.md Phase 4, Task 4.1
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('siembras')`
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
  - **Constructor**: inject `SiembraService`, `AuditService`, `PinoLogger`
  - **Implement all 5 endpoints**:
    - `GET /` — no `@Roles` (all authenticated); call `svc.listSiembras(q)` with `clampPagination`; return `page(items, p, limit, total)`
    - `POST /` — `@Roles('operario', 'supervisor', 'admin_global')` `@HttpCode(HttpStatus.CREATED)`; call `svc.createSiembra(dto, req.user.sub)`; write audit `AUDIT.CREATED` with `extra: { siembraId: result.id, totalBandejas: result.bandejas.length }`; return `ok(result)`
    - `GET /:id` — no `@Roles`; call `svc.getSiembraWithBandejas(id)`; return `ok(siembra)`
    - `PATCH /:id` — `@Roles('supervisor', 'admin_global')` — **IMMUTABLE FIELDS GUARD MUST BE FIRST LINE IN HANDLER** (before DTO is used):
      ```typescript
      const ALLOWED = new Set(['observaciones']);
      const bodyKeys = Object.keys((req.body as Record<string, unknown>) ?? {});
      if (bodyKeys.some((k) => !ALLOWED.has(k))) {
        throw new AppError({
          code: ErrorCodes.SIEMBRA_FIELD_IMMUTABLE,
          message: 'Solo se puede modificar el campo observaciones',
          status: 400,
        });
      }
      ```
      then call `svc.updateSiembra(id, dto)`; write audit `AUDIT.UPDATED` with `extra: { siembraId: id }`; return `ok(updated)`
    - `DELETE /:id` — `@Roles('admin_global')`; call `svc.deleteSiembra(id)`; write audit `AUDIT.DELETED` with `extra: { siembraId: id }`; return `ok({ deleted: true })`
  - **Audit write pattern** (follow exactly `lotes.controller.ts`; include `tenant_id: req.tenantId ?? null` and `status_code` matching HTTP status):
    ```typescript
    const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, actorEmail: req.user?.email, action: AUDIT.CREATED, entity: 'siembra', extra: { ... } });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', { request_id: req.id, method: req.method, path: req.url, status_code: 201, actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null, action: AUDIT.CREATED, entity: 'siembra', tenant_id: req.tenantId ?? null, payload });
    ```
  - **Acceptance**: Controller compiles; POST as operario → 201 with siembra+bandejas; PATCH with `{ fecha: '2026-01-01' }` → 400 `SIEMBRA_FIELD_IMMUTABLE`; PATCH with `{ observaciones: 'test' }` as supervisor → 200; DELETE as supervisor → 403; all responses use `ok()` or `page()` wrappers

- [x] T011 [P] [US1] CREATE `src/modules/siembra/bandeja.controller.ts` — GET /bandejas and GET /bandejas/:id
  - **Implements**: plan.md Phase 4, Task 4.2
  - **Class decorator**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('bandejas')`
  - **Constructor**: inject `BandejaService`
  - **Implement 2 endpoints** (no write operations — all writes via SiembraController):
    - `GET /` — no `@Roles` (all authenticated); call `svc.listBandejas(q)` with `clampPagination`; return `page(items, p, limit, total)`; **estado defaults to `en_nursery` in service — no default needed here**
    - `GET /:id` — no `@Roles`; call `svc.getBandeja(id)`; return `ok(bandeja)`
  - **Acceptance**: GET `/bandejas` with no query params → only `en_nursery` trays; GET `/bandejas?estado=trasplantada` → only trasplantada trays; GET `/bandejas/:id` → 200 or 404 `BANDEJA_NOT_FOUND`

- [x] T012 [US1] CREATE `src/modules/siembra/siembra.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.3
  - **imports**: `TypeOrmModule.forFeature([Siembra, Bandeja])`, `TenancyModule`, `AuditModule`, `LotesModule`, `EstablecimientosModule`
  - **providers**: `[SiembraService, BandejaService]`
  - **controllers**: `[SiembraController, BandejaController]`
  - **exports**: `[SiembraService, BandejaService]`
  - **⚠️ `LotesModule` must be imported** (provides `LotesService` injected into `SiembraService`); `EstablecimientosModule` must be imported (provides `EstablecimientosService`)
  - **Acceptance**: Module compiles; no circular dependency errors; `LotesModule` and `EstablecimientosModule` present in imports

- [x] T013 [US1] MODIFY `src/app.module.ts` — register SiembraModule
  - **Implements**: plan.md Phase 4, Task 4.4
  - **Add** `import { SiembraModule } from './modules/siembra/siembra.module'` at top
  - **Add** `SiembraModule` to `imports` array after `LotesModule`
  - **Acceptance**: `npx tsc --noEmit` passes; `npm run start:dev` starts without error; all siembra and bandeja endpoints available

**✅ MVP Checkpoint (after T013)**: Full US1 functionality working:
- POST `/siembras` as operario/supervisor/admin_global → 201 with siembra + bandejas[] nested (each with `lote_semilla` and `lote_sustrato`)
- Lot type mismatch → 422 `LOTE_TIPO_INCORRECTO`
- Cross-tenant establishment or lot → 404
- Empty bandejas / `cantidad=0` → 400 validation error
- GET `/siembras/:id` → siembra with nested bandejas including lote refs
- Audit event `siembra_created` written with `totalBandejas` count
- `npx tsc --noEmit` passes

---

## Phase 3: User Story 2 — View seedings and trays in the nursery (Priority: P2)

**Goal**: All authenticated users can list seedings with filters, retrieve single seedings, browse nursery tray inventory (default `en_nursery`), and retrieve individual trays.

**Independent Test**: GET `/siembras` as operario → 200 paginated list. GET `/siembras?establecimiento_id=X` → filtered list. GET `/bandejas` (no filter) → only `en_nursery` trays. GET `/bandejas?estado=trasplantada` → only trasplantada trays. GET `/bandejas?siembra_id=X` → trays for that seeding. GET `/bandejas/:id` → single tray.

**Prerequisite**: US1 complete (T008–T013) — read paths share the same controller and service.

### Implementation for User Story 2

- [x] T014 [US2] VERIFY `src/modules/siembra/siembra.controller.ts` — confirm list and single-get behavior
  - **Implements**: spec.md US2 acceptance scenarios; plan.md Phase 4, Task 4.1 § GET / and GET /:id
  - **Verify** `GET /` has no `@Roles()` decorator
  - **Verify** `GET /:id` has no `@Roles()` decorator
  - **Verify** `listSiembras` applies `fecha_desde` / `fecha_hasta` filters correctly (date range inclusive)
  - **Verify** `listSiembras` applies `establecimiento_id` filter correctly
  - **Acceptance**: GET `/siembras?fecha_desde=2026-06-01&fecha_hasta=2026-06-04` → only seedings in that range; GET `/siembras?establecimiento_id=X` → only seedings for that establishment; all authenticated roles get 200

- [x] T015 [P] [US2] VERIFY `src/modules/siembra/bandeja.controller.ts` — confirm nursery default and all filters
  - **Implements**: spec.md US2 acceptance scenarios; plan.md Phase 4, Task 4.2; research.md Decision 2
  - **Verify** `listBandejas` in `BandejaService` applies `estado = en_nursery` when `?estado` is absent
  - **Verify** `?estado=trasplantada` overrides the default correctly
  - **Verify** `?establecimiento_id`, `?siembra_id`, `?lote_semilla_id` filters applied correctly
  - **Acceptance**: GET `/bandejas` → only `en_nursery`; GET `/bandejas?estado=trasplantada` → only `trasplantada`; GET `/bandejas?siembra_id=X` → filtered to that seeding; GET `/bandejas/:id` → 200 or 404 `BANDEJA_NOT_FOUND`

**Checkpoint**: US2 verified. All authenticated users can browse seedings and nursery tray inventory.

---

## Phase 4: User Story 3 — Update seeding notes as supervisor (Priority: P3)

**Goal**: supervisor and admin_global can update only `observaciones` on an existing seeding; any other field in PATCH body is rejected; operario cannot PATCH.

**Independent Test**: PATCH `/siembras/:id` as supervisor with `{ observaciones: 'updated note' }` → 200. PATCH with `{ fecha: '2026-01-01' }` → 400 `SIEMBRA_FIELD_IMMUTABLE`. PATCH with `{ observaciones: 'ok', usuario_id: 'x' }` → 400 `SIEMBRA_FIELD_IMMUTABLE` (body contains non-allowed key). PATCH as operario → 403.

**Prerequisite**: US1 complete — `updateSiembra` and PATCH endpoint implemented in T008/T010.

### Implementation for User Story 3

- [x] T016 [US3] VERIFY `src/modules/siembra/siembra.controller.ts` — confirm PATCH immutable fields guard
  - **Implements**: spec.md US3 acceptance scenarios; plan.md Phase 4 § PATCH guard; research.md Decision 6
  - **Verify** the `PATCH /:id` handler contains the immutable fields guard AS THE VERY FIRST LOGIC IN THE HANDLER (before any service call):
    - Uses `Object.keys((req.body as Record<string, unknown>) ?? {}).some(k => !ALLOWED.has(k))` where `ALLOWED = new Set(['observaciones'])`
    - Throws `AppError({ code: ErrorCodes.SIEMBRA_FIELD_IMMUTABLE, status: 400, ... })`
  - **Verify** `@Roles('supervisor', 'admin_global')` is present — operario must get 403
  - **Verify** audit event `siembra_updated` is written after successful update
  - **Acceptance**: PATCH `{ observaciones: 'x' }` as supervisor → 200 updated siembra; PATCH `{ fecha: '...' }` as supervisor → 400 `SIEMBRA_FIELD_IMMUTABLE`; PATCH `{ observaciones: 'x', bandejas: [] }` → 400 `SIEMBRA_FIELD_IMMUTABLE`; PATCH as operario → 403

**Checkpoint**: US3 verified. supervisor/admin_global can update notes; immutable fields strictly rejected.

---

## Phase 5: User Story 4 — Delete a seeding as admin_global (Priority: P3)

**Goal**: admin_global can soft-delete a seeding (and all its trays in bulk) when all trays are `en_nursery`; deletion blocked if any tray is `trasplantada`.

**Independent Test**: DELETE `/siembras/:id` (all `en_nursery` trays) as admin_global → 200 `{ deleted: true }`. Verify `deleted_at` set on siembra and all its bandejas in DB. DELETE with a `trasplantada` bandeja → 409 `SIEMBRA_HAS_TRASPLANTADAS`. DELETE as supervisor → 403. Audit event `siembra_deleted` written.

**Prerequisite**: US1 complete — `deleteSiembra` implemented in T008.

### Implementation for User Story 4

- [x] T017 [US4] VERIFY `src/modules/siembra/siembra.service.ts` + `src/modules/siembra/siembra.controller.ts` — confirm delete cascade and guard
  - **Implements**: spec.md US4 acceptance scenarios; plan.md Phase 3 § deleteSiembra; research.md Decisions 3, 9
  - **Verify service** `deleteSiembra`:
    1. Loads siembra with tenant scope — throws `SIEMBRA_NOT_FOUND 404` if not found
    2. Counts bandejas with `estado = BandejaEstado.TRASPLANTADA` (NOT soft-deleted bandejas — TypeORM excludes them by default) — throws `SIEMBRA_HAS_TRASPLANTADAS 409` if count > 0
    3. Uses explicit `QueryRunner` transaction with:
       - `qr.manager.query('UPDATE bandejas SET deleted_at = now() WHERE siembra_id = $1 AND deleted_at IS NULL', [id])` — **single bulk query, not N individual softDeletes**
       - `qr.manager.softDelete(Siembra, id)` — soft-delete the siembra
    4. Commits; rolls back on any error
  - **Verify controller** `DELETE /:id` has `@Roles('admin_global')` — supervisor must get 403
  - **Verify** audit event `siembra_deleted` is written after successful delete
  - **Acceptance**: DELETE with all `en_nursery` bandejas → 200; `deleted_at` is set on siembra and all bandejas in DB; DELETE with `trasplantada` bandeja → 409; DELETE as supervisor → 403; `siembra_deleted` audit event in DB

**Checkpoint**: US4 verified. admin_global can safely delete seedings; traceability protected by trasplantada guard.

---

## Phase 6: Migration & Final Verification

**Purpose**: Confirm migration integrity and run full compile + smoke tests.

- [ ] T018 VERIFY `migrations/1770400000000-SiembraInit.ts` — confirm migration was created in plan phase
  - **Action**: VERIFY ONLY — file already exists, do NOT recreate or modify it
  - **Check**:
    - File exports class `SiembraInit1770400000000 implements MigrationInterface`
    - `up()` creates `bandeja_estado` ENUM, then `siembras` table (with FK → `establecimientos`), then `bandejas` table (with FK → `siembras` and two FKs → `lotes`), then 9 indexes
    - `down()` drops all 9 indexes in reverse order, then `bandejas`, then `siembras`, then `bandeja_estado` ENUM
    - **No `ON DELETE CASCADE`** on FK — cascade is handled by the service's bulk UPDATE in a transaction
  - **Acceptance**: File exists at `migrations/1770400000000-SiembraInit.ts`; timestamp `1770400000000 > 1770300000000` (M02 lotes); `npx tsc --noEmit` includes it without errors

- [ ] T019 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` type warnings; all module imports resolve correctly

- [ ] T020 Run migration against local database
  - **Command**: `npm run migration:run` (check `package.json` for exact script name)
  - **Prerequisite**: T018 verified; local DB running with M01 and M02 migrations already applied
  - **Acceptance**: Migration runs without error; `siembras` and `bandejas` tables exist; `bandeja_estado` enum exists; all 9 indexes present; running again does NOT fail

- [ ] T021 [P] Run eslint on siembra module
  - **Command**: `npx eslint src/modules/siembra/ --ext .ts` (after T013 complete)
  - **Acceptance**: Zero errors

- [ ] T022 Manual smoke tests (all paths from plan.md Phase 6)
  - **Prerequisite**: T020 complete; server running (`npm run start:dev`)
  - **US1 tests**:
    1. `POST /siembras` as operario with 2 groups (3+2 trays) → **201** — response has `bandejas[5]` with `lote_semilla` and `lote_sustrato` refs
    2. `POST /siembras` with `lote_semilla_id` pointing to a sustrato lot → **422** `LOTE_TIPO_INCORRECTO`
    3. `POST /siembras` with `bandejas: []` → **400** validation error
    4. `POST /siembras` with `cantidad: 0` → **400** validation error
    5. `GET /siembras/:id` → **200** siembra with `bandejas[]` each having `lote_semilla` and `lote_sustrato`
  - **US2 tests**:
    6. `GET /siembras` as operario → **200** paginated list
    7. `GET /siembras?establecimiento_id=X` → **200** filtered list
    8. `GET /bandejas` (no query) → **200** only `en_nursery` trays
    9. `GET /bandejas?estado=trasplantada` → **200** only `trasplantada` trays
    10. `GET /bandejas/:id` → **200** or **404** `BANDEJA_NOT_FOUND`
  - **US3 tests**:
    11. `PATCH /siembras/:id` with `{ observaciones: 'test' }` as supervisor → **200** updated
    12. `PATCH /siembras/:id` with `{ fecha: '2026-01-01' }` as supervisor → **400** `SIEMBRA_FIELD_IMMUTABLE`
    13. `PATCH /siembras/:id` as operario → **403**
  - **US4 tests**:
    14. `DELETE /siembras/:id` (all `en_nursery`) as admin_global → **200** `{ deleted: true }` + audit
    15. `DELETE /siembras/:id` (has trasplantada bandeja) → **409** `SIEMBRA_HAS_TRASPLANTADAS`
    16. `DELETE /siembras/:id` as supervisor → **403**
  - **Acceptance**: All 16 paths return expected status codes; responses use `ok()`/`page()` wrappers; audit events for create, update, delete in DB

**✅ Final Checkpoint (M03 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 22 tasks checked
- All 16 smoke tests passing
- Audit events recorded for create, update, delete
- Bulk cascade delete confirmed (single UPDATE query, not N individual deletes)
- Default `en_nursery` filter on GET `/bandejas` confirmed

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational) ──► Phase 2 (US1 MVP) ──► Phase 3 (US2 verify) ──► Phase 4 (US3 verify) ──► Phase 5 (US4 verify) ──► Phase 6 (Verify)
```

- **Foundational (T001–T007)**: No dependencies — start immediately
- **US1 (T008–T013)**: All T001–T007 must be done — BLOCKS all user story work
- **US2 (T014–T015)**: US1 complete — list/read paths verified
- **US3 (T016)**: US1 complete — PATCH endpoint implemented in T010; this is verification only
- **US4 (T017)**: US1 complete — DELETE endpoint implemented in T010; this is verification only
- **Verify (T018–T022)**: All code phases complete

### Within Each Phase

- Foundation: T001 first (error codes), then T002–T007 in parallel (entities + DTOs)
- US1: T008 [P] + T009 [P] in parallel (services, no interdependency) → T010 + T011 [P] (controllers) → T012 (module) → T013 (app.module)
- US2: T014 [P] + T015 [P] (both verify, independent files)
- US3: T016 (verify PATCH, after T010)
- US4: T017 (verify DELETE, after T010)
- Verify: T018 [P] + T019 [P] → T020 → T021 [P] + T022

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create Siembra entity
T003: Create Bandeja entity (+ BandejaEstado enum)
T004: Create CreateSiembraDto + BandejaGroupDto
T005: Create UpdateSiembraDto
T006: Create QuerySiembrasDto
T007: Create QueryBandejasDto

# US1 parallel batch (can start together):
T008: Create SiembraService  ← complex; start first
T009: Create BandejaService  ← simpler; can run in parallel with T008

# US1 controllers parallel batch (after T008 + T009):
T010: Create SiembraController
T011: Create BandejaController

# US2 parallel verify batch (after T013):
T014: Verify siembra GET endpoints
T015: Verify bandeja GET endpoints + estado default

# Final parallel batch (after T017):
T018: Verify migration file
T019: Run tsc --noEmit
T021: Run eslint (after T020)
```

---

## Implementation Strategy

### MVP First (US1 only — create + read)

1. Complete Phase 1: Foundational (T001–T007)
2. Complete Phase 2: US1 (T008–T013)
3. **STOP and VALIDATE**: POST and GET siembras/bandejas work; tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation → US1 → **demo operario records seeding + nursery tray view** (MVP)
2. Verify US2 (T014–T015) → **confirm list/filter/browse all work**
3. Verify US3 (T016) → **confirm supervisor can update notes; immutable fields rejected**
4. Verify US4 (T017) → **confirm admin_global can delete seedings; cascade and guard work**
5. Migration + verification (T018–T022) → **production ready**

### Parallel Team Strategy

With multiple developers (after Phase 1 Foundational complete):
- Developer A: T008 — SiembraService (complex transaction logic)
- Developer B: T009 — BandejaService (simpler, extends BaseCrudTenantService)
- After both services done: Developer A → T010 SiembraController, Developer B → T011 BandejaController

---

## Notes

- `[P]` tasks touch different files — safe to work in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- US2 (T014–T015), US3 (T016), and US4 (T017) are **verify** tasks — the code was already written in T008/T009/T010/T011; no new files created
- `SiembraService` does NOT extend `BaseCrudTenantService` (research Decision 1) — do not add `extends` even if it seems convenient
- `BandejaService` DOES extend `BaseCrudTenantService<Bandeja>` — reuses tenant-scoped list/find
- The PATCH immutable guard reads from `req.body` (raw Express body before ValidationPipe strips unknown fields) — must be the VERY FIRST logic in the handler
- Migration (T018) already exists — **do NOT recreate it**; just verify and run it
- `createSiembra` validates ALL lots BEFORE opening the QueryRunner — no partial transaction rollback due to validation errors
- `deleteSiembra` cascade uses a single `UPDATE bandejas SET deleted_at = now() WHERE siembra_id = $1 AND deleted_at IS NULL` — not N individual softDelete calls
- GET `/bandejas` default `estado=en_nursery` is applied in `BandejaService.listBandejas()`, not in the DTO or controller
- `usuario_id` is always from `req.user.sub` (JWT) — never from request body
- `fecha` defaults to `new Date().toISOString().split('T')[0]` (today's date) in `createSiembra` when `dto.fecha` is omitted
