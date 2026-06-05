# Tasks: M06 — Stock Movimientos (Chemical Stock Movements)

**Input**: Design documents from `/specs/006-stock-movimientos/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not included (not requested in spec).

**Organization**: Tasks grouped by user story. Phase 1 is foundational (blocks everything). Phase 2 covers US1+US2 (write path, MVP). Phase 3 covers US3+US4 (read path). Phase 4 is migration verification and final smoke tests.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Maps to user story in spec.md (US1–US4)
- All paths are relative to repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure required by ALL user stories. Nothing else starts until T001–T004 are done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 MODIFY `src/common/errors/error-codes.ts` — add two stock-movimientos domain error codes
  - **Implements**: plan.md § Error Codes to Add
  - **Add** under a `// stock movimientos` comment after the existing `// quimicos` block:
    ```typescript
    // stock movimientos
    MOVIMIENTO_NOT_FOUND: 'MOVIMIENTO_NOT_FOUND',
    MOVIMIENTO_CANTIDAD_INVALIDA: 'MOVIMIENTO_CANTIDAD_INVALIDA',
    ```
  - **Acceptance**: `grep "MOVIMIENTO_NOT_FOUND" src/common/errors/error-codes.ts` returns a match; both codes present; `npx tsc --noEmit` still passes

- [x] T002 [P] CREATE `src/modules/stock-movimientos/entities/movimiento-stock.entity.ts` — MovimientoStock plain entity
  - **Implements**: plan.md § Entity: MovimientoStock; data-model.md § MovimientoStock
  - **⚠️ DO NOT extend `BaseEntity`** — plain entity; no `deleted_at`; columns defined explicitly
  - **Decorator**: `@Entity('movimientos_stock')`
  - **Imports** from `typeorm`: `Entity`, `PrimaryGeneratedColumn`, `Column`, `CreateDateColumn`, `UpdateDateColumn`
  - **Columns**:
    - `id`: `@PrimaryGeneratedColumn('uuid')`
    - `tenant_id`: `@Column({ type: 'uuid', nullable: true })`
    - `quimico_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `establecimiento_id`: `@Column({ type: 'uuid' })` — NOT NULL; denormalized from quimico
    - `tipo`: `@Column({ type: 'enum', enum: MovimientoTipo })` — NOT NULL; enum defined in same file
    - `cantidad`: `@Column({ type: 'decimal', precision: 10, scale: 3 })` — NOT NULL
    - `unidad_medida`: `@Column({ type: 'varchar', length: 30 })` — NOT NULL; copied from quimico
    - `numero_remito`: `@Column({ type: 'varchar', length: 100, nullable: true, default: null })`
    - `observaciones`: `@Column({ type: 'text', nullable: true, default: null })`
    - `usuario_id`: `@Column({ type: 'uuid' })` — NOT NULL
    - `fecha`: `@Column({ type: 'date' })` — NOT NULL
    - `created_at`: `@CreateDateColumn({ type: 'timestamptz' })`
    - `updated_at`: `@UpdateDateColumn({ type: 'timestamptz' })`
  - **Define enum** in the same file (above the class):
    ```typescript
    export enum MovimientoTipo {
      INGRESO = 'ingreso',
      EGRESO_MANUAL = 'egreso_manual',
    }
    ```
  - **⚠️ NO `deleted_at`** — movements are immutable and append-only; BaseEntity includes deleted_at so we do NOT extend it
  - **⚠️ NO FK decorators** — FK constraint lives in migration only (same pattern as other entities)
  - **Acceptance**: File exports `MovimientoStock` and `MovimientoTipo`; no `deleted_at`; no `extends BaseEntity`; `id` uses `@PrimaryGeneratedColumn('uuid')`; all 13 columns present; `npx tsc --noEmit` passes

- [x] T003 [P] CREATE `src/modules/stock-movimientos/dto/create-movimiento.dto.ts` — create DTO
  - **Implements**: plan.md § Files to Create #2; data-model.md § Validation Rules
  - **Fields**:
    - `quimico_id: string` — `@IsUUID()` (required)
    - `tipo: MovimientoTipo` — `@IsEnum(MovimientoTipo)` (required); import `MovimientoTipo` from entity file
    - `cantidad: number` — `@IsNumber() @Min(0.001)` (required; must be > 0; use 0.001 as the smallest valid decimal(10,3) value)
    - `numero_remito?: string` — `@IsOptional() @IsString() @MaxLength(100)` (optional)
    - `observaciones?: string` — `@IsOptional() @IsString()` (optional)
    - `fecha?: string` — `@IsOptional() @IsDateString()` (optional; defaults to today in service)
  - **⚠️ `unidad_medida` MUST NOT appear in this DTO** — always copied from quimico (silent ignore)
  - **⚠️ `establecimiento_id` MUST NOT appear in this DTO** — always copied from quimico (silent ignore)
  - **⚠️ `usuario_id` MUST NOT appear in this DTO** — always from JWT req.user.sub
  - **Import** `@Type(() => Number)` from `class-transformer` for `cantidad` numeric coercion from query string if needed
  - **Acceptance**: DTO exported; 3 required fields (`quimico_id`, `tipo`, `cantidad`); `cantidad` min 0.001; no `unidad_medida`, no `establecimiento_id`, no `usuario_id`; `npx tsc --noEmit` passes

- [x] T004 [P] CREATE `src/modules/stock-movimientos/dto/query-movimientos.dto.ts` — list/filter query DTO
  - **Implements**: plan.md § Files to Create #3; data-model.md § Query Filters
  - **Extend** `PageQueryDto` from `src/common/query/page-query.dto`
  - **Fields**:
    - `quimico_id?: string` — `@IsOptional() @IsUUID()`
    - `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
    - `tipo?: MovimientoTipo` — `@IsOptional() @IsEnum(MovimientoTipo)`
    - `fecha_desde?: string` — `@IsOptional() @IsDateString()` — inclusive lower bound
    - `fecha_hasta?: string` — `@IsOptional() @IsDateString()` — inclusive upper bound
    - `sortBy?: string` — `@IsOptional() @IsString()`
    - `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`
  - **⚠️ NO defaults on any filter** — when no filters provided, all tenant movements returned (spec FR-014)
  - **Acceptance**: DTO exported; extends `PageQueryDto`; no defaults on filter fields; all fields optional; `npx tsc --noEmit` passes

**Checkpoint**: T001–T004 done. `npx tsc --noEmit` passes. No user story work until this checkpoint clears.

---

## Phase 2: User Story 1 + 2 — Register Stock Ingreso and Egreso (Priority: P1) 🎯 MVP

**Goal (US1)**: supervisor/admin_global can POST an ingreso movement; stock_actual increases atomically; response includes movement + updated stock; audit written.
**Goal (US2)**: supervisor/admin_global can POST an egreso_manual; stock_actual decreases atomically; if result would be negative, response includes `warning: 'Stock resultante negativo'` (movement still saved); audit written.

**Independent Test (US1)**: POST `/stock-movimientos` as supervisor with `tipo: 'ingreso'`, valid quimico_id, valid cantidad → 201 with `{ movimiento, quimico_stock_actual }`, no `warning` key. Verify quimico `stock_actual` increased. POST as operario → 403. POST with cross-tenant quimico_id → 404.
**Independent Test (US2)**: POST `/stock-movimientos` with `tipo: 'egreso_manual'`, cantidad > stock_actual → 201 with `{ movimiento, quimico_stock_actual, warning: 'Stock resultante negativo' }`. Verify `warning` key is present. POST with cantidad ≤ stock_actual → 201 with no `warning` key. Verify stock decreased in both cases.

### Implementation for User Story 1 + 2

- [x] T005 [US1] CREATE `src/modules/stock-movimientos/stock-movimientos.service.ts` — complete StockMovimientosService
  - **Implements**: plan.md § Service: StockMovimientosService; research.md Decisions 2, 3, 4
  - **⚠️ CRITICAL**: Plain `@Injectable()` — DO NOT extend `BaseCrudTenantService` or any base class
  - **Export `AUDIT` const** at the top of the file:
    ```typescript
    export const AUDIT = {
      INGRESO: 'stock_movimiento_ingreso',
      EGRESO_MANUAL: 'stock_movimiento_egreso_manual',
    } as const;
    ```
  - **Constructor** — inject:
    - `private readonly dataSource: DataSource`
    - `@InjectRepository(MovimientoStock) private readonly repo: Repository<MovimientoStock>`
    - `private readonly quimicosService: QuimicosService`
    - `private readonly tenancy: TenancyService`
  - **Implement `createMovimiento(dto: CreateMovimientoDto, userId: string)`** (US1 + US2):
    1. `const tenantId = this.tenancy.requireTenantId()` — throws if no tenant context
    2. `const quimico = await this.quimicosService.mustFindById(dto.quimico_id, { strictTenant: true })` — throws `QUIMICO_NOT_FOUND` 404 if not in tenant
    3. Compute delta and projected stock **before opening transaction** (pre-commit evaluation):
       ```typescript
       const delta = dto.tipo === MovimientoTipo.INGRESO ? Number(dto.cantidad) : -Number(dto.cantidad);
       const projectedStock = Number(quimico.stock_actual) + delta;
       const warning = projectedStock < 0 ? 'Stock resultante negativo' : undefined;
       ```
    4. Open QueryRunner transaction (same pattern as M03 SiembraService.createSiembra):
       ```typescript
       const qr = this.dataSource.createQueryRunner();
       await qr.connect();
       await qr.startTransaction();
       try {
         const today = new Date().toISOString().split('T')[0];
         const movimiento = qr.manager.create(MovimientoStock, {
           tenant_id: tenantId,
           quimico_id: dto.quimico_id,
           tipo: dto.tipo,
           cantidad: dto.cantidad,
           unidad_medida: quimico.unidad_medida,          // ← from quimico, NEVER from dto
           establecimiento_id: quimico.establecimiento_id, // ← from quimico, NEVER from dto
           usuario_id: userId,
           fecha: dto.fecha ?? today,
           numero_remito: dto.numero_remito ?? null,
           observaciones: dto.observaciones ?? null,
         });
         const saved = await qr.manager.save(MovimientoStock, movimiento);
         // Atomic SQL — use $1 delta (not projectedStock) so concurrent ops are safe
         await qr.manager.query(
           `UPDATE quimicos SET stock_actual = stock_actual + $1 WHERE id = $2`,
           [delta, dto.quimico_id],
         );
         await qr.commitTransaction();
         return { movimiento: saved, quimico_stock_actual: projectedStock, warning };
       } catch (err) {
         await qr.rollbackTransaction();
         throw err;
       } finally {
         await qr.release();
       }
       ```
    - **⚠️ CRITICAL**: The UPDATE uses `stock_actual = stock_actual + $1` (atomic SQL), NOT `stock_actual = $1` (JS-calculated value) — this prevents race conditions
    - **⚠️ CRITICAL**: `warning` is `undefined` when stock is sufficient — NOT `null` or empty string
    - Return type: `{ movimiento: MovimientoStock; quimico_stock_actual: number; warning?: string }`
  - **Implement `listMovimientos(q: QueryMovimientosDto)`** (US3):
    ```typescript
    async listMovimientos(q: QueryMovimientosDto): Promise<{ items: MovimientoStock[]; total: number }> {
      const tenantId = this.tenancy.requireTenantId();
      const { page, limit, skip } = clampPagination(q.page, q.limit, 200);
      const SORT_ALLOWED = ['fecha', 'created_at'];
      const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'fecha';
      const sortOrder = q.sortOrder ?? 'DESC';
      const qb = this.repo
        .createQueryBuilder('m')
        .where('m.tenant_id = :tenantId', { tenantId });
      if (q.quimico_id) qb.andWhere('m.quimico_id = :qid', { qid: q.quimico_id });
      if (q.establecimiento_id) qb.andWhere('m.establecimiento_id = :eid', { eid: q.establecimiento_id });
      if (q.tipo) qb.andWhere('m.tipo = :tipo', { tipo: q.tipo });
      if (q.fecha_desde) qb.andWhere('m.fecha >= :desde', { desde: q.fecha_desde });
      if (q.fecha_hasta) qb.andWhere('m.fecha <= :hasta', { hasta: q.fecha_hasta });
      qb.orderBy(`m.${sortBy}`, sortOrder).skip(skip).take(limit);
      const [items, total] = await qb.getManyAndCount();
      return { items, total };
    }
    ```
  - **Implement `getMovimiento(id: string)`** (US3):
    ```typescript
    async getMovimiento(id: string): Promise<MovimientoStock> {
      const tenantId = this.tenancy.requireTenantId();
      const m = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
      if (!m) {
        throw new AppError({ code: ErrorCodes.MOVIMIENTO_NOT_FOUND, message: 'Movimiento no encontrado', status: 404 });
      }
      return m;
    }
    ```
  - **Implement `listByQuimico(quimicoId: string, q: QueryMovimientosDto)`** (US4):
    ```typescript
    async listByQuimico(quimicoId: string, q: QueryMovimientosDto): Promise<{ items: MovimientoStock[]; total: number }> {
      await this.quimicosService.mustFindById(quimicoId, { strictTenant: true });
      return this.listMovimientos({ ...q, quimico_id: quimicoId });
    }
    ```
  - **Import** `clampPagination` from `src/common/query/query-utils`
  - **Acceptance**: Service compiles; `createMovimiento` with ingreso → stock_actual increases by delta (not projectedStock assigned directly); egreso with cantidad > stock → returns `warning: 'Stock resultante negativo'`; egreso with cantidad ≤ stock → no `warning` key in return value; rollback on error; no `any` types

- [x] T006 [US1] CREATE `src/modules/stock-movimientos/stock-movimientos.controller.ts` — complete controller with all 4 routes
  - **Implements**: plan.md § Controller: StockMovimientosController; spec.md US1–US4; research.md Decision 5
  - **⚠️ CRITICAL**: `@Controller()` with NO path prefix — each handler carries its full explicit route string
  - **Class decorators**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()`
  - **Constructor**: inject `StockMovimientosService`, `AuditService`, `PinoLogger`
  - **Declare `AuthRequest` type** locally (same pattern as other controllers):
    ```typescript
    interface AuthRequest extends Request {
      user?: { sub: string; email: string };
      tenantId?: string;
      id?: string;
    }
    ```
  - **Route 1 — `@Post('stock-movimientos')`** — `@Roles('supervisor', 'admin_global')` + `@HttpCode(HttpStatus.CREATED)`:
    1. `const userId = req.user?.sub` — from JWT
    2. `const result = await this.svc.createMovimiento(dto, userId)` — `dto` is `@Body() dto: CreateMovimientoDto`
    3. Write audit:
       ```typescript
       const action = dto.tipo === MovimientoTipo.INGRESO ? AUDIT.INGRESO : AUDIT.EGRESO_MANUAL;
       const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, actorEmail: req.user?.email, action, entity: 'movimiento_stock', extra: { movimientoId: result.movimiento.id, quimicoId: dto.quimico_id, tipo: dto.tipo, cantidad: dto.cantidad } });
       this.logger.info(payload, 'admin_audit');
       await this.audit.write('admin', { request_id: req.id, method: req.method, path: req.url, status_code: 201, actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null, action, entity: 'movimiento_stock', tenant_id: req.tenantId ?? null, payload });
       ```
    4. Return `ok({ movimiento: result.movimiento, quimico_stock_actual: result.quimico_stock_actual, ...(result.warning !== undefined && { warning: result.warning }) })`
    - **⚠️ CRITICAL**: Use spread `...(result.warning !== undefined && { warning: result.warning })` to OMIT the `warning` key entirely when undefined — do NOT set it to `null`
  - **Route 2 — `@Get('stock-movimientos')`** — no `@Roles` (all authenticated):
    1. `const { page, limit, ...rest } = q` — `q` is `@Query() q: QueryMovimientosDto`
    2. `const { page: p, limit: lim } = clampPagination(q.page, q.limit, 200)`
    3. `const { items, total } = await this.svc.listMovimientos(q)`
    4. Return `page(items, p, lim, total)`
  - **Route 3 — `@Get('stock-movimientos/:id')`** — no `@Roles` (all authenticated):
    1. `const m = await this.svc.getMovimiento(id)` — `id` is `@Param('id')` string
    2. Return `ok(m)`
  - **Route 4 — `@Get('quimicos/:quimicoId/movimientos')`** — no `@Roles` (all authenticated):
    - **⚠️ CRITICAL**: This route is in StockMovimientosController, NOT QuimicosController
    1. `const { page: p, limit: lim } = clampPagination(q.page, q.limit, 200)`
    2. `const { items, total } = await this.svc.listByQuimico(quimicoId, q)` — `quimicoId` is `@Param('quimicoId')`, `q` is `@Query() q: QueryMovimientosDto`
    3. Return `page(items, p, lim, total)`
  - **⚠️ NO update or delete routes** — movements are immutable; any PUT/PATCH/DELETE would be a bug
  - **Import** `clampPagination` from `src/common/query/query-utils`; `AUDIT`, `MovimientoTipo` from their respective files
  - **Acceptance**: Controller compiles; POST as operario → 403; POST as supervisor with valid quimico → 201; `warning` key absent in response when egreso would NOT go negative; `warning: 'Stock resultante negativo'` present when egreso WOULD go negative; no PATCH or DELETE routes; all responses use `ok()`/`page()`; `npx tsc --noEmit` passes

- [x] T007 [US1] CREATE `src/modules/stock-movimientos/stock-movimientos.module.ts` — module wiring
  - **Implements**: plan.md § Module: StockMovimientosModule
  - ```typescript
    @Module({
      imports: [
        TypeOrmModule.forFeature([MovimientoStock]),
        TenancyModule,
        AuditModule,
        QuimicosModule,
      ],
      providers: [StockMovimientosService],
      controllers: [StockMovimientosController],
    })
    export class StockMovimientosModule {}
    ```
  - **⚠️ `QuimicosModule` MUST be imported** — provides `QuimicosService` injected into `StockMovimientosService`
  - **⚠️ Nothing exported** — no other module needs StockMovimientosService yet (M08 will import this module when built)
  - **Acceptance**: Module compiles; no circular dependency errors; `QuimicosModule` in imports; `MovimientoStock` registered in `TypeOrmModule.forFeature([...])`

- [x] T008 [US1] MODIFY `src/app.module.ts` — register StockMovimientosModule
  - **Implements**: plan.md § app.module.ts Change
  - **Add** `import { StockMovimientosModule } from './modules/stock-movimientos/stock-movimientos.module'` at top
  - **Add** `StockMovimientosModule` to `imports` array after `QuimicosModule`
  - **Acceptance**: `npx tsc --noEmit` passes; `npm run start:dev` starts without error; all stock-movimientos and quimicos/movimientos endpoints registered

**✅ MVP Checkpoint (after T008)**: US1 + US2 write path fully working:
- POST `/stock-movimientos` as supervisor with `tipo: 'ingreso'` → 201 `{ movimiento, quimico_stock_actual }` — no `warning` key
- POST `/stock-movimientos` with `tipo: 'egreso_manual'`, cantidad ≤ stock → 201, no `warning` key
- POST `/stock-movimientos` with `tipo: 'egreso_manual'`, cantidad > stock → 201 `{ movimiento, quimico_stock_actual, warning: 'Stock resultante negativo' }`
- Verify `quimicos.stock_actual` updated correctly in DB for both tipos
- Verify `unidad_medida` and `establecimiento_id` in saved movement match the quimico record (not request body)
- POST as operario → 403
- POST with cross-tenant quimico_id → 404
- Audit events `stock_movimiento_ingreso` / `stock_movimiento_egreso_manual` written
- `npx tsc --noEmit` passes

---

## Phase 3: User Story 3 + 4 — Browse Stock Movements (Priority: P2)

**Goal (US3)**: Any authenticated user can list movements with filters and pagination, or retrieve a single movement by ID.
**Goal (US4)**: Any authenticated user can list all movements for a specific chemical via the convenience endpoint.

**Independent Test (US3)**: GET `/stock-movimientos` (no filters, authenticated) → 200 paginated list. GET `?quimico_id=X` → filtered. GET `?tipo=ingreso` → filtered. GET `?fecha_desde=2026-01-01&fecha_hasta=2026-12-31` → date-range filtered. GET `/stock-movimientos/:id` (valid id) → 200 movement. GET `/stock-movimientos/:id` (wrong-tenant id) → 404. GET unauthenticated → 401.
**Independent Test (US4)**: GET `/quimicos/:id/movimientos` → 200 paginated list for that quimico only. GET with cross-tenant quimicoId → 404.

### Implementation for User Story 3 + 4

- [x] T009 [US3] VERIFY `src/modules/stock-movimientos/stock-movimientos.service.ts` + `src/modules/stock-movimientos/stock-movimientos.controller.ts` — confirm read path behavior
  - **Implements**: spec.md US3 + US4 acceptance scenarios; plan.md § listMovimientos, getMovimiento, listByQuimico
  - **Verify service `listMovimientos(q)`**:
    - Returns all tenant movements when no filters provided (no default filter applied — spec FR-014)
    - `quimico_id` filter applied with `andWhere('m.quimico_id = :qid', ...)`
    - `tipo` filter applied with `andWhere('m.tipo = :tipo', ...)`
    - `fecha_desde` → `WHERE m.fecha >= :desde` (inclusive); `fecha_hasta` → `WHERE m.fecha <= :hasta` (inclusive)
    - Default sort: `fecha DESC` (when no `sortBy` provided)
    - `getManyAndCount()` used for pagination totals
  - **Verify service `getMovimiento(id)`**:
    - `findOne({ where: { id, tenant_id: tenantId } })` — both conditions applied
    - Wrong-tenant id (or non-existent id) → throws `AppError MOVIMIENTO_NOT_FOUND` 404
  - **Verify service `listByQuimico(quimicoId, q)`**:
    - Calls `quimicosService.mustFindById(quimicoId, { strictTenant: true })` first — cross-tenant → 404
    - Delegates to `listMovimientos({ ...q, quimico_id: quimicoId })` — same paginated/filterable result
  - **Verify controller** `@Get('stock-movimientos')` and `@Get('stock-movimientos/:id')`:
    - No `@Roles` — all authenticated users can access
    - GET list returns `page(items, p, lim, total)`; GET :id returns `ok(m)`
  - **Verify controller** `@Get('quimicos/:quimicoId/movimientos')`:
    - Route is in `StockMovimientosController`, NOT `QuimicosController`
    - No `@Roles` — all authenticated users can access
    - Returns `page(items, p, lim, total)`
  - **Acceptance**: GET `/stock-movimientos` (no filters) → 200 all tenant movements; GET `?quimico_id=X` → only X's movements; GET `?tipo=ingreso` → only ingresos; date range filters inclusive; GET `:id` cross-tenant → 404; GET `/quimicos/:id/movimientos` (valid quimico) → 200 same result as `?quimico_id=X`; cross-tenant quimicoId → 404; unauthenticated → 401

**Checkpoint**: US3 + US4 verified. All read endpoints working with correct tenant scoping and filters.

---

## Phase 4: Migration Verification & Final Smoke Tests

**Purpose**: Confirm migration integrity and run full compile + smoke tests.

- [ ] T010 VERIFY `migrations/1770700000000-StockMovimientosInit.ts` — confirm migration file exists and is correct
  - **Action**: VERIFY ONLY — file already exists (created in plan phase), do NOT recreate or modify
  - **Check**:
    - File exports class `StockMovimientosInit1770700000000 implements MigrationInterface`
    - `name = 'StockMovimientosInit1770700000000'`
    - `up()` creates enum type `movimiento_tipo` BEFORE the table (PostgreSQL requires enum to exist first)
    - `up()` creates table `movimientos_stock` with all 13 columns — no `deleted_at`
    - FK constraint `FK_movimientos_stock_quimico` references `quimicos(id)`
    - 5 indexes: `IDX_movimientos_stock_tenant_id`, `IDX_movimientos_stock_quimico_id`, `IDX_movimientos_stock_establecimiento_id`, `IDX_movimientos_stock_tipo`, `IDX_movimientos_stock_fecha`
    - `down()` drops all 5 indexes, then table, then enum type — in reverse order
    - Timestamp `1770700000000 > 1770600000000` (M05 quimicos)
  - **Acceptance**: File exists at correct path; `npx tsc --noEmit` includes it without errors; enum created before table in `up()`; no `deleted_at` in CREATE TABLE

- [ ] T011 [P] Run `npx tsc --noEmit` — full TypeScript compile check
  - **Command**: `npx tsc --noEmit` from repo root
  - **Acceptance**: Zero errors; all imports resolve; no `any` type issues; migration file included without errors

- [ ] T012 Run migration against local database
  - **Command**: `npm run migration:run` (check `package.json` for exact script name)
  - **Prerequisite**: T010 verified; local DB running with M01–M05 migrations applied
  - **Acceptance**: Migration runs without error; `movimiento_tipo` enum exists; `movimientos_stock` table exists with all columns; all 5 indexes present; no `deleted_at` column; running again does NOT fail (idempotent)

- [ ] T013 [P] Run eslint on stock-movimientos module
  - **Command**: `npx eslint src/modules/stock-movimientos/ --ext .ts` (after T008 complete)
  - **Acceptance**: Zero errors

- [ ] T014 Manual smoke tests — all paths
  - **Prerequisite**: T012 complete; server running (`npm run start:dev`)
  - **US1 tests (create ingreso)**:
    1. `POST /stock-movimientos` as supervisor, `tipo: 'ingreso'`, valid quimico_id, cantidad: 10.5 → **201** `{ movimiento: { tipo: 'ingreso', cantidad: '10.5', unidad_medida: <from quimico>, establecimiento_id: <from quimico>, usuario_id: <jwt sub>, fecha: <today> }, quimico_stock_actual: <increased>, no warning key }`
    2. Verify `quimicos.stock_actual` in DB increased by 10.5
    3. `POST /stock-movimientos` as supervisor, with `numero_remito: 'REM-001'` → **201** `numero_remito: 'REM-001'` present in movimiento
    4. `POST /stock-movimientos` without `fecha` → **201** `fecha` defaults to today
    5. `POST /stock-movimientos` as operario → **403**
    6. `POST /stock-movimientos` with cross-tenant quimico_id → **404**
    7. `POST /stock-movimientos` with `cantidad: 0` → **400** validation error
    8. `POST /stock-movimientos` with `cantidad: -1` → **400** validation error
  - **US2 tests (create egreso_manual)**:
    9. `POST /stock-movimientos`, `tipo: 'egreso_manual'`, cantidad ≤ current stock → **201** `{ movimiento, quimico_stock_actual }` — NO `warning` key at all
    10. `POST /stock-movimientos`, `tipo: 'egreso_manual'`, cantidad > current stock → **201** `{ movimiento, quimico_stock_actual, warning: 'Stock resultante negativo' }` — `warning` key present
    11. Verify `quimicos.stock_actual` decreased in both cases (and went negative for test 10)
    12. Verify audit event `stock_movimiento_egreso_manual` written to audit log
    13. `POST /stock-movimientos` body includes `unidad_medida: 'custom'`, `establecimiento_id: <any uuid>` → **201** — those body fields silently ignored; saved movement uses values from quimico record
  - **US3 tests (browse movements)**:
    14. `GET /stock-movimientos` (no filters, authenticated) → **200** paginated list of all tenant movements (default sort fecha DESC)
    15. `GET /stock-movimientos?quimico_id=X` → **200** only movements for quimico X
    16. `GET /stock-movimientos?tipo=ingreso` → **200** only ingresos
    17. `GET /stock-movimientos?fecha_desde=2026-01-01&fecha_hasta=2026-12-31` → **200** movements in range
    18. `GET /stock-movimientos/:id` (valid, same tenant) → **200** full movement record
    19. `GET /stock-movimientos/:id` (valid id, wrong tenant) → **404** `MOVIMIENTO_NOT_FOUND`
    20. `GET /stock-movimientos` (unauthenticated) → **401**
  - **US4 tests (per-quimico movements)**:
    21. `GET /quimicos/:id/movimientos` (valid quimico, authenticated) → **200** paginated movements for that quimico only
    22. `GET /quimicos/:id/movimientos` (cross-tenant quimico id) → **404**
    23. `GET /quimicos/:id/movimientos?tipo=ingreso` → **200** filtered to ingresos for that quimico
  - **Immutability tests**:
    24. `PUT /stock-movimientos/:id` (any verb other than GET) → **404** (no handler registered)
    25. `PATCH /stock-movimientos/:id` → **404**
    26. `DELETE /stock-movimientos/:id` → **404**
  - **Acceptance**: All 26 paths return expected status codes; `warning` key absent when stock sufficient; `warning: 'Stock resultante negativo'` present when stock insufficient; `unidad_medida` and `establecimiento_id` always from quimico record; audit events written; `npx tsc --noEmit` passes

**✅ Final Checkpoint (M06 Complete)**:
- `npx tsc --noEmit` passes with zero errors
- All 14 tasks checked
- All 26 smoke tests passing
- `warning` key correctly absent/present based on projected stock
- Atomic SQL `stock_actual = stock_actual + $1` confirmed (not JS assignment)
- `unidad_medida` and `establecimiento_id` sourced from quimico confirmed
- `usuario_id` sourced from JWT confirmed (never from body)
- No update or delete endpoints confirmed (404 on PUT/PATCH/DELETE)
- GET `/quimicos/:id/movimientos` in StockMovimientosController (not QuimicosController) confirmed
- No default filter on list endpoint confirmed
- Audit events `stock_movimiento_ingreso` + `stock_movimiento_egreso_manual` confirmed in log

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Foundational T001–T004)
  └──► Phase 2 (US1+US2 MVP T005–T008)
         └──► Phase 3 (US3+US4 verify T009)
                └──► Phase 4 (Migration & Verify T010–T014)
```

- **Foundational (T001–T004)**: T001 first (error codes), then T002–T004 in parallel (entity + DTOs)
- **US1+US2 (T005–T008)**: All T001–T004 must be done
  - T005 (service) first; T006 (controller) after T005; T007 (module) after T006; T008 (app.module) after T007
- **US3+US4 (T009)**: All T005–T008 must be done (verify only — no new files)
- **Migration & Verify (T010–T014)**: All code phases complete

### Within Each Phase

- Foundation: T001 first, then T002 [P] + T003 [P] + T004 [P] in parallel
- US1+US2: T005 → T006 → T007 → T008 (sequential — each depends on previous)
- US3+US4: T009 (verify — no new files, depends on T005–T008)
- Verify: T010 [P] + T011 [P] → T012 → T013 [P] + T014

---

## Parallel Opportunities

```bash
# Foundation parallel batch (after T001):
T002: Create MovimientoStock entity
T003: Create CreateMovimientoDto
T004: Create QueryMovimientosDto

# Final verify parallel batch (after T012):
T010: Verify migration file
T011: Run npx tsc --noEmit
# T013: eslint (after T008)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Write Path)

1. Complete Phase 1: Foundational (T001–T004)
2. Complete Phase 2: US1+US2 (T005–T008)
3. **STOP and VALIDATE**: POST creates movements atomically; ingreso increases stock; egreso_manual decreases stock; negative stock produces warning; audit written; tsc passes
4. Demo/deploy if ready

### Incremental Delivery

1. Foundation → US1+US2 → **demo supervisor registers stock ingresos and egresos** (MVP)
2. Verify US3+US4 (T009) → **confirm read endpoints and quimico convenience route**
3. Migration + verification (T010–T014) → **production ready**

---

## Notes

- `[P]` tasks touch different files — safe to work in parallel
- `[US#]` label maps each task to a spec.md user story for traceability
- US3+US4 (T009) is a **verify** task — code already written in T005–T006; no new files
- `MovimientoStock` is a plain entity — do NOT extend `BaseEntity`; no `deleted_at` column
- `StockMovimientosService` is plain `@Injectable()` — do NOT extend `BaseCrudTenantService`
- Controller uses `@Controller()` with NO prefix — all routes are explicit full path strings
- The atomic UPDATE uses `stock_actual = stock_actual + $1` (SQL delta), NOT `stock_actual = $1` (JS value) — critical for concurrency correctness
- `warning` key must be OMITTED (not null, not undefined key) when stock is sufficient — use spread: `...(warning !== undefined && { warning })`
- `unidad_medida` and `establecimiento_id` are NOT in `CreateMovimientoDto` — silence from DTO guarantees they are never read from body
- Migration (T010) already exists — **do NOT recreate it**
- `QuimicosModule` must be in `StockMovimientosModule` imports (not just providers) — it exports `QuimicosService`
- `fecha` defaults to today: `new Date().toISOString().split('T')[0]` — consistent with M03 createSiembra pattern
