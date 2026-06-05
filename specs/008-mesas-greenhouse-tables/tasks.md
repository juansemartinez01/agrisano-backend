# Tasks: M08 — Mesas (Greenhouse Tables)

**Input**: Design documents from `/specs/008-mesas-greenhouse-tables/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅ | research.md ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Each phase is independently testable after completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US7)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Error codes, entities, and all 5 DTOs. Nothing else starts until T001–T008 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add five mesas domain error codes
  - **Implements**: plan.md Phase 1, Task 1.1
  - **Add** under a `// mesas` comment (after `// tuneles` block):
    ```typescript
    // mesas
    MESA_NOT_FOUND: 'MESA_NOT_FOUND',
    MESA_QR_NOT_FOUND: 'MESA_QR_NOT_FOUND',
    MESA_ESTADO_INVALIDO: 'MESA_ESTADO_INVALIDO',
    MESA_FIELD_IMMUTABLE: 'MESA_FIELD_IMMUTABLE',
    MESA_SOLO_BAJA_DELETE: 'MESA_SOLO_BAJA_DELETE',
    ```
  - **Acceptance**: All 5 codes present in `ErrorCodes`; `npx tsc --noEmit` passes; `ErrorCode` union type updated automatically

- [x] T002 [P] CREATE `src/modules/mesas/entities/mesa.entity.ts` — Mesa entity
  - **Implements**: plan.md Phase 1, Task 1.2; data-model.md § Mesa
  - **Extend** `BaseEntity` from `src/common/database/base.entity`
  - **Declare enum** `MesaEstado { ACTIVA = 'activa', EN_COSECHA = 'en_cosecha', BAJA = 'baja' }` in same file, export it
  - **Decorator**: `@Entity('mesas')`
  - **Columns**:
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL; immutable after creation
    - `tunel_id`: `@Column({ type: 'uuid' })` — NOT NULL; updated by M10/M11 transplant
    - `codigo_qr`: `@Column({ type: 'varchar', length: 100, unique: true })` — NOT NULL; generated server-side
    - `posicion_actual`: `@Column({ type: 'int', nullable: true, default: null })` — nullable integer
    - `estado`: `@Column({ type: 'enum', enum: MesaEstado, enumName: 'mesa_estado', default: MesaEstado.ACTIVA })` — NOT NULL
    - `fecha_ultimo_trasplante`: `@Column({ type: 'timestamptz', nullable: true, default: null })` — set by M10/M11 only
    - `plantas_estimadas`: `@Column({ type: 'int', default: 450 })` — NOT NULL; updatable via PATCH
    - `activo`: `@Column({ type: 'boolean', default: true })` — NOT NULL
  - **⚠️ NO `@Unique` decorator on entity level** — uniqueness lives in migration constraints only
  - **Acceptance**: File exports `Mesa` and `MesaEstado`; `npx tsc --noEmit` passes; no `@Unique` decorator

- [x] T003 [P] CREATE `src/modules/mesas/entities/historial-mesa.entity.ts` — HistorialMesa entity
  - **Implements**: plan.md Phase 1, Task 1.3; data-model.md § HistorialMesa
  - **⚠️ DOES NOT extend `BaseEntity`** — no `deleted_at` (immutable append-only log)
  - **Declare enum** `HistorialTipoEvento { TRASPLANTE = 'trasplante', COSECHA = 'cosecha', CAMBIO_POSICION = 'cambio_posicion', APLICACION_QUIMICA = 'aplicacion_quimica', REACTIVACION = 'reactivacion', BAJA = 'baja' }` in same file, export it
  - **Decorator**: `@Entity('historial_mesa')`
  - **Columns**:
    - `id`: `@PrimaryGeneratedColumn('uuid')`
    - `tenant_id`: `@Column({ type: 'uuid', nullable: true })`
    - `mesa_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `tipo_evento`: `@Column({ type: 'enum', enum: HistorialTipoEvento, enumName: 'historial_tipo_evento' })` — NOT NULL
    - `fecha_hora`: `@Column({ type: 'timestamptz', default: () => 'now()' })` — NOT NULL
    - `detalle`: `@Column({ type: 'jsonb', nullable: true, default: null })`
    - `usuario_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `created_at`: `@CreateDateColumn({ type: 'timestamptz' })`
    - `updated_at`: `@UpdateDateColumn({ type: 'timestamptz' })`
  - **Acceptance**: File exports `HistorialMesa` and `HistorialTipoEvento`; no `deleted_at` column; compiles

- [x] T004 [P] CREATE `src/modules/mesas/dto/create-mesa.dto.ts` — create DTO
  - **Implements**: plan.md Phase 2, Task 2.1
  - **Fields**:
    - `establecimiento_id: string` — `@IsUUID()` (required)
    - `tunel_id: string` — `@IsUUID()` (required)
    - `plantas_estimadas?: number` — `@IsOptional() @IsInt() @Min(1)` (entity defaults to 450)
  - **⚠️ `codigo_qr`, `posicion_actual`, `estado` MUST NOT appear** — generated/assigned server-side
  - **Acceptance**: Only 3 fields; `npx tsc --noEmit` passes

- [x] T005 [P] CREATE `src/modules/mesas/dto/update-mesa.dto.ts` — update DTO (2 fields max)
  - **Implements**: plan.md Phase 2, Task 2.2
  - **Fields**:
    - `plantas_estimadas?: number` — `@IsOptional() @IsInt() @Min(1)`
    - `activo?: boolean` — `@IsOptional() @IsBoolean()`
  - **⚠️ NO other fields** — PATCH guard also enforces this at runtime
  - **Acceptance**: Exactly 2 optional fields; no `estado`, `tunel_id`, `establecimiento_id`, `codigo_qr` present

- [x] T006 [P] CREATE `src/modules/mesas/dto/query-mesas.dto.ts` — list/filter query DTO
  - **Implements**: plan.md Phase 2, Task 2.3
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Import** `MesaEstado` from `../entities/mesa.entity`
  - **Fields**:
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `tunel_id?: string` — `@IsOptional() @IsUUID()`
    - `estado?: MesaEstado` — `@IsOptional() @IsEnum(MesaEstado)`
    - `activo?: boolean` — `@IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()`
    - `q?: string` — `@IsOptional() @IsString()` — ILIKE search on `codigo_qr`
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Acceptance**: Extends `PageQueryDto`; compiles; 7 optional fields

- [x] T007 [P] CREATE `src/modules/mesas/dto/query-historial.dto.ts` — historial query DTO
  - **Implements**: plan.md Phase 2, Task 2.4
  - **Extend** `PageQueryDto`
  - **Fields**:
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **Acceptance**: Extends `PageQueryDto`; compiles

- [x] T008 [P] CREATE `src/modules/mesas/dto/create-historial.dto.ts` — internal historial write DTO
  - **Implements**: plan.md Phase 2, Task 2.5
  - **Purpose**: Used by M09/M10/M11 when calling `HistorialMesaService.writeEvent()` — NOT exposed as REST endpoint
  - **Import** `HistorialTipoEvento` from `../entities/historial-mesa.entity`
  - **Fields**:
    - `mesa_id: string` — `@IsUUID()`
    - `tipo_evento: HistorialTipoEvento` — `@IsEnum(HistorialTipoEvento)`
    - `detalle?: Record<string, unknown>` — `@IsOptional() @IsObject()`
    - `usuario_id: string` — `@IsUUID()`
    - `tenant_id: string` — `@IsUUID()` (caller provides from tenantContext)
  - **Acceptance**: Exports `CreateHistorialDto`; all 5 fields present; compiles

**Checkpoint**: T001–T008 done. `npx tsc --noEmit` passes. Proceed to services.

---

## Phase 2: User Story 1 + 2 + 6 — Create, QR scan, and browse tables (Priority: P1+P2) 🎯 MVP

**Goal (US1)**: supervisor and admin_global create tables; FIFO position auto-assigned atomically; codigo_qr generated server-side; audit written.
**Goal (US2)**: any authenticated user scans a QR code and receives full table details with nested tunel info.
**Goal (US6)**: any authenticated user browses the full table catalog with filters and QR code search.

**Independent Test (US1)**: POST `/mesas` as supervisor with valid tunel + establecimiento → 201; `codigo_qr` is a UUID v4; `posicion_actual = 1`. POST again to same tunel → `posicion_actual = 2`. POST as operario → 403.
**Independent Test (US2)**: GET `/mesas/qr/:codigoQr` → 200 with `data.tunel.nombre` and `data.tunel.capacidad_maxima` present. GET unknown QR → 404 `MESA_QR_NOT_FOUND`.
**Independent Test (US6)**: GET `/mesas?estado=activa` → only activa returned. GET `/mesas?q=<uuid-prefix>` → filtered by codigo_qr ILIKE. GET `/mesas/:id` → 200 with tunel info.

### Implementation for User Story 1 + 2 + 6

- [x] T009 [US1] CREATE `src/modules/mesas/historial-mesa.service.ts` — HistorialMesaService
  - **Implements**: plan.md Phase 3, Task 3.2
  - **⚠️ CRITICAL**: Plain `@Injectable()` — does NOT extend `BaseCrudTenantService`
  - **Decorator**: `@Injectable()`
  - **Constructor**: inject `@InjectRepository(HistorialMesa) private readonly historialRepo: Repository<HistorialMesa>`, `private readonly tenancy: TenancyService`
  - **Implement `writeEvent(data: { mesa_id: string; tipo_evento: HistorialTipoEvento; detalle?: Record<string, unknown>; usuario_id: string; tenant_id: string | null })`**:
    - `await this.historialRepo.save({ ...data, fecha_hora: new Date() })`
    - No internal transaction — callers wrap when atomicity is required
  - **Implement `listByMesa(mesa_id: string, q: QueryHistorialDto, tenantId: string | null)`**:
    - QB alias `'h'`: `WHERE h.mesa_id = :mesa_id AND h.tenant_id = :tenantId`
    - Apply `sortBy`/`sortOrder` from `q`; default sort `h.fecha_hora DESC`
    - `getManyAndCount()` → return `{ items, total }`
  - **Acceptance**: Service compiles; `writeEvent` inserts row; `listByMesa` returns sorted results; no `any` types

- [x] T010 [US1] CREATE `src/modules/mesas/mesas.service.ts` — MesasService (all methods)
  - **Implements**: plan.md Phase 3, Task 3.1
  - **⚠️ CRITICAL**: Plain `@Injectable()` — does NOT extend `BaseCrudTenantService`
  - **Decorator**: `@Injectable()`
  - **Constructor**: inject:
    - `@InjectRepository(Mesa) private readonly mesaRepo: Repository<Mesa>`
    - `private readonly dataSource: DataSource`
    - `private readonly tunelesService: TunelesService`
    - `private readonly estService: EstablecimientosService`
    - `private readonly tenancy: TenancyService`
    - `private readonly historialService: HistorialMesaService`
    - `private readonly audit: AuditService`
    - `private readonly logger: PinoLogger`
  - **Export `AUDIT` const**:
    ```typescript
    export const AUDIT = {
      CREATED: 'mesa_created',
      DAR_DE_BAJA: 'mesa_dar_de_baja',
      REACTIVADA: 'mesa_reactivada',
      DELETED: 'mesa_deleted',
    } as const;
    ```
  - **Implement `createMesa(dto: CreateMesaDto, userId: string)`** [US1]:
    1. `const tenantId = this.tenancy.requireTenantId()`
    2. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` — 404 if cross-tenant
    3. `const tunel = await this.tunelesService.mustFindById(dto.tunel_id, { strictTenant: true })` — 404 if not found; verify `tunel.establecimiento_id === dto.establecimiento_id` or throw `AppError({ code: ErrorCodes.TUNEL_NOT_FOUND, status: 404 })`
    4. `const codigoQr = randomUUID()` — import from `'crypto'`
    5. Open `QueryRunner`: `const qr = this.dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
    6. In `try`:
       - `const result = await qr.query('SELECT MAX(posicion_actual) AS max FROM mesas WHERE tunel_id = $1 AND deleted_at IS NULL AND posicion_actual IS NOT NULL', [dto.tunel_id])`
       - `const newPos: number = (result[0]?.max ?? 0) + 1`
       - `const inserted = qr.manager.create(Mesa, { tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, tunel_id: dto.tunel_id, codigo_qr: codigoQr, posicion_actual: newPos, estado: MesaEstado.ACTIVA, plantas_estimadas: dto.plantas_estimadas ?? 450, activo: true })`
       - `const mesa = await qr.manager.save(Mesa, inserted)`
       - `await qr.commitTransaction()`
       - Return `mesa`
    7. In `catch`: `await qr.rollbackTransaction(); throw error`
    8. In `finally`: `await qr.release()`
    9. Write audit `AUDIT.CREATED`
  - **Implement `listMesas(q: QueryMesasDto, tenantId: string | null)`** [US6]:
    - QB alias `'m'`: always scope `m.tenant_id = :tenantId` and `m.deleted_at IS NULL`
    - Apply filters when defined: `m.establecimiento_id = :eid`, `m.tunel_id = :tid`, `m.estado = :estado`, `m.activo = :activo`
    - If `q.q`: `m.codigo_qr ILIKE :search` (wrap value with `%${q.q}%`)
    - Default sort `m.created_at DESC`; honour `q.sortBy`/`q.sortOrder`
    - `getManyAndCount()` → return `{ items, total }`
  - **Implement `getMesaById(id: string, tenantId: string | null)`** [US2/US6]:
    - QB alias `'m'`: `WHERE m.id = :id AND m.tenant_id = :tenantId AND m.deleted_at IS NULL`
    - `LEFT JOIN tuneles t ON t.id = m.tunel_id` → select `t.nombre AS tunel_nombre`, `t.capacidad_maxima AS tunel_capacidad_maxima`
    - Map raw result to include nested `tunel: { nombre, capacidad_maxima }`
    - Throw `AppError({ code: ErrorCodes.MESA_NOT_FOUND, status: 404 })` if not found
  - **Implement `getMesaByQr(codigoQr: string, tenantId: string | null)`** [US2]:
    - Same QB pattern as `getMesaById` but `WHERE m.codigo_qr = :codigoQr AND m.tenant_id = :tenantId AND m.deleted_at IS NULL`
    - Throw `AppError({ code: ErrorCodes.MESA_QR_NOT_FOUND, status: 404 })` if not found
  - **Implement `updateMesa(id: string, dto: UpdateMesaDto, tenantId: string | null)`** [US6]:
    1. Load mesa or throw `MESA_NOT_FOUND 404`
    2. `await this.mesaRepo.update({ id, tenant_id: tenantId }, dto)`
    3. Return updated mesa (refetch)
  - **Implement `darDeBaja(id: string, userId: string, tenantId: string | null)`** [US4]:
    1. Load mesa or throw `MESA_NOT_FOUND 404`
    2. If `mesa.estado === MesaEstado.BAJA` → throw `AppError({ code: ErrorCodes.MESA_ESTADO_INVALIDO, status: 409 })`
    3. `QueryRunner` transaction:
       - `UPDATE mesas SET estado='baja', posicion_actual=NULL, updated_at=now() WHERE id=:id AND tenant_id=:tenantId`
       - `await this.historialService.writeEvent({ mesa_id: id, tipo_evento: HistorialTipoEvento.BAJA, usuario_id: userId, tenant_id: tenantId })` — called inside transaction via `qr.manager` or after commit (atomic via same QR)
    4. Write audit `AUDIT.DAR_DE_BAJA`
    5. Return updated mesa
  - **Implement `reactivar(id: string, userId: string, tenantId: string | null)`** [US5]:
    1. Load mesa or throw `MESA_NOT_FOUND 404`
    2. If `mesa.estado !== MesaEstado.BAJA` → throw `AppError({ code: ErrorCodes.MESA_ESTADO_INVALIDO, status: 409 })`
    3. `QueryRunner` transaction:
       - `UPDATE mesas SET estado='activa', posicion_actual=NULL, updated_at=now() WHERE id=:id AND tenant_id=:tenantId`
       - Write historial `HistorialTipoEvento.REACTIVACION`
    4. Write audit `AUDIT.REACTIVADA`
    5. Return updated mesa
  - **Implement `deleteMesa(id: string, tenantId: string | null)`** [US4]:
    1. Load mesa or throw `MESA_NOT_FOUND 404`
    2. If `mesa.estado !== MesaEstado.BAJA` → throw `AppError({ code: ErrorCodes.MESA_SOLO_BAJA_DELETE, status: 409 })`
    3. `await this.mesaRepo.softDelete({ id, tenant_id: tenantId })`
    4. Write audit `AUDIT.DELETED`
  - **Implement `getMesasByTunel(tunel_id: string, q: QueryMesasDto, tenantId: string | null)`** [US3]:
    - `await this.tunelesService.mustFindById(tunel_id, { strictTenant: true })`
    - QB: `WHERE m.tunel_id = :tunel_id AND m.tenant_id = :tenantId AND m.posicion_actual IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.posicion_actual ASC`
    - Return paginated `{ items, total }`
  - **Expose for M10/M11**:
    ```typescript
    async updateMesaTunel(id: string, tunel_id: string, posicion_actual: number, fecha_ultimo_trasplante: Date, tenantId: string | null): Promise<void>
    async updateMesaEstado(id: string, estado: MesaEstado, posicion_actual: number | null, tenantId: string | null): Promise<void>
    ```
    Both methods: load mesa or throw `MESA_NOT_FOUND`; apply updates; return void
  - **Acceptance**: `createMesa` uses `QueryRunner` transaction; `getMesaById` includes tunel nested object; `darDeBaja` allowed from activa and en_cosecha; `reactivar` only from baja; no `any` types; compiles

- [x] T011 [US1] CREATE `src/modules/mesas/mesas.controller.ts` — MesasController (10 routes, no prefix)
  - **Implements**: plan.md Phase 4, Task 4.1
  - **⚠️ CRITICAL**: `@Controller()` with NO prefix — all routes are explicit full-path strings
  - **Class-level**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()`
  - **Constructor**: inject `MesasService`, `AuditService`, `PinoLogger`
  - **Declare `AuthRequest` type** locally (same pattern as `stock-movimientos.controller.ts`):
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
  - **⚠️ ROUTE DECLARATION ORDER IS CRITICAL** — NestJS matches in declaration order:
    1. `@Get('mesas')` — list (no role guard) → `listMesas(q, tenantId)` → `page(items, p, limit, total)`
    2. `@Get('mesas/qr/:codigoQr')` — **MUST come before `mesas/:id`** (no role) → `getMesaByQr(codigoQr, tenantId)` → `ok(mesa)`
    3. `@Get('mesas/:id')` — get by ID (no role) → `getMesaById(id, tenantId)` → `ok(mesa)`
    4. `@Post('mesas') @HttpCode(HttpStatus.CREATED) @Roles('supervisor', 'admin_global')` — create → `createMesa(dto, userId)` + audit → `ok(mesa)`
    5. `@Patch('mesas/:id') @Roles('supervisor', 'admin_global')` — update with **IMMUTABLE GUARD FIRST**:
       ```typescript
       const ALLOWED = new Set(['plantas_estimadas', 'activo']);
       const body = req.body as Record<string, unknown>;
       if (Object.keys(body ?? {}).some((k) => !ALLOWED.has(k))) {
         throw new AppError({ code: ErrorCodes.MESA_FIELD_IMMUTABLE, message: 'Solo se pueden modificar plantas_estimadas y activo', status: 400 });
       }
       ```
       → `updateMesa(id, dto, tenantId)` → `ok(mesa)`
    6. `@Delete('mesas/:id') @Roles('admin_global')` — soft-delete → `deleteMesa(id, tenantId)` + audit → `ok({ deleted: true })`
    7. `@Post('mesas/:id/dar-de-baja') @HttpCode(HttpStatus.OK) @Roles('supervisor', 'admin_global')` → `darDeBaja(id, userId, tenantId)` + audit → `ok(mesa)`
    8. `@Post('mesas/:id/reactivar') @HttpCode(HttpStatus.OK) @Roles('supervisor', 'admin_global')` → `reactivar(id, userId, tenantId)` + audit → `ok(mesa)`
    9. `@Get('mesas/:id/historial')` (no role) → `historialService.listByMesa(id, q, tenantId)` → `page(items, p, limit, total)`
    10. `@Get('tuneles/:tunel_id/mesas')` (no role) → `getMesasByTunel(tunel_id, q, tenantId)` → `page(items, p, limit, total)`
  - **Audit pattern**: identical to `StockMovimientosController` — `auditLogPayload()` + `this.audit.write('admin', ...)`; inject `tenantId` from `req.tenantId ?? null`
  - **Acceptance**: Route 2 (`qr/:codigoQr`) declared BEFORE route 3 (`/:id`); PATCH with `{ estado: ... }` → 400; POST as operario → 403; `tuneles/:tunel_id/mesas` resolves without conflicts

- [x] T012 [US1] CREATE `src/modules/mesas/mesas.module.ts` — module wiring
  - **Implements**: plan.md Phase 4, Task 4.2
  - **imports**: `TypeOrmModule.forFeature([Mesa, HistorialMesa])`, `TenancyModule`, `AuditModule`, `TunelesModule`, `EstablecimientosModule`
  - **providers**: `[MesasService, HistorialMesaService]`
  - **controllers**: `[MesasController]`
  - **exports**: `[MesasService, HistorialMesaService]` — **BOTH must be exported**
  - **⚠️ `TunelesModule` MUST be imported** — provides `TunelesService`
  - **⚠️ `EstablecimientosModule` MUST be imported** — provides `EstablecimientosService`
  - **Acceptance**: Module compiles; no circular dependency errors; both services in exports

- [x] T013 [US1] MODIFY `src/app.module.ts` — register MesasModule
  - **Implements**: plan.md Phase 4, Task 4.3
  - **Add** `import { MesasModule } from './modules/mesas/mesas.module'` at top
  - **Add** `MesasModule` to `imports` array after `TunelesModule`
  - **Acceptance**: `npx tsc --noEmit` passes; all mesas endpoints respond

**✅ MVP Checkpoint (after T013)**: US1 + US2 + US6 fully working:
- POST `/mesas` as supervisor/admin_global with valid tunel+establecimiento → 201; `codigo_qr` is UUID; `posicion_actual = 1`
- POST same tunel again → 201; `posicion_actual = 2`; positions are atomic (no duplicates)
- POST as operario → 403
- GET `/mesas/qr/:codigoQr` → 200 with `data.tunel.nombre` and `data.tunel.capacidad_maxima`
- GET `/mesas/qr/unknown-uuid` → 404 `MESA_QR_NOT_FOUND`
- GET `/mesas/:id` → 200 with nested tunel info
- GET `/mesas?estado=activa` → filtered list
- GET `/mesas?q=<partial-qr>` → ILIKE filtered
- PATCH `/mesas/:id` with `{ plantas_estimadas: 500 }` → 200
- PATCH `/mesas/:id` with `{ estado: 'baja' }` → 400 `MESA_FIELD_IMMUTABLE`
- PATCH `/mesas/:id` with `{ tunel_id: '...' }` → 400 `MESA_FIELD_IMMUTABLE`
- Audit event `mesa_created` written for each creation

---

## Phase 3: User Story 3 — View FIFO-ordered tunnel tables (Priority: P2)

**Goal**: any authenticated user lists all tables in a specific tunnel ordered by posicion_actual ASC; tables with NULL positions excluded.

**Independent Test**: GET `/tuneles/:tunel_id/mesas` → items sorted by `posicion_actual` ascending; no items with `posicion_actual = null`; cross-tenant tunnel → 404. Reactivated mesa (posicion_actual=NULL) does NOT appear in this list.

- [x] T014 [US3] VERIFY `src/modules/mesas/mesas.service.ts` + `src/modules/mesas/mesas.controller.ts` — tunnel FIFO list behavior
  - **Verify service** `getMesasByTunel`: (1) `tunelesService.mustFindById(tunel_id)` validates tunnel belongs to tenant; (2) QB filters `posicion_actual IS NOT NULL`; (3) `ORDER BY posicion_actual ASC`; (4) soft-deleted mesas excluded
  - **Verify controller** `@Get('tuneles/:tunel_id/mesas')`: no `@Roles` guard (all authenticated); `@Query() q: QueryMesasDto`; `tenantId` from `req.tenantId ?? null`; returns `page(items, p, limit, total)`
  - **Verify route is in MesasController** — NOT TunelesController
  - **Smoke test**: GET `/tuneles/:id/mesas` with 3 active tables (positions 1,2,3) + 1 baja (position NULL) → 3 items in ascending order; reactivated mesa (activa + posicion_actual=NULL) not in list
  - **Acceptance**: All US3 acceptance scenarios from spec pass

**✅ Checkpoint**: US3 verified — FIFO tunnel view works correctly.

---

## Phase 4: User Story 4 — Retire a table (Dar de Baja) (Priority: P2)

**Goal**: supervisor/admin_global decommissions a table from activa or en_cosecha; estado set to baja; posicion_actual cleared; historial event written; already-baja tables blocked.

**Independent Test**: POST `/mesas/:id/dar-de-baja` (activa) → 200; `estado='baja'`; `posicion_actual=null`; historial event `tipo_evento='baja'` written. POST same mesa again → 409 `MESA_ESTADO_INVALIDO`. DELETE non-baja mesa → 409 `MESA_SOLO_BAJA_DELETE`. DELETE baja mesa as admin_global → 200 + audit.

- [x] T015 [US4] VERIFY `src/modules/mesas/mesas.service.ts` + `src/modules/mesas/mesas.controller.ts` — dar-de-baja and delete behavior
  - **Verify service** `darDeBaja`: allowed from `activa` AND `en_cosecha`; blocked from `baja` → `MESA_ESTADO_INVALIDO 409`; UPDATE + historial INSERT in same transaction; `posicion_actual` set to `NULL`
  - **Verify service** `deleteMesa`: blocked if `estado !== 'baja'` → `MESA_SOLO_BAJA_DELETE 409`; `softDelete` on valid baja mesa; audit `mesa_deleted` written
  - **Verify controller** `POST 'mesas/:id/dar-de-baja'`: `@Roles('supervisor', 'admin_global')`; operario → 403; audit `mesa_dar_de_baja` written
  - **Verify controller** `DELETE 'mesas/:id'`: `@Roles('admin_global')`; supervisor → 403
  - **Smoke test**: POST dar-de-baja (activa) → 200; GET historial for same mesa → evento `baja` present; GET `/tuneles/:id/mesas` → baja mesa no longer in list; DELETE (baja) as admin_global → 200
  - **Acceptance**: All US4 acceptance scenarios from spec pass

**✅ Checkpoint**: US4 verified — dar-de-baja and delete work correctly.

---

## Phase 5: User Story 5 — Reactivate a retired table (Priority: P3)

**Goal**: supervisor/admin_global reactivates a baja table to activa; posicion_actual stays NULL; historial event written; reactivated table not in tunnel FIFO view until transplanted.

**Independent Test**: POST `/mesas/:id/reactivar` (baja) → 200; `estado='activa'`; `posicion_actual=null`; historial `reactivacion` written. POST on activa mesa → 409 `MESA_ESTADO_INVALIDO`. POST on en_cosecha mesa → 409 `MESA_ESTADO_INVALIDO`. Reactivated mesa NOT in GET `/tuneles/:id/mesas` list.

- [x] T016 [US5] VERIFY `src/modules/mesas/mesas.service.ts` + `src/modules/mesas/mesas.controller.ts` — reactivar behavior
  - **Verify service** `reactivar`: ONLY allowed from `baja`; blocked from `activa` or `en_cosecha` → `MESA_ESTADO_INVALIDO 409`; UPDATE + historial INSERT (`reactivacion`) in same transaction; `posicion_actual` stays NULL
  - **Verify controller** `POST 'mesas/:id/reactivar'`: `@Roles('supervisor', 'admin_global')`; operario → 403; audit `mesa_reactivada` written
  - **Smoke test**: dar-de-baja mesa → reactivar → `estado='activa'`; GET historial → both `baja` and `reactivacion` events present; GET `/tuneles/:id/mesas` → reactivated mesa NOT listed (posicion_actual=NULL)
  - **Acceptance**: All US5 acceptance scenarios from spec pass

**✅ Checkpoint**: US5 verified — reactivar works correctly with correct state guards.

---

## Phase 6: User Story 7 — View table event history (Priority: P3)

**Goal**: any authenticated user views the paginated, chronologically ordered event history for any table.

**Independent Test**: GET `/mesas/:id/historial` after dar-de-baja + reactivar → 2 events returned with `tipo_evento`, `fecha_hora`, `detalle`, `usuario_id` present. GET on mesa with no events → empty paginated result. Pagination params work.

- [x] T017 [US7] VERIFY `src/modules/mesas/mesas.controller.ts` + `src/modules/mesas/historial-mesa.service.ts` — historial list behavior
  - **Verify controller** `@Get('mesas/:id/historial')`: no role guard (all authenticated); injects `QueryHistorialDto`; calls `historialService.listByMesa(id, q, tenantId)` → `page(items, p, limit, total)`
  - **Verify service** `listByMesa`: scoped to `mesa_id + tenant_id`; default sort `fecha_hora DESC`; all 7 HistorialTipoEvento values are query-able (no filter in this endpoint — returns all types for the mesa)
  - **Verify historial is tenant-scoped**: only events for current tenant's mesas returned
  - **Verify historial is immutable**: no DELETE or PATCH routes on historial in the controller
  - **Smoke test**: GET historial for mesa with 3 events → all 3 returned; pagination limit=1 → 1 item, total=3
  - **Acceptance**: All US7 acceptance scenarios from spec pass

**✅ Checkpoint**: US7 verified — historial list works, immutable.

---

## Phase 7: Migration & Final Verification

- [ ] T018 VERIFY `migrations/1770900000000-MesasInit.ts` — confirm migration file is correct (created in plan phase)
  - **Action**: VERIFY ONLY — file already exists at `migrations/1770900000000-MesasInit.ts`; do NOT recreate or modify
  - **Check**:
    - Exports `MesasInit1770900000000`; implements `MigrationInterface`
    - `up()` creates ENUM `mesa_estado` + ENUM `historial_tipo_evento` BEFORE tables
    - `up()` creates `mesas` table with `UQ_mesas_codigo_qr` UNIQUE constraint
    - `up()` creates partial unique index `UQ_mesas_tunel_posicion ON mesas(tunel_id, posicion_actual) WHERE posicion_actual IS NOT NULL`
    - `up()` creates `historial_mesa` table (no `deleted_at` column)
    - 9 indexes total: 5 on `mesas` + 4 on `historial_mesa`
    - `down()` drops historial indexes → historial_mesa → mesas indexes → mesas → ENUMs (reverse order)
    - Timestamp `1770900000000 > 1770800000000` (M07 tuneles)
  - **Acceptance**: File exists and matches spec; `npm run migration:run` creates both tables + all indexes without errors

- [ ] T019 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; no `any` types anywhere in the new module; all imports resolve; all NestJS decorators compile

**✅ Final Checkpoint (M08 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 19 tasks checked
- `mesas/qr/:codigoQr` route declared before `mesas/:id` — verified
- Both `MesasService` and `HistorialMesaService` in MesasModule exports — verified
- `TunelesModule` and `EstablecimientosModule` in MesasModule imports — verified
- FIFO position assigned atomically via QueryRunner transaction — verified
- `dar-de-baja` works from activa AND en_cosecha; `reactivar` only from baja — verified
- `DELETE` only if `estado='baja'` — verified
- `GET /tuneles/:tunel_id/mesas` in MesasController (not TunelesController) — verified
- 4 audit events written: mesa_created, mesa_dar_de_baja, mesa_reactivada, mesa_deleted
- `HistorialMesaService.writeEvent()` ready for M09/M10/M11 injection

---

## Dependencies & Execution Order

```
Phase 1 (T001–T008)
  │
  ├─► T009 (HistorialMesaService) [P]─┐
  └─► T010 (MesasService)          [P]─┤
                                       ▼
                                    T011 (MesasController)
                                       │
                                    T012 (MesasModule)
                                       │
                                    T013 (AppModule)
                                       │
                              ✅ MVP Checkpoint
                                       │
               ┌───────────────────────┼───────────────────────┐
               ▼                       ▼                       ▼
           T014 [US3]             T015 [US4]             T016 [US5]
         (tunnel FIFO)          (dar-de-baja)           (reactivar)
                                                              │
                                                         T017 [US7]
                                                          (historial)
                                                              │
                                                    T018 [P] + T019 [P]
                                                   (migration + tsc check)
```

### Within Phase 1

- T001 first (error codes block nothing but is fast prerequisite)
- T002–T008 can all run in parallel after T001 (different files)

### Within Phase 2

- T009 and T010 can run in parallel (different files; T010 imports T009 type but doesn't call it until runtime)
- T011 depends on both T009 and T010 completing
- T012 depends on T011; T013 depends on T012

---

## Parallel Execution Examples

### Phase 1 — Entities + DTOs in parallel (after T001)

```
T002 — Create Mesa entity
T003 — Create HistorialMesa entity
T004 — Create CreateMesaDto
T005 — Create UpdateMesaDto
T006 — Create QueryMesasDto
T007 — Create QueryHistorialDto
T008 — Create CreateHistorialDto
```

### Phase 2 — Services in parallel (after Phase 1)

```
T009 — Create HistorialMesaService
T010 — Create MesasService
```

### Phase 7 — Final checks in parallel

```
T018 — Verify migration file
T019 — npx tsc --noEmit
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US6)

1. Complete Phase 1: Foundational (T001–T008)
2. Complete Phase 2 services: T009 + T010 in parallel, then T011 → T012 → T013
3. **STOP and VALIDATE**: MVP checkpoint — create, QR scan, list all working
4. Continue with US3 (tunnel FIFO view — verify only)
5. Continue with US4 (dar-de-baja + delete — verify only)
6. Continue with US5 (reactivar — verify only)
7. Continue with US7 (historial — verify only)
8. Phase 7: migration verify + tsc check

### Incremental Delivery

Each verify phase (T014–T017) confirms behavior already implemented in T010/T011. The code is written once; the verify phases are smoke tests to confirm each user story works end-to-end before marking it complete.

---

## Notes

- `[P]` tasks = different files, no incomplete dependencies — can be launched simultaneously
- `MesasService` and `HistorialMesaService` are plain `@Injectable()` — NO `BaseCrudTenantService`
- `MesasController` has `@Controller()` with NO prefix — all 10 routes are explicit full-path strings
- Route order in controller is a hard constraint: `mesas/qr/:codigoQr` before `mesas/:id`
- `codigo_qr = randomUUID()` — never from request body, never in CreateMesaDto
- PATCH ALLOWED = `new Set(['plantas_estimadas', 'activo'])` — 2 fields only
- `dar-de-baja` allowed from activa AND en_cosecha; only blocked from baja
- `reactivar` blocked from activa and en_cosecha; only allowed from baja
- `DELETE` blocked unless `estado === 'baja'`
- Historial writes inside transactions for `darDeBaja` and `reactivar` ensure atomicity
- Both `MesasService` AND `HistorialMesaService` exported — M09/M10/M11 depend on this
- Migration already exists at `migrations/1770900000000-MesasInit.ts` — VERIFY only (T018)
