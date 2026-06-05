# Implementation Plan: M03 — Siembra (Seeding Events)

**Branch**: `003-siembra` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-siembra/spec.md`

## Summary

Build the `siembra` module (`src/modules/siembra/`) that manages daily seeding events. Each seeding event (Siembra) creates one or more physical trays (Bandejas) atomically via an explicit QueryRunner transaction. The module exposes 7 REST endpoints across two controllers, enforces lot-type pre-validation before the transaction opens, and cascades soft-deletes to all trays when a seeding is deleted (blocked if any tray is already transplanted).

## Technical Context

**Language/Version**: TypeScript (NestJS 10.x, Node 20)

**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, class-validator, class-transformer, nestjs-pino

**Storage**: PostgreSQL — two new tables (`siembras`, `bandejas`), one new ENUM type (`bandeja_estado`)

**Testing**: Jest (unit) + e2e test suite in `test/`

**Target Platform**: Linux server (Docker)

**Performance Goals**: Standard REST; no special targets for this module

**Constraints**:
- `SiembraService` does NOT extend `BaseCrudTenantService` — custom QueryRunner transaction required
- `BandejaService` DOES extend `BaseCrudTenantService<Bandeja>` for list/getOne
- `usuario_id` NEVER from request body — always from `req.user.sub`
- `fecha` defaults to today's date string if omitted
- PATCH body with any key other than `observaciones` → throw `SIEMBRA_FIELD_IMMUTABLE 400`
- Lot type validation runs BEFORE transaction opens (pre-validation pattern per research Decision 4)
- No new npm packages; TypeScript strict, no `any`
- Do not modify any existing module; allowed exceptions: `src/common/errors/error-codes.ts`, `src/app.module.ts`

**Scale/Scope**: Module-level — single feature, ~11 source files + 1 migration (migration already created)

## Constitution Check

*GATE: All pass. No violations.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ Pass | `BandejaService` extends `BaseCrudTenantService`; `SiembraService` deviation justified in research Decision 1 |
| II. Multi-Tenancy | ✅ Pass | `tenant_id` auto-set from `TenancyService.requireTenantId()`; all queries scoped to tenant |
| III. Error Handling | ✅ Pass | `AppError` + `ErrorCodes` for all domain failures; 5 new domain codes |
| IV. Audit | ✅ Pass | 3 audit events via `AuditService.write()` in controller |
| V. Roles | ✅ Pass | `JwtAuthGuard` + `RolesGuard` + `@Roles()` on write/delete endpoints |
| VI. Transactions | ✅ Pass | Explicit `QueryRunner` used for both create (atomic insert) and delete (cascade bulk UPDATE + soft delete) |
| VII. API Responses | ✅ Pass | All responses use `ok()` or `page()` |
| VIII. Code Quality | ✅ Pass | Strict TypeScript, class-validator DTOs, typed service contracts |
| IX. Modules | ✅ Pass | One module at `src/modules/siembra/`; no circular imports |
| X. Small Steps | ✅ Pass | Single module delivered in full |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| `SiembraService` does not extend `BaseCrudTenantService` | `create` requires explicit `QueryRunner` spanning two entity tables; `BaseCrudTenantService.create()` calls `repository.save()` with no transaction control | Overriding `create()` in a subclass fights the base; plain service is cleaner and easier to reason about |

## Project Structure

### Documentation (this feature)

```text
specs/003-siembra/
├── spec.md              # Feature specification (with clarifications)
├── plan.md              # This file
├── research.md          # Phase 0: 9 resolved technical decisions
├── data-model.md        # Phase 1: entity schemas, migration SQL, state transitions
├── contracts/
│   └── api-spec.json    # Phase 1: OpenAPI 3.0 contract for all 7 endpoints
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code

```text
src/
├── common/
│   └── errors/
│       └── error-codes.ts              ← MODIFY: add 5 siembra error codes
├── app.module.ts                       ← MODIFY: add SiembraModule import
└── modules/
    └── siembra/
        ├── entities/
        │   ├── siembra.entity.ts       ← CREATE
        │   └── bandeja.entity.ts       ← CREATE (includes BandejaEstado enum)
        ├── dto/
        │   ├── create-siembra.dto.ts   ← CREATE (includes BandejaGroupDto nested class)
        │   ├── update-siembra.dto.ts   ← CREATE (observaciones only)
        │   ├── query-siembras.dto.ts   ← CREATE
        │   └── query-bandejas.dto.ts   ← CREATE
        ├── siembra.service.ts          ← CREATE (plain Injectable, no base extension)
        ├── bandeja.service.ts          ← CREATE (extends BaseCrudTenantService<Bandeja>)
        ├── siembra.controller.ts       ← CREATE
        ├── bandeja.controller.ts       ← CREATE
        └── siembra.module.ts           ← CREATE

migrations/
└── 1770400000000-SiembraInit.ts       ← ALREADY CREATED (delivered as part of plan)
```

---

## Implementation Phases

### Phase 1: Schema & Error Codes

#### Task 1.1 — Add domain error codes

**File**: `src/common/errors/error-codes.ts`

Append under a `// siembra` comment:
```typescript
// siembra
SIEMBRA_NOT_FOUND: 'SIEMBRA_NOT_FOUND',
SIEMBRA_HAS_TRASPLANTADAS: 'SIEMBRA_HAS_TRASPLANTADAS',
SIEMBRA_FIELD_IMMUTABLE: 'SIEMBRA_FIELD_IMMUTABLE',
BANDEJA_NOT_FOUND: 'BANDEJA_NOT_FOUND',
LOTE_TIPO_INCORRECTO: 'LOTE_TIPO_INCORRECTO',
```

#### Task 1.2 — Siembra entity

**File**: `src/modules/siembra/entities/siembra.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('siembras')
export class Siembra extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'date' })
  fecha!: string; // stored as 'YYYY-MM-DD'

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;
}
```

> **No `@OneToMany`** to Bandeja — avoids TypeORM eager loading globally. Bandejas loaded via explicit QueryBuilder only.

#### Task 1.3 — Bandeja entity

**File**: `src/modules/siembra/entities/bandeja.entity.ts`

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum BandejaEstado {
  EN_NURSERY = 'en_nursery',
  TRASPLANTADA = 'trasplantada',
}

@Entity('bandejas')
export class Bandeja extends BaseEntity {
  @Column({ type: 'uuid' })
  siembra_id!: string;

  @Column({ type: 'uuid' })
  lote_semilla_id!: string;

  @Column({ type: 'uuid' })
  lote_sustrato_id!: string;

  @Column({ type: 'enum', enum: BandejaEstado, default: BandejaEstado.EN_NURSERY })
  estado!: BandejaEstado;

  @Column({ type: 'timestamptz' })
  fecha_entrada_nursery!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_trasplante!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  mesa_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  codigo!: string | null;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;
}
```

---

### Phase 2: DTOs

#### Task 2.1 — CreateSiembraDto

**File**: `src/modules/siembra/dto/create-siembra.dto.ts`

Declare an inner `BandejaGroupDto` class (must be defined before `CreateSiembraDto` in the same file):

```typescript
import { Type } from 'class-transformer';
import {
  IsUUID, IsOptional, IsString, IsArray, ArrayMinSize,
  ValidateNested, IsInt, Min, IsDateString,
} from 'class-validator';

export class BandejaGroupDto {
  @IsUUID()
  lote_semilla_id!: string;

  @IsUUID()
  lote_sustrato_id!: string;

  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class CreateSiembraDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BandejaGroupDto)
  bandejas!: BandejaGroupDto[];
}
```

#### Task 2.2 — UpdateSiembraDto

**File**: `src/modules/siembra/dto/update-siembra.dto.ts`

Contains ONLY `observaciones`. The controller guards against any other field in `req.body` before DTO validation occurs.

```typescript
import { IsOptional, IsString } from 'class-validator';

export class UpdateSiembraDto {
  @IsOptional()
  @IsString()
  observaciones?: string;
}
```

#### Task 2.3 — QuerySiembrasDto

**File**: `src/modules/siembra/dto/query-siembras.dto.ts`

```typescript
import { IsOptional, IsUUID, IsDateString, IsString, IsIn } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QuerySiembrasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
```

#### Task 2.4 — QueryBandejasDto

**File**: `src/modules/siembra/dto/query-bandejas.dto.ts`

```typescript
import { IsOptional, IsUUID, IsString, IsIn, IsEnum } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { BandejaEstado } from '../entities/bandeja.entity';

export class QueryBandejasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsUUID()
  siembra_id?: string;

  @IsOptional()
  @IsUUID()
  lote_semilla_id?: string;

  @IsOptional()
  @IsEnum(BandejaEstado)
  estado?: BandejaEstado;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
```

---

### Phase 3: Services

#### Task 3.1 — SiembraService

**File**: `src/modules/siembra/siembra.service.ts`

**Class**: plain `@Injectable()` — does NOT extend `BaseCrudTenantService`.

**Constructor injections**:
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

**Export `AUDIT` const**:
```typescript
export const AUDIT = {
  CREATED: 'siembra_created',
  UPDATED: 'siembra_updated',
  DELETED: 'siembra_deleted',
} as const;
```

---

**Method: `listSiembras(q: QuerySiembrasDto)`**

Manual QB — applies tenant scope + date range filters + pagination + sort.

```typescript
async listSiembras(q: QuerySiembrasDto): Promise<{ items: Siembra[]; total: number }> {
  const tenantId = this.tenancy.requireTenantId();
  const { page, limit, skip } = clampPagination(q.page, q.limit, 200);
  const SORT_ALLOWED = ['fecha', 'created_at'];
  const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? q.sortBy! : 'created_at';
  const sortOrder = q.sortOrder ?? 'DESC';

  const qb = this.siembraRepo
    .createQueryBuilder('s')
    .where('s.tenant_id = :tenantId', { tenantId });

  if (q.establecimiento_id) qb.andWhere('s.establecimiento_id = :estId', { estId: q.establecimiento_id });
  if (q.fecha_desde) qb.andWhere('s.fecha >= :desde', { desde: q.fecha_desde });
  if (q.fecha_hasta) qb.andWhere('s.fecha <= :hasta', { hasta: q.fecha_hasta });

  qb.orderBy(`s.${sortBy}`, sortOrder).skip(skip).take(limit);

  const [items, total] = await qb.getManyAndCount();
  return { items, total };
}
```

---

**Method: `getSiembraWithBandejas(id: string)`**

Returns Siembra plus nested bandejas with lote_semilla and lote_sustrato refs. Uses LEFT JOINs in a single query to avoid N+1.

```typescript
async getSiembraWithBandejas(id: string): Promise<SiembraWithBandejas> {
  const tenantId = this.tenancy.requireTenantId();

  const siembra = await this.siembraRepo.findOne({
    where: { id, tenant_id: tenantId },
  });
  if (!siembra) throw new AppError({ code: ErrorCodes.SIEMBRA_NOT_FOUND, status: 404, message: 'Siembra no encontrada' });

  // Custom QB to load bandejas with lote refs in one query
  const rows = await this.bandejaRepo
    .createQueryBuilder('b')
    .leftJoinAndMapOne('b.lote_semilla', 'lotes', 'ls', 'ls.id = b.lote_semilla_id')
    .leftJoinAndMapOne('b.lote_sustrato', 'lotes', 'lsu', 'lsu.id = b.lote_sustrato_id')
    .where('b.siembra_id = :id', { id })
    .andWhere('b.tenant_id = :tenantId', { tenantId })
    .select([
      'b.id', 'b.siembra_id', 'b.lote_semilla_id', 'b.lote_sustrato_id',
      'b.estado', 'b.fecha_entrada_nursery', 'b.fecha_trasplante',
      'b.mesa_id', 'b.observaciones', 'b.codigo', 'b.establecimiento_id',
      'b.created_at', 'b.updated_at',
      'ls.id', 'ls.numero_lote', 'ls.tipo',
      'lsu.id', 'lsu.numero_lote', 'lsu.tipo',
    ])
    .getMany();

  return { ...siembra, bandejas: rows };
}
```

> **Type**: Declare `SiembraWithBandejas` as an interface at top of file:
> ```typescript
> interface SiembraWithBandejas extends Siembra {
>   bandejas: (Bandeja & { lote_semilla?: Partial<Lote>; lote_sustrato?: Partial<Lote> })[];
> }
> ```

---

**Method: `createSiembra(dto: CreateSiembraDto, userId: string)`**

Critical path — pre-validation then explicit transaction.

```typescript
async createSiembra(dto: CreateSiembraDto, userId: string): Promise<SiembraWithBandejas> {
  const tenantId = this.tenancy.requireTenantId();

  // Step 1: validate establishment
  await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

  // Step 2: validate all lots BEFORE transaction
  for (const group of dto.bandejas) {
    const semilla = await this.lotesService.mustFindById(group.lote_semilla_id, { strictTenant: true });
    if (semilla.tipo !== LoteTipo.SEMILLA) {
      throw new AppError({
        code: ErrorCodes.LOTE_TIPO_INCORRECTO,
        message: `lote_semilla_id '${group.lote_semilla_id}' no es de tipo semilla`,
        status: 422,
      });
    }
    const sustrato = await this.lotesService.mustFindById(group.lote_sustrato_id, { strictTenant: true });
    if (sustrato.tipo !== LoteTipo.SUSTRATO) {
      throw new AppError({
        code: ErrorCodes.LOTE_TIPO_INCORRECTO,
        message: `lote_sustrato_id '${group.lote_sustrato_id}' no es de tipo sustrato`,
        status: 422,
      });
    }
  }

  // Step 3: explicit transaction
  const qr = this.dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    // Insert siembra
    const siembra = qr.manager.create(Siembra, {
      tenant_id: tenantId,
      establecimiento_id: dto.establecimiento_id,
      fecha: dto.fecha ?? new Date().toISOString().split('T')[0],
      observaciones: dto.observaciones ?? null,
      usuario_id: userId,
    });
    const savedSiembra = await qr.manager.save(Siembra, siembra);

    // Insert bandejas (quantity expansion)
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

    // Reload with bandejas + lot refs
    return this.getSiembraWithBandejas(savedSiembra.id);
  } catch (err) {
    await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
  }
}
```

---

**Method: `updateSiembra(id: string, dto: UpdateSiembraDto)`**

Updates only `observaciones`. Controller performs immutable-field guard before calling this method.

```typescript
async updateSiembra(id: string, dto: UpdateSiembraDto): Promise<Siembra> {
  const tenantId = this.tenancy.requireTenantId();
  const siembra = await this.siembraRepo.findOne({ where: { id, tenant_id: tenantId } });
  if (!siembra) throw new AppError({ code: ErrorCodes.SIEMBRA_NOT_FOUND, status: 404, message: 'Siembra no encontrada' });
  siembra.observaciones = dto.observaciones ?? null;
  return this.siembraRepo.save(siembra);
}
```

---

**Method: `deleteSiembra(id: string)`**

Guards against trasplantada trays then cascades soft-delete in a transaction.

```typescript
async deleteSiembra(id: string): Promise<void> {
  const tenantId = this.tenancy.requireTenantId();

  // Load siembra + check existence
  const siembra = await this.siembraRepo.findOne({ where: { id, tenant_id: tenantId } });
  if (!siembra) throw new AppError({ code: ErrorCodes.SIEMBRA_NOT_FOUND, status: 404, message: 'Siembra no encontrada' });

  // Check for trasplantada trays (soft-delete excluded by default)
  const trasplantadaCount = await this.bandejaRepo.count({
    where: { siembra_id: id, estado: BandejaEstado.TRASPLANTADA },
  });
  if (trasplantadaCount > 0) {
    throw new AppError({
      code: ErrorCodes.SIEMBRA_HAS_TRASPLANTADAS,
      message: 'No se puede eliminar una siembra con bandejas trasplantadas',
      status: 409,
    });
  }

  // Transaction: cascade soft-delete bandejas then siembra
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
}
```

---

#### Task 3.2 — BandejaService

**File**: `src/modules/siembra/bandeja.service.ts`

**Class**: `BandejaService extends BaseCrudTenantService<Bandeja>`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { Bandeja, BandejaEstado } from './entities/bandeja.entity';
import { QueryBandejasDto } from './dto/query-bandejas.dto';

@Injectable()
export class BandejaService extends BaseCrudTenantService<Bandeja> {
  constructor(
    @InjectRepository(Bandeja)
    private readonly bandejaRepo: Repository<Bandeja>,
  ) {
    super(bandejaRepo);
  }

  async listBandejas(q: QueryBandejasDto): Promise<{ items: Bandeja[]; total: number }> {
    const estadoFilter = q.estado ?? BandejaEstado.EN_NURSERY;
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

  async getBandeja(id: string): Promise<Bandeja> {
    const bandeja = await this.findById(id, { strictTenant: true });
    if (!bandeja) {
      throw new AppError({
        code: ErrorCodes.BANDEJA_NOT_FOUND,
        message: 'Bandeja no encontrada',
        status: 404,
      });
    }
    return bandeja;
  }
}
```

---

### Phase 4: Controllers & Module

#### Task 4.1 — SiembraController

**File**: `src/modules/siembra/siembra.controller.ts`

Class-level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('siembras')`

| Endpoint | Role guard | Action |
|----------|-----------|--------|
| GET `/` | none (all authenticated) | `listSiembras(q)` → `page(...)` |
| POST `/` | `@Roles('operario', 'supervisor', 'admin_global')` | pre-validation → `createSiembra(dto, userId)` → `ok(result)` + audit (HTTP 201) |
| GET `/:id` | none | `getSiembraWithBandejas(id)` → `ok(siembra)` |
| PATCH `/:id` | `@Roles('supervisor', 'admin_global')` | immutable guard → `updateSiembra(id, dto)` → `ok(updated)` + audit |
| DELETE `/:id` | `@Roles('admin_global')` | `deleteSiembra(id)` → `ok({ deleted: true })` + audit |

**PATCH immutable fields guard** (must be first in handler body — same pattern as M02 tipo guard):
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

**Audit pattern** (follow exactly the M02 lotes.controller.ts pattern):
```typescript
const payload = auditLogPayload({
  requestId: req.id,
  actorUserId: req.user?.sub,
  actorEmail: req.user?.email,
  action: AUDIT.CREATED,
  entity: 'siembra',
  extra: { siembraId: result.id, totalBandejas: result.bandejas.length },
});
this.logger.info(payload, 'admin_audit');
await this.audit.write('admin', {
  request_id: req.id,
  method: req.method,
  path: req.url,
  status_code: 201,
  actor_user_id: req.user?.sub ?? null,
  actor_email: req.user?.email ?? null,
  action: AUDIT.CREATED,
  entity: 'siembra',
  tenant_id: req.tenantId ?? null,
  payload,
});
```

**`AuthRequest` type** (declare locally in this file — same pattern as lotes.controller.ts):
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

#### Task 4.2 — BandejaController

**File**: `src/modules/siembra/bandeja.controller.ts`

Class-level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller('bandejas')`

| Endpoint | Role guard | Action |
|----------|-----------|--------|
| GET `/` | none | `listBandejas(q)` → `page(...)` |
| GET `/:id` | none | `getBandeja(id)` → `ok(bandeja)` |

No write operations on this controller — all writes via SiembraController.

#### Task 4.3 — SiembraModule

**File**: `src/modules/siembra/siembra.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { LotesModule } from 'src/modules/lotes/lotes.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Siembra } from './entities/siembra.entity';
import { Bandeja } from './entities/bandeja.entity';
import { SiembraService } from './siembra.service';
import { BandejaService } from './bandeja.service';
import { SiembraController } from './siembra.controller';
import { BandejaController } from './bandeja.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Siembra, Bandeja]),
    TenancyModule,
    AuditModule,
    LotesModule,
    EstablecimientosModule,
  ],
  providers: [SiembraService, BandejaService],
  controllers: [SiembraController, BandejaController],
  exports: [SiembraService, BandejaService],
})
export class SiembraModule {}
```

#### Task 4.4 — Register in AppModule

Add to `src/app.module.ts` imports after `LotesModule`:
```typescript
import { SiembraModule } from './modules/siembra/siembra.module';
// ...
SiembraModule,
```

---

### Phase 5: Migration

**File**: `migrations/1770400000000-SiembraInit.ts` — **already created** as part of this plan.

See [data-model.md](data-model.md) for full SQL. Key highlights:
- Creates `bandeja_estado` ENUM before tables
- `siembras` table with FK → `establecimientos(id)`
- `bandejas` table with FKs → `siembras(id)`, `lotes(id)` (×2)
- No `ON DELETE CASCADE` on FK — cascade is handled via explicit bulk UPDATE in the service
- 9 indexes covering all query patterns

---

### Phase 6: Verification

1. `npx tsc --noEmit` — zero errors
2. `npm run migration:run` — tables created; re-run safe (migration guards with EXISTS checks)
3. Manual smoke tests:
   - POST `/siembras` as operario with valid lots → 201 + siembra with `bandejas[]` nested
   - POST `/siembras` with `lote_semilla_id` pointing to a sustrato lot → 422 `LOTE_TIPO_INCORRECTO`
   - POST `/siembras` with empty `bandejas: []` → 400 validation error
   - POST `/siembras` with `cantidad: 0` → 400 validation error
   - PATCH `/siembras/:id` with `{ observaciones: "test" }` as supervisor → 200
   - PATCH `/siembras/:id` with `{ fecha: "2026-01-01" }` as supervisor → 400 `SIEMBRA_FIELD_IMMUTABLE`
   - PATCH `/siembras/:id` as operario → 403
   - GET `/siembras/:id` → siembra with `bandejas[]` including `lote_semilla` and `lote_sustrato`
   - DELETE `/siembras/:id` (all en_nursery) as admin_global → 200 `{ deleted: true }` + audit
   - DELETE `/siembras/:id` (any trasplantada) as admin_global → 409 `SIEMBRA_HAS_TRASPLANTADAS`
   - GET `/bandejas` (no filter) → only `en_nursery` trays
   - GET `/bandejas?estado=trasplantada` → only `trasplantada` trays
   - GET `/bandejas/:id` → single bandeja

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SiembraService base class | Plain `@Injectable()` | QueryRunner requirement incompatible with BaseCrudTenantService.create() |
| Transaction implementation | Explicit QueryRunner | Guarantees full rollback per spec clarification Q2 |
| Lot type validation timing | Before transaction opens | Avoids partial writes inside transaction per spec clarification Q3 |
| Bandeja cascade delete | Bulk `UPDATE ... SET deleted_at` in QB | Single query per spec clarification Q6; avoids N individual softDeletes |
| Establishment validation | `mustFindById()` from EstablecimientosService | Inherits tenant scope automatically; sufficient for cross-tenant protection |
| PATCH guard | Check `req.body` keys before DTO binding | ValidationPipe strips unknown fields; raw body carries originals — same pattern as M02 tipo guard |
| GET /siembras/:id response | Custom QB with leftJoinAndMapOne | Avoids N+1 and global eager loading configuration on entities |
| fecha type | PostgreSQL `date` stored as `YYYY-MM-DD` string | Calendar date semantics; avoids timezone complications in range queries |
| GET /bandejas default filter | `estado=en_nursery` when omitted | Primary daily use case is nursery view; full list requires explicit opt-in |
| No @OneToMany on Siembra | Not declared | Prevents TypeORM from applying joins globally; explicit QB for the one endpoint that needs it |
