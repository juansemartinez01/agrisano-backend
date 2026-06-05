# Implementation Plan: M07 — Tuneles (Greenhouse Tunnels)

**Branch**: `008-tuneles-module` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-tuneles/spec.md`

## Summary

Build the `tuneles` module (`src/modules/tuneles/`) that manages physical greenhouse tunnels scoped to an establishment. Each tunnel has a name (unique per tenant+establishment among non-deleted), a maximum table capacity (integer ≥ 1), and an active flag. The module adds one new table (`tuneles`) with a partial unique index on `(tenant_id, establecimiento_id, nombre)`, exposes 6 REST endpoints, and is **structurally identical to M04 Recetas**. Key constraints: (1) `establecimiento_id` immutable — PATCH guard rejects it with `TUNEL_FIELD_IMMUTABLE 400`; (2) no default `activo` filter on list; (3) soft-delete unconditional — no pre-delete mesa check; (4) `TunelesService` exported for M08 Mesas.

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — one new table (`tuneles`), partial unique index, no new ENUM type

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Performance Goals**: Standard REST; no special targets for this module

**Constraints**:
- `TunelesService` extends `BaseCrudTenantService<Tunel>` — no transaction complexity
- `establecimiento_id` immutable after creation — PATCH guard rejects it with `TUNEL_FIELD_IMMUTABLE 400`
- No default `activo` filter on `GET /tuneles` — all non-deleted returned unless caller passes `?activo`
- `capacidad_maxima` must be integer ≥ 1; validated in DTO with `@IsInt() @Min(1)`
- `tenant_id` NEVER from request body
- No new npm packages; TypeScript strict, no `any`
- Do not modify any existing module; allowed exceptions: `src/common/errors/error-codes.ts`, `src/app.module.ts`
- Export `TunelesService` — M08 Mesas will inject it

**Scale/Scope**: Module-level — single feature, ~8 source files + 1 migration

## Constitution Check

*GATE: All pass. No violations.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ Pass | Extends `BaseCrudTenantService`; reuses all shared infrastructure |
| II. Multi-Tenancy | ✅ Pass | `tenant_id` auto-set from `tenantContext`; partial index scoped per tenant+establishment |
| III. Error Handling | ✅ Pass | `AppError` + `ErrorCodes` for all domain failures; 3 new domain codes |
| IV. Audit | ✅ Pass | 3 audit events via `AuditService.write()` in controller |
| V. Roles | ✅ Pass | `JwtAuthGuard` + `RolesGuard` + `@Roles()` on all write/delete endpoints |
| VI. Transactions | ✅ Pass | No multi-step inventory flows; single-row inserts do not need explicit transactions |
| VII. API Responses | ✅ Pass | All responses use `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | Strict TypeScript, class-validator DTOs, typed service contracts |
| IX. Modules | ✅ Pass | One module at `src/modules/tuneles/`; no circular imports |
| X. Small Steps | ✅ Pass | Single module delivered in full before M08 |

## Project Structure

### Documentation (this feature)

```text
specs/007-tuneles/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── data-model.md        # Phase 1: entity schema, migration SQL
├── contracts/
│   └── api-spec.json    # Phase 1: OpenAPI 3.0 contract for all 6 endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
src/
├── common/
│   └── errors/
│       └── error-codes.ts              ← MODIFY: add 3 tuneles error codes
├── app.module.ts                       ← MODIFY: add TunelesModule import
└── modules/
    └── tuneles/
        ├── entities/
        │   └── tunel.entity.ts         ← CREATE
        ├── dto/
        │   ├── create-tunel.dto.ts     ← CREATE
        │   ├── update-tunel.dto.ts     ← CREATE (no establecimiento_id field)
        │   └── query-tuneles.dto.ts    ← CREATE
        ├── tuneles.service.ts          ← CREATE (extends BaseCrudTenantService<Tunel>)
        ├── tuneles.controller.ts       ← CREATE
        ├── admin-tuneles.controller.ts ← CREATE
        └── tuneles.module.ts           ← CREATE

migrations/
└── 1770800000000-TunelesInit.ts        ← CREATED (delivered as part of plan)
```

## Complexity Tracking

No constitution violations — table intentionally empty.

---

## Implementation Phases

### Phase 1: Schema & Error Codes

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append under a `// tuneles` comment:
```typescript
// tuneles
TUNEL_NOT_FOUND: 'TUNEL_NOT_FOUND',
TUNEL_NOMBRE_DUPLICADO: 'TUNEL_NOMBRE_DUPLICADO',
TUNEL_FIELD_IMMUTABLE: 'TUNEL_FIELD_IMMUTABLE',
```

#### Task 1.2 — Tunel entity

**File**: `src/modules/tuneles/entities/tunel.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('tuneles')
export class Tunel extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'int' })
  capacidad_maxima!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

> **No `@Unique` decorator** — uniqueness lives in the migration partial index only (same as M04).

---

### Phase 2: DTOs

#### Task 2.1 — CreateTunelDto

**File**: `src/modules/tuneles/dto/create-tunel.dto.ts`

Fields:
- `establecimiento_id: string` — `@IsUUID()` (required)
- `nombre: string` — `@IsString() @IsNotEmpty() @MaxLength(100)` (required)
- `capacidad_maxima: number` — `@IsInt() @Min(1)` (required)

#### Task 2.2 — UpdateTunelDto

**File**: `src/modules/tuneles/dto/update-tunel.dto.ts`

- `nombre?: string` — `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)`
- `capacidad_maxima?: number` — `@IsOptional() @IsInt() @Min(1)`
- `activo?: boolean` — `@IsOptional() @IsBoolean()`
- **`establecimiento_id` MUST NOT appear** — immutability enforced by controller PATCH guard

#### Task 2.3 — QueryTunelesDto

**File**: `src/modules/tuneles/dto/query-tuneles.dto.ts`

Extends `PageQueryDto` from `src/common/query/page-query.dto`.

Fields:
- `q?: string` — `@IsOptional() @IsString()` — ILIKE search on nombre
- `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
- `activo?: boolean` — `@IsOptional() @IsBoolean() @Transform(...)` — coerce `'true'`/`'false'` string; **NO default value** (FR-010)
- `sortBy?: string` — `@IsOptional() @IsString()`
- `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`

---

### Phase 3: Service

#### Task 3.1 — TunelesService

**File**: `src/modules/tuneles/tuneles.service.ts`

**Class**: `TunelesService extends BaseCrudTenantService<Tunel>`
**Constructor**: `super(tunelRepo)` — inject `@InjectRepository(Tunel) tunelRepo` and `EstablecimientosService`

**Export `AUDIT` const**:
```typescript
export const AUDIT = {
  CREATED: 'tunel_created',
  UPDATED: 'tunel_updated',
  DELETED: 'tunel_deleted',
} as const;
```

**Method: `listTuneles(q: QueryTunelesDto)`**:
- Build `filters` from `q.establecimiento_id` and `q.activo` — only when not `undefined`; **no activo default** (FR-010)
- Call `this.list({ ...q, filters }, { searchColumns: ['nombre'], filterAllowed: ['establecimiento_id', 'activo'], sortAllowed: ['nombre', 'created_at'], sortFallback: { by: 'created_at', order: 'DESC' }, strictTenant: true })`

**Method: `createTunel(dto: CreateTunelDto)`**:
1. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` — throws 404 if not in tenant
2. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
3. `findOne({ where: { tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, nombre: dto.nombre } })` — TypeORM excludes soft-deleted
4. If found → throw `AppError({ code: ErrorCodes.TUNEL_NOMBRE_DUPLICADO, status: 409 })`
5. `return this.create(dto, { strictTenant: true })`

**Method: `updateTunel(id: string, dto: UpdateTunelDto)`**:
1. `const current = await this.mustFindById(id, { strictTenant: true })` — throws 404
2. If `dto.nombre` present and differs from `current.nombre`: QB check for conflict excluding current `id` — throw `TUNEL_NOMBRE_DUPLICADO 409` if found
3. `return this.update(id, dto, { strictTenant: true })`

**Method: `deleteTunel(id: string)`**:
1. `await this.mustFindById(id, { strictTenant: true })` — throws 404
2. `await this.softDelete(id, { strictTenant: true })`
3. No cascade, no mesa count check (clarification Q5)

---

### Phase 4: Controllers & Module

#### Task 4.1 — TunelesController

**File**: `src/modules/tuneles/tuneles.controller.ts`

Class-level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('tuneles')`

| Endpoint | Role guard | Action |
|----------|-----------|--------|
| `GET /` | none (all authenticated) | `listTuneles(q)` → `page(...)` |
| `GET /:id` | none | `mustFindById(id, { strictTenant: true })` → `ok(tunel)` |
| `POST /` | `@Roles('supervisor', 'admin_global')` `@HttpCode(201)` | `createTunel(dto)` → `ok(tunel)` + audit |
| `PATCH /:id` | `@Roles('supervisor', 'admin_global')` | immutable guard → `updateTunel(id, dto)` → `ok(updated)` + audit |
| `DELETE /:id` | `@Roles('admin_global')` | `deleteTunel(id)` → `ok({ deleted: true })` + audit |

**PATCH immutable fields guard** (first line in handler):
```typescript
const ALLOWED = new Set(['nombre', 'capacidad_maxima', 'activo']);
if (Object.keys((req.body as Record<string, unknown>) ?? {}).some((k) => !ALLOWED.has(k))) {
  throw new AppError({
    code: ErrorCodes.TUNEL_FIELD_IMMUTABLE,
    message: 'Solo se pueden modificar nombre, capacidad_maxima y activo',
    status: 400,
  });
}
```

**Audit pattern**: follow `recetas.controller.ts` exactly — `auditLogPayload()` + `this.audit.write('admin', ...)`.

**`AuthRequest` type** (declare locally, same pattern as M04):
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

#### Task 4.2 — AdminTunelesController

**File**: `src/modules/tuneles/admin-tuneles.controller.ts`

- `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/tuneles')`
- Inject `TunelesService` only
- `GET /`: call `svc.listTuneles(q)` with `clampPagination`; return `page(items, p, limit, total)`

#### Task 4.3 — TunelesModule

**File**: `src/modules/tuneles/tuneles.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Tunel]), TenancyModule, AuditModule, EstablecimientosModule],
  providers: [TunelesService],
  controllers: [TunelesController, AdminTunelesController],
  exports: [TunelesService],
})
export class TunelesModule {}
```

> `TunelesService` is **exported** — M08 Mesas will inject it for tunnel validation.

#### Task 4.4 — Register in AppModule

Add to `src/app.module.ts` after `StockMovimientosModule`:
```typescript
import { TunelesModule } from './modules/tuneles/tuneles.module';
// ...
TunelesModule,
```

---

### Phase 5: Migration

**File**: `migrations/1770800000000-TunelesInit.ts` — **already created** as part of this plan.

See [data-model.md](data-model.md) for full SQL. Key highlights:
- `tuneles` table, no FK constraints (loose coupling)
- 3 regular indexes + 1 partial unique index `UQ_tuneles_tenant_est_nombre WHERE deleted_at IS NULL`
- `down()` drops indexes in reverse order, then table

---

### Phase 6: Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run migration:run` — table and indexes created
3. Manual smoke tests:
   - `POST /tuneles` as supervisor with valid establishment + unique nombre + capacidad_maxima=10 → 201
   - `POST /tuneles` same nombre + same establishment → 409 `TUNEL_NOMBRE_DUPLICADO`
   - `POST /tuneles` with establishment from different tenant → 404
   - `POST /tuneles` with capacidad_maxima=0 → 400 validation error
   - `GET /tuneles` (no filters) → both active and inactive returned
   - `GET /tuneles?activo=false` → only inactive
   - `GET /tuneles?q=tunel` → nombre ILIKE search
   - `GET /tuneles?establecimiento_id=<uuid>` → only tunnels for that establishment
   - `PATCH /tuneles/:id` with `{ establecimiento_id: '...' }` as supervisor → 400 `TUNEL_FIELD_IMMUTABLE`
   - `PATCH /tuneles/:id` with `{ nombre: 'existing-name' }` → 409 `TUNEL_NOMBRE_DUPLICADO`
   - `PATCH /tuneles/:id` as operario → 403
   - `PATCH /tuneles/:id` with capacidad_maxima=0 → 400 validation
   - `DELETE /tuneles/:id` as admin_global (tunnel with mesas) → 200 + audit + mesas unaffected
   - `DELETE /tuneles/:id` as supervisor → 403
   - `GET /admin/tuneles` as admin_global → 200 paginated list
   - `GET /admin/tuneles` as supervisor → 403
   - Soft-deleted tunnel nombre can be reused by new tunnel in same establishment → 201

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Service base class | Extends `BaseCrudTenantService<Tunel>` | No transaction complexity; single-row operations fit perfectly |
| PATCH guard | `ALLOWED = new Set(['nombre', 'capacidad_maxima', 'activo'])` | `establecimiento_id` immutable — clarification Q1 |
| activo default filter | None — FR-010 requires no default | Full catalog view; same pattern as M04 recetas |
| Search implementation | `searchColumns: ['nombre']` in list options | Single-column ILIKE; `applySearch` handles it correctly |
| Uniqueness constraint | Partial index `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` + in-code check | DB-level guarantee + domain error code; mirrors M04 recetas pattern — clarification Q3 |
| Establishment validation | `mustFindById()` from EstablecimientosService (create only) | Inherited tenant scope; `establecimiento_id` not re-validated on PATCH |
| Soft-delete guard | None — unconditional delete | Clarification Q5: no pre-delete mesa check; mesas retain tunel_id FK |
| Admin endpoint | Dedicated `AdminTunelesController` (separate file) | Clarification Q4: same pattern as all prior modules |
| TunelesService export | Exported in module | M08 Mesas needs it for tunnel validation and FIFO queue management |
| capacidad_maxima type | `integer NOT NULL` with `@IsInt() @Min(1)` | Integer constraint enforced at DTO + DB level; M08 uses it for capacity checks |
