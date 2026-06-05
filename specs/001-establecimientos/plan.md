# Implementation Plan: M01 — Establecimientos

**Branch**: `001-establecimientos` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-establecimientos/spec.md`

## Summary

Build the `establecimientos` module (`src/modules/establecimientos/`) that manages physical greenhouse establishments within a multi-tenant NestJS + TypeORM + PostgreSQL backend. The module adds two new tables (`establecimientos`, `usuario_establecimiento`), seeds three new roles (`operario`, `supervisor`, `admin_global`), and exposes 9 REST endpoints with role-scoped access. The key implementation challenge is scoping `list()` and `getOne()` queries based on the caller's role: `admin_global` sees all tenant establishments; `supervisor`/`operario` see only their assigned ones (returning 404, not 403, for unassigned establishments).

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — two new tables (`establecimientos`, `usuario_establecimiento`)

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Project Type**: REST API (multi-tenant, module-based NestJS)

**Performance Goals**: Standard REST, no special targets for this module

**Constraints**:
- `tenant_id` NEVER from request body — always from `TenancyService`/`tenantContext`
- No new npm packages
- TypeScript strict mode, no `any`
- Do not modify any existing module (`auth`, `users`, `admin`, `audit`, `files`, `tenancy`, `_shared`)
- All responses use `ok()` / `page()` from `src/common/http/api-response.ts`

**Scale/Scope**: Module-level — single feature, ~10 files

## Constitution Check

*GATE: All pass. No violations.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ Pass | Extends `BaseCrudTenantService`; uses `BaseCrudController`, `BaseEntity`, all shared infrastructure |
| II. Multi-Tenancy | ✅ Pass | `tenant_id` auto-set from `tenantContext`; no cross-tenant exposure; assignment validates same tenant |
| III. Error Handling | ✅ Pass | `AppError` + `ErrorCodes` for all domain failures; new codes added for domain clarity |
| IV. Audit | ✅ Pass | 6 audit events written via `AuditService.write('admin', ...)` in controllers |
| V. Roles | ✅ Pass | `JwtAuthGuard` + `RolesGuard` + `@Roles()` on all endpoints; new roles seeded idempotently |
| VI. Transactions | ✅ Pass | No multi-step inventory flows in this module; single-row inserts do not need transactions |
| VII. API Responses | ✅ Pass | All controller methods return `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | Strict TypeScript, class-validator DTOs, typed service contracts |
| IX. Modules | ✅ Pass | One module at `src/modules/establecimientos/`; imports only shared + UsersModule |
| X. Small Steps | ✅ Pass | Single module delivered in full before moving to M02 |

## Project Structure

### Documentation (this feature)

```text
specs/001-establecimientos/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── research.md          # Phase 0: resolved technical decisions
├── data-model.md        # Phase 1: entity schemas, migration SQL, state transitions
├── contracts/
│   └── api-spec.json    # Phase 1: OpenAPI 3.0 contract for all 9 endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
src/
├── common/
│   └── errors/
│       └── error-codes.ts            ← MODIFY: add 3 new domain error codes
├── app.module.ts                     ← MODIFY: add EstablecimientosModule import
└── modules/
    └── establecimientos/
        ├── entities/
        │   ├── establecimiento.entity.ts          ← CREATE
        │   └── usuario-establecimiento.entity.ts  ← CREATE
        ├── dto/
        │   ├── create-establecimiento.dto.ts      ← CREATE
        │   ├── update-establecimiento.dto.ts      ← CREATE
        │   ├── query-establecimientos.dto.ts      ← CREATE
        │   └── assign-user.dto.ts                 ← CREATE (used for path param validation)
        ├── establecimientos.service.ts            ← CREATE
        ├── establecimientos.controller.ts         ← CREATE
        ├── admin-establecimientos.controller.ts   ← CREATE
        └── establecimientos.module.ts             ← CREATE

migrations/
└── 1770200000000-EstablecimientosInit.ts          ← CREATE
```

## Complexity Tracking

No constitution violations — table intentionally empty.

---

## Implementation Phases

### Phase 1: Schema & Error Codes

**Goal**: Entities and error codes in place — everything else depends on these.

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append to the `ErrorCodes` const object (under a `// establecimientos` comment):

```typescript
// establecimientos
ESTABLECIMIENTO_NOT_FOUND: 'ESTABLECIMIENTO_NOT_FOUND',
ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
```

#### Task 1.2 — Establecimiento entity

**File**: `src/modules/establecimientos/entities/establecimiento.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('establecimientos')
export class Establecimiento extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ubicacion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

#### Task 1.3 — UsuarioEstablecimiento entity

**File**: `src/modules/establecimientos/entities/usuario-establecimiento.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('usuario_establecimiento')
@Unique('UQ_ue_user_establecimiento', ['user_id', 'establecimiento_id'])
export class UsuarioEstablecimiento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  assigned_at!: Date;
}
```

---

### Phase 2: DTOs

**Goal**: All request/response shapes validated with class-validator.

#### Task 2.1 — CreateEstablecimientoDto

**File**: `src/modules/establecimientos/dto/create-establecimiento.dto.ts`

```typescript
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateEstablecimientoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ubicacion?: string;
}
```

#### Task 2.2 — UpdateEstablecimientoDto

**File**: `src/modules/establecimientos/dto/update-establecimiento.dto.ts`

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateEstablecimientoDto } from './create-establecimiento.dto';

export class UpdateEstablecimientoDto extends PartialType(CreateEstablecimientoDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
```

#### Task 2.3 — QueryEstablecimientosDto

**File**: `src/modules/establecimientos/dto/query-establecimientos.dto.ts`

```typescript
import { IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryEstablecimientosDto extends PageQueryDto {
  @IsOptional()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  sortOrder?: 'ASC' | 'DESC';
}
```

---

### Phase 3: Service

**Goal**: All business logic; audit writes happen in controllers.

#### Task 3.1 — EstablecimientosService

**File**: `src/modules/establecimientos/establecimientos.service.ts`

**Class signature**:
```typescript
@Injectable()
export class EstablecimientosService extends BaseCrudTenantService<Establecimiento> {
  constructor(
    @InjectRepository(Establecimiento)
    private readonly estRepo: Repository<Establecimiento>,

    @InjectRepository(UsuarioEstablecimiento)
    private readonly ueRepo: Repository<UsuarioEstablecimiento>,

    private readonly usersService: UsersService,
  ) {
    super(estRepo);
  }
}
```

**Audit constants** (module-level, not exported):
```typescript
const AUDIT = {
  CREATED:       'establecimiento_created',
  UPDATED:       'establecimiento_updated',
  DEACTIVATED:   'establecimiento_deactivated',
  DELETED:       'establecimiento_deleted',
  USER_ASSIGNED: 'usuario_asignado',
  USER_REMOVED:  'usuario_removido',
} as const;
```

**Method: `listForUser(q, actor)`**
- If `actor.roles.includes('admin_global')`: call `super.list(q, { searchColumns: ['nombre'], filterAllowed: ['activo'], sortAllowed: ['nombre', 'created_at'], strictTenant: true })`
- Else: call `super.list(q, { ..., customizeQb: (qb, alias) => qb.innerJoin('usuario_establecimiento', 'ue', \`ue.establecimiento_id = ${alias}.id AND ue.user_id = :userId\`, { userId: actor.userId }) })`

**Method: `findOneForUser(id, actor)`**
- If `actor.roles.includes('admin_global')`: return `this.mustFindById(id, { strictTenant: true })`
- Else: query with INNER JOIN on `usuario_establecimiento` for `actor.userId`; throw `AppError({ code: ErrorCodes.ESTABLECIMIENTO_NOT_FOUND, status: 404 })` if null

**Method: `createEstablecimiento(dto)`**
- Calls `this.create(dto, { strictTenant: true })`
- Returns new entity
- Controller writes AUDIT.CREATED

**Method: `updateEstablecimiento(id, dto)`**
- Calls `this.mustFindById(id, { strictTenant: true })` first
- Calls `this.update(id, dto, { strictTenant: true })`
- Returns `{ updated, wasDeactivated: prev.activo === true && dto.activo === false }`
- Controller writes AUDIT.UPDATED (and AUDIT.DEACTIVATED if wasDeactivated)

**Method: `deleteEstablecimiento(id)`**
- Calls `this.mustFindById(id, { strictTenant: true })` first (throws 404 if not found)
- Calls `this.softDelete(id, { strictTenant: true })`
- Controller writes AUDIT.DELETED

**Method: `assignUser(establecimientoId, assigneeUserId)`**
1. Get tenantId via `this.getTenantId({ strictTenant: true })`
2. Verify establishment exists: `this.mustFindById(establecimientoId, { strictTenant: true })` — throws ESTABLECIMIENTO_NOT_FOUND 404
3. Verify assignee user exists in the same tenant: `usersService.getByIdAdmin(assigneeUserId, false)` — check `user.tenant_id === tenantId`, throw `AppError NOT_FOUND 404` if missing
4. Insert `UsuarioEstablecimiento`; catch UNIQUE violation → throw `AppError({ code: ErrorCodes.ASSIGNMENT_CONFLICT, status: 409, message: 'User already assigned' })`
5. Return assignment record
- Controller writes AUDIT.USER_ASSIGNED

**Method: `removeUser(establecimientoId, assigneeUserId)`**
1. Verify establishment exists in tenant
2. Find assignment: `ueRepo.findOne({ where: { establecimiento_id, user_id } })` — throw `AppError ASSIGNMENT_NOT_FOUND 404` if not found
3. Delete assignment record
- Controller writes AUDIT.USER_REMOVED

**Method: `listUsers(establecimientoId, actor)`**
1. Verify access: if admin_global, verify establishment exists in tenant; if supervisor, use `findOneForUser` to check assignment
2. Query `ueRepo.find({ where: { establecimiento_id: establecimientoId } })`
3. Enrich with user info by calling `usersService.getByIdAdmin()` for each `user_id` (or use a JOIN query)
4. Return enriched list

**Export `AUDIT`**: Make the constants accessible from controllers — export them or pass action strings from the controller directly.

> **Note**: Export `AUDIT` so controllers can reference canonical action strings. Or define action strings inline in controllers (simpler; the constants object is a convenience only).

---

### Phase 4: Controllers & Module

#### Task 4.1 — EstablecimientosController

**File**: `src/modules/establecimientos/establecimientos.controller.ts`

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('establecimientos')
export class EstablecimientosController {
  constructor(
    private readonly estService: EstablecimientosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}
```

**Endpoints and role guards**:

| Method | Path | Guard |
|--------|------|-------|
| GET | `/` | `@Roles('admin_global', 'supervisor', 'operario')` |
| GET | `/:id` | `@Roles('admin_global', 'supervisor', 'operario')` |
| POST | `/` | `@Roles('admin_global')` |
| PATCH | `/:id` | `@Roles('admin_global')` |
| DELETE | `/:id` | `@Roles('admin_global')` |
| POST | `/:id/usuarios/:userId` | `@Roles('admin_global')` |
| DELETE | `/:id/usuarios/:userId` | `@Roles('admin_global')` |
| GET | `/:id/usuarios` | `@Roles('admin_global', 'supervisor')` |

**Critical implementation notes**:
- `list()` and `getOne()` pass `{ userId: req.user.sub, roles: req.user.roles }` to service
- `getOne()`: if supervisor/operario, the service returns 404 for unassigned establishments (never 403)
- After each write operation: call `this.logger.info(payload, 'admin_audit')` then `await this.audit.write('admin', {...})`
- PATCH: detect deactivation in service response, write AUDIT.DEACTIVATED additionally when `wasDeactivated === true`
- All responses use `ok(data)` or `page(items, p, limit, total)` — NEVER raw entities

**Response shapes**:
- `list()` → `page(items, page, limit, total)`
- `getOne()` → `ok(establecimiento)`
- `create()` → `ok(establecimiento)` with HTTP 201
- `update()` → `ok(establecimiento)`
- `delete()` → `ok({ deleted: true })`
- `assignUser()` → `ok(assignment)` with HTTP 201
- `removeUser()` → `ok({ removed: true })`
- `listUsers()` → `ok(assignments)`

#### Task 4.2 — AdminEstablecimientosController

**File**: `src/modules/establecimientos/admin-establecimientos.controller.ts`

```typescript
@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/establecimientos')
export class AdminEstablecimientosController {
  constructor(private readonly estService: EstablecimientosService) {}

  @Get()
  async list(@Query() q: QueryEstablecimientosDto, @Req() req: any) {
    const actor = { userId: req.user.sub, roles: req.user.roles };
    const r = await this.estService.listForUser(q, actor);
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    return page(r.items, p, limit, r.total);
  }
}
```

> Note: Admin panel may optionally include `deleted_at` and user count in the future. For M01, it returns the same shape as the regular list but is always admin_global-scoped with no assignment filter.

#### Task 4.3 — EstablecimientosModule

**File**: `src/modules/establecimientos/establecimientos.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Establecimiento, UsuarioEstablecimiento]),
    TenancyModule,
    AuditModule,
    UsersModule,
  ],
  providers: [EstablecimientosService],
  controllers: [EstablecimientosController, AdminEstablecimientosController],
  exports: [EstablecimientosService],
})
export class EstablecimientosModule {}
```

#### Task 4.4 — Register in AppModule

**File**: `src/app.module.ts`

Add to `imports` array:
```typescript
import { EstablecimientosModule } from './modules/establecimientos/establecimientos.module';
// ...
EstablecimientosModule,
```

---

### Phase 5: Migration

#### Task 5.1 — Create migration

**File**: `migrations/1770200000000-EstablecimientosInit.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class EstablecimientosInit1770200000000 implements MigrationInterface {
  name = 'EstablecimientosInit1770200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create establecimientos table
    await queryRunner.query(`
      CREATE TABLE "establecimientos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "nombre" character varying(150) NOT NULL,
        "ubicacion" character varying(300),
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_establecimientos" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_establecimientos_tenant_id" ON "establecimientos" ("tenant_id")`
    );

    // Create usuario_establecimiento table
    await queryRunner.query(`
      CREATE TABLE "usuario_establecimiento" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "establecimiento_id" uuid NOT NULL,
        "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuario_establecimiento" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ue_user_establecimiento" UNIQUE ("user_id", "establecimiento_id"),
        CONSTRAINT "FK_ue_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ue_establecimiento" FOREIGN KEY ("establecimiento_id")
          REFERENCES "establecimientos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ue_user_id" ON "usuario_establecimiento" ("user_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ue_establecimiento_id" ON "usuario_establecimiento" ("establecimiento_id")`
    );

    // Role seed (idempotent — ON CONFLICT DO NOTHING)
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "tenant_id", "name", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), NULL, 'operario',     now(), now()),
        (gen_random_uuid(), NULL, 'supervisor',   now(), now()),
        (gen_random_uuid(), NULL, 'admin_global', now(), now())
      ON CONFLICT ("name") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "usuario_establecimiento"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "establecimientos"`);
    // NOTE: Does NOT remove seeded roles to avoid breaking existing user assignments.
  }
}
```

---

### Phase 6: Verification

#### Task 6.1 — TypeScript compile check

Run `npx tsc --noEmit` — must pass with zero errors before PR.

#### Task 6.2 — Migration smoke test

Run `npm run migration:run` against a local DB. Verify tables and role seed created. Run again — must not fail (idempotency).

#### Task 6.3 — Manual endpoint tests

Start server: `npm run start:dev`

Key paths to verify:
1. POST `/establecimientos` as admin_global → 201
2. GET `/establecimientos` as admin_global → all establishments
3. GET `/establecimientos` as supervisor (assigned) → only assigned
4. GET `/establecimientos/:id` as supervisor (unassigned) → 404 (not 403)
5. POST `/establecimientos/:id/usuarios/:userId` → 201; repeat → 409
6. GET `/establecimientos/:id/usuarios` as supervisor → 200

#### Task 6.4 — Lint

Run `npx eslint src/modules/establecimientos/ --ext .ts` — no errors.

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Role-scoped list | `customizeQb` INNER JOIN | Tenant scope applied first by base service; JOIN narrows naturally |
| Unassigned getOne | 404 (never 403) | Prevents existence disclosure (spec clarification Q2) |
| Audit location | Controller (not service) | Matches AdminUsersController pattern; services remain audit-free |
| Audit action strings | Plain strings in service | `AuditLog.action` is varchar(80); not ErrorCodes scope |
| New ErrorCodes | ESTABLECIMIENTO_NOT_FOUND, ASSIGNMENT_NOT_FOUND, ASSIGNMENT_CONFLICT | Domain-specific codes improve client debuggability |
| listUsers enrichment | Via UsersService injection | Avoids raw SQL; clean module boundary via one-way dependency |
| BaseCrudTenantService | Extend (not compose) | Existing pattern; `super.list()` / `super.mustFindById()` reuse |
| `admin_global` scoping | No join table entry required | Spec clarification Q5; service uses role-check branch, not JOIN path |
| Deactivation cascade | No cascade on `usuario_establecimiento` | Spec clarification Q1; assignments survive deactivation |
| Role seed | `ON CONFLICT (name) DO NOTHING` | Idempotent per spec clarification Q3 |
