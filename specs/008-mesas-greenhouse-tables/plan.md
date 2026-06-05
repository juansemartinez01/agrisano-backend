# Implementation Plan: M08 — Mesas (Greenhouse Tables)

**Branch**: `009-mesas-greenhouse-tables` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-mesas-greenhouse-tables/spec.md`

## Summary

Build the `mesas` module (`src/modules/mesas/`) that manages physical growing tables — the central tracking entity of the greenhouse system. Each table has a server-generated QR code, lives inside a tunnel at a FIFO position, and accumulates an immutable event history. Key design constraints: (1) `MesasService` is a plain `@Injectable()` (not extending `BaseCrudTenantService`) because creation requires an atomic transaction for FIFO position assignment; (2) `MesasController` uses `@Controller()` with no prefix — all routes are explicit full-path strings, matching the M06 `StockMovimientosController` pattern; (3) `HistorialMesaService` is a separate plain service exported for M09/M10/M11 injection; (4) `MesasService` is also exported so M10/M11 can update `posicion_actual` and `estado` during transplant/harvest flows.

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — two new tables (`mesas`, `historial_mesa`), two new ENUM types, two UNIQUE constraints (one partial), nine indexes

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Performance Goals**: QR lookup must return in < 1 s under normal connectivity; FIFO list query must be fast (index on `tunel_id, posicion_actual`)

**Constraints**:
- `MesasService` plain `@Injectable()` — no `BaseCrudTenantService` extension (custom transaction logic)
- `HistorialMesaService` plain `@Injectable()` — exported for M09/M10/M11 direct injection
- `MesasService` exported — M10/M11 need `updateMesaTunel()`/`updateMesaEstado()` access
- `MesasController` uses `@Controller()` (no prefix); all routes are explicit full-path strings
- `mesas/qr/:codigoQr` route MUST be declared before `mesas/:id` in controller
- `codigo_qr` generated server-side as `randomUUID()` — never from request body; globally unique
- PATCH guard: only `plantas_estimadas` and `activo` allowed — any other field → `MESA_FIELD_IMMUTABLE 400`
- `dar-de-baja` allowed from `activa` or `en_cosecha`; blocked from `baja` → `MESA_ESTADO_INVALIDO 409`
- `reactivar` allowed only from `baja`; blocked from `activa`/`en_cosecha` → `MESA_ESTADO_INVALIDO 409`
- `DELETE` allowed only if `estado = 'baja'` → `MESA_SOLO_BAJA_DELETE 409` otherwise
- `posicion_actual` MAX query + INSERT wrapped in a `QueryRunner` transaction
- No new npm packages; TypeScript strict, no `any`
- Do not modify any existing module; allowed exceptions: `src/common/errors/error-codes.ts`, `src/app.module.ts`

**Scale/Scope**: Module-level — single feature, ~12 source files + 1 migration

## Constitution Check

*GATE: All pass.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ Pass | Reuses `BaseEntity`, `AuditService`, `TenancyService`, `ok()`/`page()`, `AppError`/`ErrorCodes`, `JwtAuthGuard`/`RolesGuard`; custom service justified by transaction requirement |
| II. Multi-Tenancy | ✅ Pass | `tenant_id` auto-set from `tenantContext`; all queries scoped by `tenant_id`; `codigo_qr` global uniqueness is a documented exception (physical label) |
| III. Error Handling | ✅ Pass | `AppError` + `ErrorCodes` for all domain failures; 5 new domain codes |
| IV. Audit | ✅ Pass | 4 audit events (`mesa_created`, `mesa_dar_de_baja`, `mesa_reactivada`, `mesa_deleted`) via `AuditService.write()` |
| V. Roles | ✅ Pass | `JwtAuthGuard` + `RolesGuard` + `@Roles()` on all write/delete/action endpoints |
| VI. Transactions | ✅ Pass | FIFO position assignment (MAX query + INSERT) uses `QueryRunner` atomic transaction; `dar-de-baja`/`reactivar` + historial write executed in single transaction |
| VII. API Responses | ✅ Pass | All responses use `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | Strict TypeScript, class-validator DTOs, no `any` |
| IX. Modules | ✅ Pass | One module at `src/modules/mesas/`; no circular imports; `TunelesModule` and `EstablecimientosModule` imported as declared dependencies |
| X. Small Steps | ✅ Pass | Single module delivered in full before M09 |

## Project Structure

### Documentation (this feature)

```text
specs/008-mesas-greenhouse-tables/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── data-model.md        # Phase 1: entity schema, migration SQL
├── contracts/
│   └── api-spec.json    # Phase 1: OpenAPI 3.0 contract for all 10 endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
src/
├── common/
│   └── errors/
│       └── error-codes.ts              ← MODIFY: add 5 mesas error codes
├── app.module.ts                       ← MODIFY: add MesasModule import
└── modules/
    └── mesas/
        ├── entities/
        │   ├── mesa.entity.ts          ← CREATE
        │   └── historial-mesa.entity.ts← CREATE
        ├── dto/
        │   ├── create-mesa.dto.ts      ← CREATE
        │   ├── update-mesa.dto.ts      ← CREATE
        │   ├── query-mesas.dto.ts      ← CREATE
        │   ├── query-historial.dto.ts  ← CREATE
        │   └── create-historial.dto.ts ← CREATE (internal, for M09/M10/M11)
        ├── mesas.service.ts            ← CREATE (plain @Injectable(), no BaseCrudTenantService)
        ├── historial-mesa.service.ts   ← CREATE (plain @Injectable(), exported)
        ├── mesas.controller.ts         ← CREATE (@Controller() no prefix, explicit paths)
        └── mesas.module.ts             ← CREATE

migrations/
└── 1770900000000-MesasInit.ts          ← CREATED (delivered as part of plan)
```

## Complexity Tracking

| Justification | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `MesasService` does not extend `BaseCrudTenantService` | FIFO position assignment requires `QueryRunner` transaction wrapping both the MAX query and INSERT | `BaseCrudTenantService.create()` does not expose transaction context; wrapping externally would create race condition window |
| `HistorialMesaService` as separate service | M09/M10/M11 must write events without going through REST; separation keeps historial writes composable across modules | Embedding in `MesasService` would create circular imports when M09/M10 import MesasModule |

---

## Implementation Phases

### Phase 1: Schema & Error Codes

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append under a `// mesas` comment:
```typescript
// mesas
MESA_NOT_FOUND: 'MESA_NOT_FOUND',
MESA_QR_NOT_FOUND: 'MESA_QR_NOT_FOUND',
MESA_ESTADO_INVALIDO: 'MESA_ESTADO_INVALIDO',
MESA_FIELD_IMMUTABLE: 'MESA_FIELD_IMMUTABLE',
MESA_SOLO_BAJA_DELETE: 'MESA_SOLO_BAJA_DELETE',
```

#### Task 1.2 — Mesa entity

**File**: `src/modules/mesas/entities/mesa.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum MesaEstado {
  ACTIVA = 'activa',
  EN_COSECHA = 'en_cosecha',
  BAJA = 'baja',
}

@Entity('mesas')
export class Mesa extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'uuid' })
  tunel_id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  codigo_qr!: string;

  @Column({ type: 'int', nullable: true, default: null })
  posicion_actual!: number | null;

  @Column({
    type: 'enum',
    enum: MesaEstado,
    enumName: 'mesa_estado',
    default: MesaEstado.ACTIVA,
  })
  estado!: MesaEstado;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  fecha_ultimo_trasplante!: Date | null;

  @Column({ type: 'int', default: 450 })
  plantas_estimadas!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

> `unique: true` on `codigo_qr` drives the migration constraint — global uniqueness (not per tenant).

#### Task 1.3 — HistorialMesa entity

**File**: `src/modules/mesas/entities/historial-mesa.entity.ts`

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HistorialTipoEvento {
  TRASPLANTE = 'trasplante',
  COSECHA = 'cosecha',
  CAMBIO_POSICION = 'cambio_posicion',
  APLICACION_QUIMICA = 'aplicacion_quimica',
  REACTIVACION = 'reactivacion',
  BAJA = 'baja',
}

@Entity('historial_mesa')
export class HistorialMesa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  mesa_id!: string;

  @Column({
    type: 'enum',
    enum: HistorialTipoEvento,
    enumName: 'historial_tipo_evento',
  })
  tipo_evento!: HistorialTipoEvento;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'jsonb', nullable: true, default: null })
  detalle!: Record<string, unknown> | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
```

> No `deleted_at` — historial is immutable. Does NOT extend `BaseEntity`.

---

### Phase 2: DTOs

#### Task 2.1 — CreateMesaDto

**File**: `src/modules/mesas/dto/create-mesa.dto.ts`

Fields:
- `establecimiento_id: string` — `@IsUUID()` (required)
- `tunel_id: string` — `@IsUUID()` (required)
- `plantas_estimadas?: number` — `@IsOptional() @IsInt() @Min(1)` (entity defaults to 450)

> `codigo_qr`, `posicion_actual`, `estado` MUST NOT appear — generated server-side.

#### Task 2.2 — UpdateMesaDto

**File**: `src/modules/mesas/dto/update-mesa.dto.ts`

Fields:
- `plantas_estimadas?: number` — `@IsOptional() @IsInt() @Min(1)`
- `activo?: boolean` — `@IsOptional() @IsBoolean()`

> Strictly two fields only. PATCH guard enforces this at runtime too.

#### Task 2.3 — QueryMesasDto

**File**: `src/modules/mesas/dto/query-mesas.dto.ts`

Extends `PageQueryDto` from `src/common/query/page-query.dto`.

Fields:
- `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
- `tunel_id?: string` — `@IsOptional() @IsUUID()`
- `estado?: MesaEstado` — `@IsOptional() @IsEnum(MesaEstado)`
- `activo?: boolean` — `@IsOptional() @IsBoolean() @Transform(...)` coerce `'true'`/`'false'`
- `q?: string` — `@IsOptional() @IsString()` — ILIKE search on `codigo_qr`
- `sortBy?: string` — `@IsOptional() @IsString()`
- `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`

#### Task 2.4 — QueryHistorialDto

**File**: `src/modules/mesas/dto/query-historial.dto.ts`

Extends `PageQueryDto`.

Fields:
- `sortBy?: string` — `@IsOptional() @IsString()`
- `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`

#### Task 2.5 — CreateHistorialDto (internal)

**File**: `src/modules/mesas/dto/create-historial.dto.ts`

For M09/M10/M11 internal use via `HistorialMesaService.writeEvent()`:
- `mesa_id: string` — `@IsUUID()`
- `tipo_evento: HistorialTipoEvento` — `@IsEnum(HistorialTipoEvento)`
- `detalle?: Record<string, unknown>` — `@IsOptional() @IsObject()`
- `usuario_id: string` — `@IsUUID()`
- `tenant_id: string` — `@IsUUID()` (caller provides from tenantContext)

---

### Phase 3: Services

#### Task 3.1 — MesasService

**File**: `src/modules/mesas/mesas.service.ts`

**Class**: Plain `@Injectable()` (NO `BaseCrudTenantService` extension)

**Constructor injects**:
- `@InjectRepository(Mesa) mesaRepo: Repository<Mesa>`
- `dataSource: DataSource`
- `tunelesService: TunelesService`
- `estService: EstablecimientosService`
- `tenancy: TenancyService`
- `historialService: HistorialMesaService`
- `audit: AuditService`
- `logger: PinoLogger`

**Export `AUDIT` const**:
```typescript
export const AUDIT = {
  CREATED: 'mesa_created',
  DAR_DE_BAJA: 'mesa_dar_de_baja',
  REACTIVADA: 'mesa_reactivada',
  DELETED: 'mesa_deleted',
} as const;
```

**Method: `createMesa(dto, userId)`**:
1. `tenantId = this.tenancy.requireTenantId()`
2. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })`
3. `const tunel = await this.tunelesService.mustFindById(dto.tunel_id, { strictTenant: true })`; verify `tunel.establecimiento_id === dto.establecimiento_id`
4. `const codigoQr = randomUUID()`
5. Open `QueryRunner`, `connect()`, `startTransaction()`
6. In try/catch/finally:
   - `SELECT MAX(posicion_actual) FROM mesas WHERE tunel_id = $1 AND deleted_at IS NULL AND posicion_actual IS NOT NULL`
   - `newPos = (result[0].max ?? 0) + 1`
   - Insert mesa row with `{ tenant_id: tenantId, ...dto, codigo_qr: codigoQr, posicion_actual: newPos, estado: 'activa' }`
   - `commitTransaction()`, return inserted record
   - `catch`: `rollbackTransaction()`, rethrow
   - `finally`: `release()`
7. Write audit `mesa_created`

**Method: `listMesas(q, tenantId)`**:
- QB scoped to `tenant_id`; apply defined filters; `codigo_qr ILIKE` for `q.q`; default sort `created_at DESC`

**Method: `getMesaById(id, tenantId)`**:
- QB with LEFT JOIN on `tuneles` (alias `t`), selecting `t.nombre AS tunel_nombre`, `t.capacidad_maxima AS tunel_capacidad_maxima`
- Throw `MESA_NOT_FOUND 404` if absent

**Method: `getMesaByQr(codigoQr, tenantId)`**:
- Same QB pattern as `getMesaById` but `WHERE m.codigo_qr = :codigoQr`
- Throw `MESA_QR_NOT_FOUND 404` if absent

**Method: `getMesasByTunel(tunel_id, q, tenantId)`**:
- `await this.tunelesService.mustFindById(tunel_id, { strictTenant: true })`
- QB: `WHERE tunel_id = :tunel_id AND tenant_id = :tenantId AND posicion_actual IS NOT NULL AND deleted_at IS NULL ORDER BY posicion_actual ASC`

**Method: `updateMesa(id, dto, tenantId)`**:
1. Load mesa or throw `MESA_NOT_FOUND 404`
2. `await this.mesaRepo.update({ id, tenant_id: tenantId }, dto)`
3. Return updated record

**Method: `darDeBaja(id, userId, tenantId)`**:
1. Load mesa or throw `MESA_NOT_FOUND 404`
2. If `mesa.estado === MesaEstado.BAJA` → throw `MESA_ESTADO_INVALIDO 409`
3. `QueryRunner` transaction:
   - `UPDATE mesas SET estado='baja', posicion_actual=NULL, updated_at=now() WHERE id=:id AND tenant_id=:tenantId`
   - `INSERT INTO historial_mesa (tenant_id, mesa_id, tipo_evento, usuario_id, fecha_hora) VALUES (..., 'baja', ...)`
   - Commit
4. Write audit `mesa_dar_de_baja`

**Method: `reactivar(id, userId, tenantId)`**:
1. Load mesa or throw `MESA_NOT_FOUND 404`
2. If `mesa.estado !== MesaEstado.BAJA` → throw `MESA_ESTADO_INVALIDO 409`
3. `QueryRunner` transaction:
   - `UPDATE mesas SET estado='activa', posicion_actual=NULL, updated_at=now() WHERE id=:id AND tenant_id=:tenantId`
   - `INSERT INTO historial_mesa (tenant_id, mesa_id, tipo_evento, usuario_id, fecha_hora) VALUES (..., 'reactivacion', ...)`
   - Commit
4. Write audit `mesa_reactivada`

**Method: `deleteMesa(id, tenantId)`**:
1. Load mesa or throw `MESA_NOT_FOUND 404`
2. If `mesa.estado !== MesaEstado.BAJA` → throw `MESA_SOLO_BAJA_DELETE 409`
3. `await this.mesaRepo.softDelete({ id, tenant_id: tenantId })`
4. Write audit `mesa_deleted`

**Methods exposed for M10/M11**:
```typescript
async updateMesaTunel(
  id: string,
  tunel_id: string,
  posicion_actual: number,
  fecha_ultimo_trasplante: Date,
  tenantId: string,
): Promise<void>

async updateMesaEstado(
  id: string,
  estado: MesaEstado,
  posicion_actual: number | null,
  tenantId: string,
): Promise<void>
```

#### Task 3.2 — HistorialMesaService

**File**: `src/modules/mesas/historial-mesa.service.ts`

**Class**: Plain `@Injectable()`

**Constructor injects**: `@InjectRepository(HistorialMesa) historialRepo`, `TenancyService`

**Method: `writeEvent(data: { mesa_id, tipo_evento, detalle?, usuario_id, tenant_id })`**:
- `await this.historialRepo.save({ ...data, fecha_hora: new Date() })`
- No internal transaction — caller wraps when atomicity needed

**Method: `listByMesa(mesa_id, q, tenantId)`**:
- QB: `WHERE h.mesa_id = :mesa_id AND h.tenant_id = :tenantId`
- Default sort: `fecha_hora DESC`
- Returns `{ items, total }` for `page()`

---

### Phase 4: Controller & Module

#### Task 4.1 — MesasController

**File**: `src/modules/mesas/mesas.controller.ts`

**Class-level**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()` (NO prefix)

**Route declaration order (CRITICAL)**:

| Order | Decorator | Route | Role Guard | Returns |
|---|---|---|---|---|
| 1 | `@Get` | `'mesas'` | none | `page(items, p, limit, total)` |
| 2 | `@Get` | `'mesas/qr/:codigoQr'` | none | `ok(mesa)` |
| 3 | `@Get` | `'mesas/:id'` | none | `ok(mesa)` |
| 4 | `@Post` `@HttpCode(201)` | `'mesas'` | `supervisor, admin_global` | `ok(mesa)` + audit |
| 5 | `@Patch` | `'mesas/:id'` | `supervisor, admin_global` | `ok(mesa)` + PATCH guard |
| 6 | `@Delete` | `'mesas/:id'` | `admin_global` | `ok({ deleted: true })` + audit |
| 7 | `@Post` `@HttpCode(200)` | `'mesas/:id/dar-de-baja'` | `supervisor, admin_global` | `ok(mesa)` + audit |
| 8 | `@Post` `@HttpCode(200)` | `'mesas/:id/reactivar'` | `supervisor, admin_global` | `ok(mesa)` + audit |
| 9 | `@Get` | `'mesas/:id/historial'` | none | `page(items, p, limit, total)` |
| 10 | `@Get` | `'tuneles/:tunel_id/mesas'` | none | `page(items, p, limit, total)` |

**PATCH immutable guard** (first lines in handler):
```typescript
const ALLOWED = new Set(['plantas_estimadas', 'activo']);
const body = req.body as Record<string, unknown>;
if (Object.keys(body ?? {}).some((k) => !ALLOWED.has(k))) {
  throw new AppError({
    code: ErrorCodes.MESA_FIELD_IMMUTABLE,
    message: 'Solo se pueden modificar plantas_estimadas y activo',
    status: 400,
  });
}
```

**Audit pattern**: identical to `StockMovimientosController` — `auditLogPayload()` + `this.audit.write('admin', ...)`

**`AuthRequest` type** (declare locally):
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

#### Task 4.2 — MesasModule

**File**: `src/modules/mesas/mesas.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Mesa, HistorialMesa]),
    TenancyModule,
    AuditModule,
    TunelesModule,
    EstablecimientosModule,
  ],
  providers: [MesasService, HistorialMesaService],
  controllers: [MesasController],
  exports: [MesasService, HistorialMesaService],
})
export class MesasModule {}
```

> Both services exported:
> - `MesasService` → M10, M11 for state/position updates
> - `HistorialMesaService` → M09, M10, M11 for `writeEvent()`

#### Task 4.3 — Register in AppModule

Add to `src/app.module.ts` after `TunelesModule`:
```typescript
import { MesasModule } from './modules/mesas/mesas.module';
// ...
MesasModule,
```

---

### Phase 5: Migration

**File**: `migrations/1770900000000-MesasInit.ts` — **already created** as part of this plan.

See [data-model.md](data-model.md) for full SQL. Key highlights:
- Two ENUM types created before tables
- `mesas` table; `codigo_qr` globally unique via `UNIQUE CONSTRAINT`
- Partial unique index `UQ_mesas_tunel_posicion` on `(tunel_id, posicion_actual) WHERE posicion_actual IS NOT NULL`
- `historial_mesa` table (no `deleted_at`)
- 9 indexes total; `down()` drops in reverse dependency order

---

### Phase 6: Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run migration:run` — both tables, ENUMs, all indexes created
3. Manual smoke tests:
   - `POST /mesas` as supervisor with valid tunnel + establishment → 201; `codigo_qr` is UUID; `posicion_actual = 1`
   - `POST /mesas` in same tunnel again → 201; `posicion_actual = 2`
   - `POST /mesas` as operario → 403
   - `GET /mesas/qr/:codigoQr` → returns mesa + nested tunel `{ nombre, capacidad_maxima }`
   - `GET /mesas/qr/nonexistent-uuid` → 404 `MESA_QR_NOT_FOUND`
   - `GET /mesas/:id` → returns mesa + nested tunel info
   - `GET /tuneles/:tunel_id/mesas` → ordered by `posicion_actual ASC`; NULL positions excluded
   - `PATCH /mesas/:id` with `{ plantas_estimadas: 500 }` → 200 updated
   - `PATCH /mesas/:id` with `{ estado: 'baja' }` → 400 `MESA_FIELD_IMMUTABLE`
   - `PATCH /mesas/:id` with `{ tunel_id: '...' }` → 400 `MESA_FIELD_IMMUTABLE`
   - `POST /mesas/:id/dar-de-baja` (activa) → 200; `estado='baja'`; `posicion_actual=NULL`; historial entry created
   - `POST /mesas/:id/dar-de-baja` (en_cosecha) → 200; same result
   - `POST /mesas/:id/dar-de-baja` (already baja) → 409 `MESA_ESTADO_INVALIDO`
   - `POST /mesas/:id/reactivar` (baja) → 200; `estado='activa'`; `posicion_actual=NULL`; historial entry
   - `POST /mesas/:id/reactivar` (activa) → 409 `MESA_ESTADO_INVALIDO`
   - Reactivated mesa NOT in `GET /tuneles/:id/mesas` list
   - `DELETE /mesas/:id` (baja) as admin_global → 200; audit record
   - `DELETE /mesas/:id` (activa) as admin_global → 409 `MESA_SOLO_BAJA_DELETE`
   - `DELETE /mesas/:id` as supervisor → 403
   - `GET /mesas/:id/historial` → paginated list of events with all required fields
   - Concurrent `POST /mesas` to same tunnel → unique positions assigned; no duplicates

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Service base class | Plain `@Injectable()` (no `BaseCrudTenantService`) | FIFO creation requires `QueryRunner` transaction; base class `create()` doesn't expose transaction context |
| Controller prefix | `@Controller()` — no prefix, explicit full paths | Matches M06 `StockMovimientosController` pattern; needed for `GET /tuneles/:tunel_id/mesas` cross-resource route |
| `qr` route order | `mesas/qr/:codigoQr` declared before `mesas/:id` | NestJS matches routes in declaration order; literal `qr` segment must win over `:id` wildcard — clarification Q1 |
| `HistorialMesaService` separation | Separate service, exported | Avoids circular imports when M09/M10/M11 import `MesasModule`; keeps event writes composable |
| `MesasService` exported | Yes | M10/M11 transplant/harvest flows need `updateMesaTunel`/`updateMesaEstado` without HTTP |
| `dar-de-baja` allowed states | `activa` AND `en_cosecha` → `baja` | Confirmed clarification Q2; a table in mid-harvest can be decommissioned |
| `reactivar` allowed states | Only `baja` → `activa` | Confirmed Q5; `posicion_actual=NULL` until M10 transplant assigns new position |
| `DELETE` guard | Only if `estado='baja'` | Hard business rule; soft-delete only for fully decommissioned tables |
| PATCH guard | Runtime key check → `MESA_FIELD_IMMUTABLE 400` | Belt-and-suspenders on top of DTO typing; confirmed Q4 |
| `codigo_qr` format | `randomUUID()` — plain UUID v4, no prefix | Confirmed Q3; URL-safe for QR content; global DB constraint enforces uniqueness |
| FIFO position atomicity | `QueryRunner` transaction wrapping MAX query + INSERT | Confirmed Q7; prevents concurrent creation assigning same position |
| Historial writes in state transitions | Same `QueryRunner` transaction as state UPDATE | Guarantees historial always reflects actual state; no partial state-without-record |
| `historial_tipo_evento` = `'baja'` written by M08 | M08 owns `dar-de-baja` action | Even though historial is generally written by M09/M10/M11, baja/reactivacion events originate in M08 |
