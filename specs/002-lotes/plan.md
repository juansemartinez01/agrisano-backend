# Implementation Plan: M02 — Lotes

**Branch**: `002-lotes` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-lotes/spec.md`

## Summary

Build the `lotes` module (`src/modules/lotes/`) that manages seed and substrate lots in a single table with a PostgreSQL ENUM type discriminator. The module adds one new table (`lotes`) with a partial unique index for soft-delete-compatible uniqueness, seeds no roles (M01 already seeded them), and exposes 6 REST endpoints. Key implementation challenges: (1) OR-search across two columns bypassing `applySearch`; (2) `tipo` immutability enforced at both DTO and controller level; (3) forward-compatible bandeja reference check that skips gracefully when M04 has not yet been deployed.

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — one new table (`lotes`), one new ENUM type (`lote_tipo`)

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Performance Goals**: Standard REST, no special targets for this module

**Constraints**:
- `tipo` is immutable after creation — excluded from `UpdateLoteDto`; controller checks raw body
- `tenant_id` NEVER from request body
- No new npm packages
- TypeScript strict, no `any`
- Do not modify any existing module; allowed exceptions: `src/common/errors/error-codes.ts`, `src/app.module.ts`
- No role seeding in this module (roles already seeded in M01)

**Scale/Scope**: Module-level — single feature, ~9 source files + 1 migration

## Constitution Check

*GATE: All pass. No violations.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ Pass | Extends `BaseCrudTenantService`; reuses all shared infrastructure |
| II. Multi-Tenancy | ✅ Pass | `tenant_id` auto-set from `tenantContext`; partial index scoped per tenant |
| III. Error Handling | ✅ Pass | `AppError` + `ErrorCodes` for all domain failures; 4 new domain codes |
| IV. Audit | ✅ Pass | 3 audit events via `AuditService.write('admin', ...)` in controllers |
| V. Roles | ✅ Pass | `JwtAuthGuard` + `RolesGuard` + `@Roles()` on all write/delete endpoints |
| VI. Transactions | ✅ Pass | No multi-step inventory flows; single-row inserts do not need transactions |
| VII. API Responses | ✅ Pass | All responses use `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | Strict TypeScript, class-validator DTOs, typed service contracts |
| IX. Modules | ✅ Pass | One module at `src/modules/lotes/`; no circular imports |
| X. Small Steps | ✅ Pass | Single module delivered in full before M03 |

## Project Structure

### Documentation (this feature)

```text
specs/002-lotes/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── research.md          # Phase 0: resolved technical decisions
├── data-model.md        # Phase 1: entity schema, migration SQL, state transitions
├── contracts/
│   └── api-spec.json    # Phase 1: OpenAPI 3.0 contract for all 6 endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
src/
├── common/
│   └── errors/
│       └── error-codes.ts              ← MODIFY: add 4 lotes error codes
├── app.module.ts                       ← MODIFY: add LotesModule import
└── modules/
    └── lotes/
        ├── entities/
        │   └── lote.entity.ts          ← CREATE (includes LoteTipo enum)
        ├── dto/
        │   ├── create-lote.dto.ts      ← CREATE
        │   ├── update-lote.dto.ts      ← CREATE (no tipo field)
        │   └── query-lotes.dto.ts      ← CREATE
        ├── lotes.service.ts            ← CREATE
        ├── lotes.controller.ts         ← CREATE
        ├── admin-lotes.controller.ts   ← CREATE
        └── lotes.module.ts             ← CREATE

migrations/
└── 1770300000000-LotesInit.ts          ← CREATED (delivered as part of plan)
```

## Complexity Tracking

No constitution violations — table intentionally empty.

---

## Implementation Phases

### Phase 1: Schema & Error Codes

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append under a `// lotes` comment:
```typescript
// lotes
LOTE_NOT_FOUND: 'LOTE_NOT_FOUND',
LOTE_NUMERO_DUPLICADO: 'LOTE_NUMERO_DUPLICADO',
LOTE_REFERENCED_BY_BANDEJA: 'LOTE_REFERENCED_BY_BANDEJA',
LOTE_TIPO_IMMUTABLE: 'LOTE_TIPO_IMMUTABLE',
```

#### Task 1.2 — Lote entity

**File**: `src/modules/lotes/entities/lote.entity.ts`

```typescript
export enum LoteTipo {
  SEMILLA = 'semilla',
  SUSTRATO = 'sustrato',
}

@Entity('lotes')
export class Lote extends BaseEntity {
  @Column({ type: 'enum', enum: LoteTipo })
  tipo!: LoteTipo;

  @Column({ type: 'varchar', length: 100 })
  numero_lote!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  proveedor!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

> **Important**: Do NOT add `@Unique` decorator — the uniqueness constraint is a partial index created exclusively in the migration.

---

### Phase 2: DTOs

#### Task 2.1 — CreateLoteDto

**File**: `src/modules/lotes/dto/create-lote.dto.ts`

Fields: `tipo: LoteTipo` (`@IsEnum`), `numero_lote: string` (`@IsString @IsNotEmpty @MaxLength(100)`), `proveedor?: string` (`@IsOptional @IsString @MaxLength(200)`), `observaciones?: string` (`@IsOptional @IsString`)

#### Task 2.2 — UpdateLoteDto

**File**: `src/modules/lotes/dto/update-lote.dto.ts`

- `tipo` is **intentionally absent** — immutability enforced by omission from DTO
- Fields: `numero_lote?`, `proveedor?`, `observaciones?`, `activo?` — all optional with same validators as create (minus `tipo`)

#### Task 2.3 — QueryLotesDto

**File**: `src/modules/lotes/dto/query-lotes.dto.ts`

- Extends `PageQueryDto` from `src/common/query/page-query.dto`
- Adds: `q?: string`, `tipo?: LoteTipo` (`@IsOptional @IsEnum`), `activo?: boolean` (`@IsOptional @IsBoolean @Transform`), `sortBy?: string`, `sortOrder?: 'ASC' | 'DESC'`

---

### Phase 3: Service

#### Task 3.1 — LotesService

**File**: `src/modules/lotes/lotes.service.ts`

**Class**: `LotesService extends BaseCrudTenantService<Lote>`
**Constructor**: `super(loteRepo)` — no extra dependencies (no UsersService needed)

**Export `AUDIT` const**:
```typescript
export const AUDIT = {
  CREATED: 'lote_created',
  UPDATED: 'lote_updated',
  DELETED: 'lote_deleted',
} as const;
```

**Method: `listLotes(q)`**
- Calls `this.list()` with `filterAllowed: ['tipo', 'activo']`, `sortAllowed: ['numero_lote', 'proveedor', 'created_at']`, `strictTenant: true`
- When `q.q` is present, adds OR search via `customizeQb` using TypeORM `Brackets`:
  ```typescript
  new Brackets(b => b
    .where(`${alias}.numero_lote ILIKE :search`, { search: `%${q.q}%` })
    .orWhere(`${alias}.proveedor ILIKE :search`)
  )
  ```
- Passes `tipo` and `activo` filters via the `filters` key in the query object

**Method: `createLote(dto)`**
1. `const tenantId = this.getTenantId({ strictTenant: true }) as string`
2. `findOne({ where: { tenant_id: tenantId, tipo: dto.tipo, numero_lote: dto.numero_lote } })` — TypeORM excludes soft-deleted by default
3. If found → throw `AppError LOTE_NUMERO_DUPLICADO 409`
4. `return this.create(dto, { strictTenant: true })`

**Method: `updateLote(id, dto)`**
1. If `dto.numero_lote` is present: load current lot, check for conflicting lot with same `tipo` + new `numero_lote` (excluding current ID), throw `LOTE_NUMERO_DUPLICADO 409` if found
2. `return this.update(id, dto, { strictTenant: true })`

**Method: `deleteLote(id)`**
1. `await this.mustFindById(id, { strictTenant: true })` — throws `NOT_FOUND` if missing
2. Forward-compatible bandeja check (try/catch raw query — see research.md Decision 5):
   - Query: `SELECT COUNT(*)::int AS cnt FROM bandejas WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1`
   - If `cnt > 0` → throw `AppError LOTE_REFERENCED_BY_BANDEJA 409`
   - Catch non-AppError → skip (table not yet deployed)
3. `await this.softDelete(id, { strictTenant: true })`

---

### Phase 4: Controllers & Module

#### Task 4.1 — LotesController

**File**: `src/modules/lotes/lotes.controller.ts`

Class-level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('lotes')`

| Endpoint | Role guard | Action |
|----------|-----------|--------|
| GET `/` | none (all authenticated — RolesGuard passes when no roles required) | `listLotes(q)` → `page(...)` |
| GET `/:id` | none | `mustFindById(id)` → `ok(lote)` |
| POST `/` | `@Roles('supervisor', 'admin_global')` | `createLote(dto)` → `ok(lote)` + audit |
| PATCH `/:id` | `@Roles('supervisor', 'admin_global')` | check `req.body.tipo` → `updateLote(id, dto)` → `ok(lote)` + audit |
| DELETE `/:id` | `@Roles('admin_global')` | `deleteLote(id)` → `ok({ deleted: true })` + audit |

**PATCH tipo guard** (must be FIRST in handler body):
```typescript
if ('tipo' in ((req.body as Record<string, unknown>) ?? {})) {
  throw new AppError({ code: ErrorCodes.LOTE_TIPO_IMMUTABLE, message: 'El campo tipo no puede ser modificado', status: 400 });
}
```

#### Task 4.2 — AdminLotesController

**File**: `src/modules/lotes/admin-lotes.controller.ts`

- `@Roles('admin_global')` + `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('admin/lotes')`
- Single `GET /` endpoint: calls `svc.listLotes(q)`, returns `page(...)`

#### Task 4.3 — LotesModule

**File**: `src/modules/lotes/lotes.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Lote]), TenancyModule, AuditModule],
  providers: [LotesService],
  controllers: [LotesController, AdminLotesController],
  exports: [LotesService],
})
export class LotesModule {}
```

> No `UsersModule` import — lots have no user-assignment logic.

#### Task 4.4 — Register in AppModule

Add to `src/app.module.ts` imports after `EstablecimientosModule`:
```typescript
import { LotesModule } from './modules/lotes/lotes.module';
// ...
LotesModule,
```

---

### Phase 5: Migration

**File**: `migrations/1770300000000-LotesInit.ts` — **already created** as part of this plan.

See [data-model.md](data-model.md) for full SQL. Key highlights:
- Creates `lote_tipo` ENUM before table
- Partial unique index `UQ_lotes_tenant_tipo_numero WHERE deleted_at IS NULL`
- `down()` drops in reverse order: indexes → table → ENUM type

---

### Phase 6: Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run migration:run` — tables created; re-run safe (idempotent)
3. `npx eslint src/modules/lotes/ --ext .ts` — zero errors
4. Manual smoke tests (plan.md Phase 6):
   - POST `/lotes` as supervisor → 201
   - POST same `numero_lote` + `tipo` → 409 LOTE_NUMERO_DUPLICADO
   - PATCH with `{ tipo: 'sustrato' }` → 400 LOTE_TIPO_IMMUTABLE
   - GET `/lotes?q=abc` as operario → OR search hits numero_lote or proveedor
   - DELETE as admin_global → 200 + audit
   - GET `/admin/lotes` as supervisor → 403

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| tipo storage | PostgreSQL native ENUM | DB-level enforcement; TypeORM `type: 'enum'` support |
| Uniqueness constraint | Partial unique index WHERE deleted_at IS NULL | Allows same numero_lote after soft-delete |
| OR search | `customizeQb` with `Brackets` | `applySearch` uses AND; spec requires OR |
| tipo immutability guard | `req.body` check in controller PATCH | `UpdateLoteDto` excludes `tipo`; raw body still carries it |
| Bandeja check | try/catch raw manager.query | Postgres 42P01 swallowed; AppError re-thrown |
| No UsersModule | Not imported | No user-assignment logic |
| Audit location | Controller (not service) | Matches M01 and admin-users patterns |
