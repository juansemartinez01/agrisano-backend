# Implementation Plan: M05 — Quimicos y Principios Activos

**Branch**: `005-quimicos-principios-activos` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-quimicos-principios-activos/spec.md`

## Summary

Build the `quimicos` NestJS module to manage chemical products used in greenhouse applications. Each chemical (`Quimico`) is tenant-scoped to an establishment, exposes a read-only `stock_actual` field, and carries a many-to-many list of active principles (`PrincipioActivo`) drawn from a global (non-tenant) catalog. The module follows the identical architecture established in M01–M04: `BaseCrudTenantService`, `JwtAuthGuard`, `RolesGuard`, `AppError`, `AuditService`, and `ok()`/`page()` response helpers. One architectural deviation from prior modules is required: because `PrincipioActivo` has no `tenant_id`, it cannot use `BaseCrudTenantService` and is served by a plain `Injectable` service. The many-to-many join table (`quimico_principio_activo`) is managed explicitly via a TypeORM entity and DataSource transactions rather than TypeORM's `@ManyToMany` decorator, keeping the join table fully under service control.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, no `any`)

**Primary Dependencies**: NestJS 10, TypeORM 0.3, class-validator, class-transformer, nestjs-pino — all already installed

**Storage**: PostgreSQL 15 — three new tables: `principios_activos`, `quimicos`, `quimico_principio_activo`

**Testing**: Jest (integration tests per module, same pattern as M01–M04)

**Target Platform**: Node.js 20 server, same deployment as existing modules

**Performance Goals**: List endpoints respond in under 1 second at normal load; global principios_activos catalog loaded in a single unpaginated query

**Constraints**: No new npm packages; TypeScript strict mode; no `any`; no cross-tenant data access; stock_actual is read-only from this module

**Scale/Scope**: Multi-tenant SaaS; principios_activos catalog is a small global table (hundreds of rows); quimicos per tenant in thousands range

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Template First | ✅ Pass | `QuimicosService` extends `BaseCrudTenantService<Quimico>`; `PrincipiosActivosService` is plain Injectable because PrincipioActivo has no `tenant_id` (architectural exception documented) |
| II. Multi-Tenancy | ✅ Pass | All `Quimico` queries use `strictTenant: true`; `PrincipioActivo` is explicitly global (no tenant scope) — architectural decision documented in spec |
| III. Error Handling | ✅ Pass | All domain failures use `AppError` + `ErrorCodes`; six new codes added to `error-codes.ts` |
| IV. Audit | ✅ Pass | Six audit events: `quimico_created/updated/deleted`, `principio_activo_created/updated/deleted` — all written via `AuditService.write()` |
| V. Roles | ✅ Pass | `@Roles('supervisor', 'admin_global')` for create/update; `@Roles('admin_global')` for delete and PA management; all endpoints behind `JwtAuthGuard` |
| VI. Transactions | ✅ Pass | principios_activos replace (DELETE + INSERT) wrapped in `runInTx(dataSource, ...)` |
| VII. API Responses | ✅ Pass | All endpoints return `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | DTOs use `class-validator`; TypeScript strict; no `any` |
| IX. Modules | ✅ Pass | Single module at `src/modules/quimicos/`; no direct cross-module file imports |
| X. Small Steps | ✅ Pass | Implementing M05 fully before any other module |

**Post-Phase-1 Re-check**: No violations found in design. The `PrincipiosActivosService` deviation from `BaseCrudTenantService` is justified: the entity is globally shared with no `tenant_id` field, making the base service inapplicable.

## Project Structure

### Documentation (this feature)

```text
specs/005-quimicos-principios-activos/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api-spec.json    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/modules/quimicos/
├── entities/
│   ├── quimico.entity.ts
│   ├── principio-activo.entity.ts
│   └── quimico-principio-activo.entity.ts
├── dto/
│   ├── create-quimico.dto.ts
│   ├── update-quimico.dto.ts
│   ├── query-quimicos.dto.ts
│   ├── create-principio-activo.dto.ts
│   └── update-principio-activo.dto.ts
├── quimicos.service.ts
├── principios-activos.service.ts
├── quimicos.controller.ts
├── principios-activos.controller.ts
├── admin-quimicos.controller.ts
└── quimicos.module.ts

migrations/
└── 1770600000000-QuimicosInit.ts   # created as part of this plan

src/common/errors/
└── error-codes.ts    # add 6 new codes (existing file)

src/app.module.ts     # add QuimicosModule import (existing file)
```

**Structure Decision**: Standard single-module structure under `src/modules/quimicos/`, identical to M01–M04 layout. No frontend or additional services required.

## Phase 0: Research

See [research.md](research.md) for full findings. Key decisions:

1. **Join table management**: Manual explicit entity (`QuimicoPrincipioActivo`) + service-controlled DELETE/INSERT inside `runInTx`, not TypeORM `@ManyToMany`. Rationale: avoids TypeORM's eager-load/lazy-load complexity; replace semantics are explicit and testable; reference-count queries for PA delete are straightforward.

2. **PrincipioActivo service**: Plain `@Injectable()` (no `BaseCrudTenantService`) because the entity has no `tenant_id` field. The base service requires `TenantEntity` shape. This is the only legitimate deviation.

3. **PATCH guard pattern**: Controller-level check (same as M04 recetas pattern) — `ALLOWED = new Set([...])`, iterate `req.body` keys, throw `QUIMICO_FIELD_IMMUTABLE` if any key is outside the allowed set.

4. **principios_activos replace-or-ignore**: `principioActivoIds` is `string[] | undefined` (undefined = omit, empty array = remove all). Replace transaction: DELETE WHERE quimico_id = X, then bulk INSERT if any IDs remain. Wrapped in `runInTx(dataSource, ...)`.

5. **getQuimicoWithPrincipios**: QueryBuilder JOIN approach — `quimico LEFT JOIN quimico_principio_activo ON ... LEFT JOIN principios_activos ON ...` to get full detail in one query.

6. **Admin list scope**: Admin controller reuses `listQuimicos()` service method (tenant-scoped via JWT context). No filter constraints are enforced — admin_global can pass or omit `establecimiento_id` and `activo` freely. The service applies `strictTenant: true` (admin_global's own tenant).

## Phase 1: Design

See [data-model.md](data-model.md) and [contracts/api-spec.json](contracts/api-spec.json).

### Entity Summary

| Entity | Table | Key Traits |
|---|---|---|
| `Quimico` | `quimicos` | Extends BaseEntity; tenant-scoped; soft-delete; stock read-only |
| `PrincipioActivo` | `principios_activos` | Plain entity; global (no tenant_id); hard-delete when unreferenced |
| `QuimicoPrincipioActivo` | `quimico_principio_activo` | Join table; composite PK; used for reference checks + relation management |

### Service Summary

| Service | Base | Responsibility |
|---|---|---|
| `QuimicosService` | `BaseCrudTenantService<Quimico>` | CRUD for quimicos; principios_activos link management; uniqueness validation |
| `PrincipiosActivosService` | `@Injectable()` (plain) | Global catalog CRUD; reference check on delete |

### Controller Summary

| Controller | Route Prefix | Auth |
|---|---|---|
| `QuimicosController` | `/quimicos` | JwtAuthGuard + RolesGuard |
| `PrincipiosActivosController` | `/principios-activos` | JwtAuthGuard + RolesGuard |
| `AdminQuimicosController` | `/admin/quimicos` | @Roles('admin_global') |

### Error Codes Added

```typescript
QUIMICO_NOT_FOUND
QUIMICO_NOMBRE_DUPLICADO
QUIMICO_FIELD_IMMUTABLE
PRINCIPIO_ACTIVO_NOT_FOUND
PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO
PRINCIPIO_ACTIVO_REFERENCIADO
```

### Audit Events

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

### Key Implementation Details

#### QuimicosService

```typescript
// createQuimico(dto, principioActivoIds?: string[])
1. estService.mustFindById(dto.establecimiento_id, { strictTenant: true })
2. Uniqueness check: quimicoRepo.findOne({ tenant_id, establecimiento_id, nombre })
   → throw QUIMICO_NOMBRE_DUPLICADO (409) if conflict
3. Validate principioActivoIds (if provided):
   found = await paRepo.findBy({ id: In(ids) })
   if found.length !== ids.length → collect unknown ids → throw BAD_REQUEST with details
4. quimico = await this.create({ ...dto, stock_actual: 0 }, { strictTenant: true })
5. If ids.length > 0: INSERT into quimico_principio_activo (bulk, no transaction needed for create)
6. Return await getQuimicoWithPrincipios(quimico.id)

// updateQuimico(id, dto, principioActivoIds?: string[])
1. current = await this.mustFindById(id, { strictTenant: true })
2. If dto.nombre defined && dto.nombre !== current.nombre: uniqueness check excluding current id
3. If principioActivoIds defined (including empty []):
   await runInTx(dataSource, async (mgr) => {
     await mgr.delete(QuimicoPrincipioActivo, { quimico_id: id })
     if principioActivoIds.length > 0:
       await mgr.insert(QuimicoPrincipioActivo, ids.map(paId => ({ quimico_id: id, principio_activo_id: paId })))
   })
   Validate ids before transaction (same as create)
4. await this.update(id, { nombre, unidad_medida, activo }, { strictTenant: true })
5. Return await getQuimicoWithPrincipios(id)

// getQuimicoWithPrincipios(id)
qb = quimicoRepo.createQueryBuilder('q')
  .leftJoinAndMapMany('q.principios_activos', QuimicoPrincipioActivo, 'qpa', 'qpa.quimico_id = q.id')
  .leftJoinAndMapMany('qpa.principio_activo', PrincipioActivo, 'pa', 'pa.id = qpa.principio_activo_id')
  // OR: use raw join + manual mapping
  .where('q.id = :id', { id })
Return full quimico with principios_activos[] nested
```

#### PrincipiosActivosService

```typescript
// delete(id)
1. const pa = await paRepo.findOne({ where: { id } }) → 404 if not found
2. const refCount = await qpaRepo.count({ where: { principio_activo_id: id } })
3. if refCount > 0 → throw PRINCIPIO_ACTIVO_REFERENCIADO (409)
4. await paRepo.delete(id)   // hard delete
```

#### PATCH Guard (controller)

```typescript
const ALLOWED = new Set(['nombre', 'unidad_medida', 'activo', 'principios_activos']);
const bodyKeys = Object.keys((req.body as Record<string, unknown>) ?? {});
if (bodyKeys.some(k => !ALLOWED.has(k))) {
  throw new AppError({
    code: ErrorCodes.QUIMICO_FIELD_IMMUTABLE,
    message: 'Solo se pueden modificar: nombre, unidad_medida, activo, principios_activos',
    status: 400,
  });
}
```

#### DTO: `update-quimico.dto.ts`

`principios_activos` field: `@IsOptional() @IsArray() @IsUUID('4', { each: true }) principios_activos?: string[]`
Note: when present in controller, extract and pass to service as `principioActivoIds`.

### Migration

File: `migrations/1770600000000-QuimicosInit.ts` — created alongside this plan.

Tables created:
- `principios_activos`: uuid PK, nombre varchar(100) UNIQUE NOT NULL, created_at, updated_at
- `quimicos`: uuid PK, tenant_id uuid, establecimiento_id uuid NOT NULL, nombre varchar(150) NOT NULL, unidad_medida varchar(30) NOT NULL, stock_actual decimal(10,3) NOT NULL DEFAULT 0, activo boolean NOT NULL DEFAULT true, created_at, updated_at, deleted_at
- `quimico_principio_activo`: composite PK (quimico_id, principio_activo_id), FKs with CASCADE DELETE

Indexes:
- `IDX_quimicos_tenant_id`
- `IDX_quimicos_establecimiento_id`
- `IDX_quimicos_activo`
- `IDX_qpa_principio_activo_id` (for reference count queries)
- `UQ_quimicos_tenant_est_nombre` — PARTIAL UNIQUE on (tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL

### app.module.ts Change

Add `QuimicosModule` import in `src/app.module.ts`:
```typescript
import { QuimicosModule } from './modules/quimicos/quimicos.module';
// ...
QuimicosModule,  // after RecetasModule
```
