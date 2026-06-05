# Implementation Plan: M04 — Recetas (Nursery Recipes)

**Branch**: `004-recetas` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-recetas/spec.md`

## Summary

Build the `recetas` module (`src/modules/recetas/`) that manages nursery recipe references scoped to an establishment. Each recipe is a named protocol label that operarios select when logging chemical applications (M08). The module adds one new table (`recetas`) with a partial unique index for `(tenant_id, establecimiento_id, nombre)`, exposes 6 REST endpoints, and follows the same `BaseCrudTenantService` + audit pattern as M02 lotes. Key implementation constraints: (1) `establecimiento_id` is immutable — PATCH guard rejects it; (2) no default `activo` filter on list (FR-007); (3) uniqueness checked in-code before insert to return domain error codes.

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — one new table (`recetas`), partial unique index, no new ENUM type

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Performance Goals**: Standard REST; no special targets for this module

**Constraints**:
- `RecetasService` extends `BaseCrudTenantService<Receta>` (unlike M03 SiembraService — no transaction complexity)
- `establecimiento_id` immutable after creation — PATCH guard rejects it with `RECETA_FIELD_IMMUTABLE 400`
- No default `activo` filter on `GET /recetas` — all non-deleted returned unless caller passes `?activo`
- `tenant_id` NEVER from request body
- No new npm packages; TypeScript strict, no `any`
- Do not modify any existing module; allowed exceptions: `src/common/errors/error-codes.ts`, `src/app.module.ts`

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
| IX. Modules | ✅ Pass | One module at `src/modules/recetas/`; no circular imports |
| X. Small Steps | ✅ Pass | Single module delivered in full before M05 |

## Project Structure

### Documentation (this feature)

```text
specs/004-recetas/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── research.md          # Phase 0: 7 resolved technical decisions
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
│       └── error-codes.ts              ← MODIFY: add 3 recetas error codes
├── app.module.ts                       ← MODIFY: add RecetasModule import
└── modules/
    └── recetas/
        ├── entities/
        │   └── receta.entity.ts        ← CREATE
        ├── dto/
        │   ├── create-receta.dto.ts    ← CREATE
        │   ├── update-receta.dto.ts    ← CREATE (no establecimiento_id field)
        │   └── query-recetas.dto.ts    ← CREATE
        ├── recetas.service.ts          ← CREATE (extends BaseCrudTenantService<Receta>)
        ├── recetas.controller.ts       ← CREATE
        ├── admin-recetas.controller.ts ← CREATE
        └── recetas.module.ts           ← CREATE

migrations/
└── 1770500000000-RecetasInit.ts        ← CREATED (delivered as part of plan)
```

## Complexity Tracking

No constitution violations — table intentionally empty.

---

## Implementation Phases

### Phase 1: Schema & Error Codes

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append under a `// recetas` comment:
```typescript
// recetas
RECETA_NOT_FOUND: 'RECETA_NOT_FOUND',
RECETA_NOMBRE_DUPLICADO: 'RECETA_NOMBRE_DUPLICADO',
RECETA_FIELD_IMMUTABLE: 'RECETA_FIELD_IMMUTABLE',
```

#### Task 1.2 — Receta entity

**File**: `src/modules/recetas/entities/receta.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('recetas')
export class Receta extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

> **No `@Unique` decorator** — uniqueness lives in the migration partial index only (same as M02 lotes).

---

### Phase 2: DTOs

#### Task 2.1 — CreateRecetaDto

**File**: `src/modules/recetas/dto/create-receta.dto.ts`

Fields:
- `establecimiento_id: string` — `@IsUUID()` (required)
- `nombre: string` — `@IsString() @IsNotEmpty() @MaxLength(150)` (required)
- `descripcion?: string` — `@IsOptional() @IsString()`

#### Task 2.2 — UpdateRecetaDto

**File**: `src/modules/recetas/dto/update-receta.dto.ts`

- `nombre?: string` — `@IsOptional() @IsString() @IsNotEmpty() @MaxLength(150)`
- `descripcion?: string` — `@IsOptional() @IsString()`
- `activo?: boolean` — `@IsOptional() @IsBoolean()`
- **`establecimiento_id` MUST NOT appear** — immutability enforced by controller guard

#### Task 2.3 — QueryRecetasDto

**File**: `src/modules/recetas/dto/query-recetas.dto.ts`

Extends `PageQueryDto` from `src/common/query/page-query.dto`.

Fields:
- `q?: string` — `@IsOptional() @IsString()` — ILIKE search on nombre
- `establecimiento_id?: string` — `@IsOptional() @IsUUID()`
- `activo?: boolean` — `@IsOptional() @IsBoolean() @Transform(...)` — coerce `'true'`/`'false'` string; **NO default value** (FR-007)
- `sortBy?: string` — `@IsOptional() @IsString()`
- `sortOrder?: 'ASC' | 'DESC'` — `@IsOptional() @IsIn(['ASC', 'DESC'])`

---

### Phase 3: Service

#### Task 3.1 — RecetasService

**File**: `src/modules/recetas/recetas.service.ts`

**Class**: `RecetasService extends BaseCrudTenantService<Receta>`
**Constructor**: `super(recetaRepo)` — inject `@InjectRepository(Receta) recetaRepo` and `EstablecimientosService`

**Export `AUDIT` const**:
```typescript
export const AUDIT = {
  CREATED: 'receta_created',
  UPDATED: 'receta_updated',
  DELETED: 'receta_deleted',
} as const;
```

**Method: `listRecetas(q: QueryRecetasDto)`**:
- Build `filters` from `q.establecimiento_id` and `q.activo` — only when not `undefined`; **no activo default** (FR-007)
- Call `this.list({ ...q, filters }, { searchColumns: ['nombre'], filterAllowed: ['establecimiento_id', 'activo'], sortAllowed: ['nombre', 'created_at'], sortFallback: { by: 'created_at', order: 'DESC' }, strictTenant: true })`

**Method: `createReceta(dto: CreateRecetaDto)`**:
1. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })` — throws 404 if not in tenant
2. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
3. `findOne({ where: { tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, nombre: dto.nombre } })` — TypeORM excludes soft-deleted
4. If found → throw `AppError({ code: ErrorCodes.RECETA_NOMBRE_DUPLICADO, status: 409 })`
5. `return this.create(dto, { strictTenant: true })`

**Method: `updateReceta(id: string, dto: UpdateRecetaDto)`**:
1. `const current = await this.mustFindById(id, { strictTenant: true })` — throws 404
2. If `dto.nombre` present and differs from `current.nombre`: QB check for conflict excluding current `id` — throw `RECETA_NOMBRE_DUPLICADO 409` if found
3. `return this.update(id, dto, { strictTenant: true })`

**Method: `deleteReceta(id: string)`**:
1. `await this.mustFindById(id, { strictTenant: true })` — throws 404
2. `await this.softDelete(id, { strictTenant: true })`
3. No M08 reference check (per spec clarification Q4)

---

### Phase 4: Controllers & Module

#### Task 4.1 — RecetasController

**File**: `src/modules/recetas/recetas.controller.ts`

Class-level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('recetas')`

| Endpoint | Role guard | Action |
|----------|-----------|--------|
| `GET /` | none (all authenticated) | `listRecetas(q)` → `page(...)` |
| `GET /:id` | none | `mustFindById(id, { strictTenant: true })` → `ok(receta)` |
| `POST /` | `@Roles('supervisor', 'admin_global')` `@HttpCode(201)` | `createReceta(dto)` → `ok(receta)` + audit |
| `PATCH /:id` | `@Roles('supervisor', 'admin_global')` | immutable guard → `updateReceta(id, dto)` → `ok(updated)` + audit |
| `DELETE /:id` | `@Roles('admin_global')` | `deleteReceta(id)` → `ok({ deleted: true })` + audit |

**PATCH immutable fields guard** (first line in handler):
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

**Audit pattern**: follow `lotes.controller.ts` exactly — `auditLogPayload()` + `this.audit.write('admin', ...)`.

**`AuthRequest` type** (declare locally, same pattern as M02/M03):
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

#### Task 4.2 — AdminRecetasController

**File**: `src/modules/recetas/admin-recetas.controller.ts`

- `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/recetas')`
- Inject `RecetasService` only
- `GET /`: call `svc.listRecetas(q)` with `clampPagination`; return `page(items, p, limit, total)`

#### Task 4.3 — RecetasModule

**File**: `src/modules/recetas/recetas.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Receta]), TenancyModule, AuditModule, EstablecimientosModule],
  providers: [RecetasService],
  controllers: [RecetasController, AdminRecetasController],
  exports: [RecetasService],
})
export class RecetasModule {}
```

#### Task 4.4 — Register in AppModule

Add to `src/app.module.ts` after `SiembraModule`:
```typescript
import { RecetasModule } from './modules/recetas/recetas.module';
// ...
RecetasModule,
```

---

### Phase 5: Migration

**File**: `migrations/1770500000000-RecetasInit.ts` — **already created** as part of this plan.

See [data-model.md](data-model.md) for full SQL. Key highlights:
- `recetas` table, no FK constraints (loose coupling)
- 3 regular indexes + 1 partial unique index `UQ_recetas_tenant_est_nombre WHERE deleted_at IS NULL`
- `down()` drops indexes in reverse order, then table

---

### Phase 6: Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run migration:run` — table and indexes created
3. Manual smoke tests:
   - `POST /recetas` as supervisor with valid establishment + unique nombre → 201
   - `POST /recetas` same nombre + same establishment → 409 `RECETA_NOMBRE_DUPLICADO`
   - `POST /recetas` with establishment from different tenant → 404
   - `GET /recetas` (no filters) → both active and inactive returned
   - `GET /recetas?activo=false` → only inactive
   - `GET /recetas?q=herb` → nombre ILIKE search
   - `PATCH /recetas/:id` with `{ establecimiento_id: '...' }` as supervisor → 400 `RECETA_FIELD_IMMUTABLE`
   - `PATCH /recetas/:id` with `{ nombre: 'existing-name' }` → 409 `RECETA_NOMBRE_DUPLICADO`
   - `PATCH /recetas/:id` as operario → 403
   - `DELETE /recetas/:id` as admin_global → 200 + audit
   - `DELETE /recetas/:id` as supervisor → 403
   - `GET /admin/recetas` as admin_global → 200 paginated list
   - `GET /admin/recetas` as supervisor → 403

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Service base class | Extends `BaseCrudTenantService<Receta>` | No transaction complexity; single-row operations fit perfectly |
| PATCH guard | `ALLOWED = new Set(['nombre', 'descripcion', 'activo'])` | `establecimiento_id` immutable per spec clarification Q1 |
| activo default filter | None — FR-007 requires no default | Unlike `GET /bandejas`, recipe list is a full catalog view |
| Search implementation | `searchColumns: ['nombre']` in list options | Single-column ILIKE; `applySearch` handles it correctly |
| Uniqueness constraint | Partial index `(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` + in-code check | DB-level guarantee + domain error code; mirrors M02 lotes pattern |
| Establishment validation | `mustFindById()` from EstablecimientosService (create only) | Inherited tenant scope; `establecimiento_id` not re-validated on PATCH |
| M08 reference guard | Not implemented | Spec clarification Q4: deferred to M08 |
| Admin endpoint | Same `listRecetas()` call; role guard is the only difference | No separate admin query logic needed |
