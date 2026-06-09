# Implementation Plan: M11 — Cosecha (Harvest)

**Branch**: `012-cosecha-harvest` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-cosecha/spec.md`

## Summary

Register a greenhouse-table harvest (cosecha) event atomically: INSERT cosecha record, UPDATE mesa to `en_cosecha`/`posicion_actual=NULL`, FIFO-decrement remaining mesas in the tunnel, and write a HistorialMesa entry — all inside a single QueryRunner transaction. Exposes four read-only list/detail endpoints. Returns HTTP 201. CosechaService is a plain `@Injectable()` with manual QueryBuilder queries scoped to tenant.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS 10.x)

**Primary Dependencies**: NestJS, TypeORM, class-validator, nestjs-pino, passport-jwt

**Storage**: PostgreSQL via TypeORM DataSource + QueryRunner for atomic multi-step transactions

**Testing**: Manual integration via REST (no new test files required per project pattern)

**Target Platform**: Linux server (same environment as M01-M10)

**Project Type**: NestJS REST API module

**Performance Goals**: Harvest registration completes within 2 seconds under normal load (single mesa + N remaining mesas FIFO update)

**Constraints**: No new npm packages; strict TypeScript (no `any`); no modifications to existing modules except `error-codes.ts` and `app.module.ts`; records are immutable once written (no deleted_at)

**Scale/Scope**: One mesa per harvest; read endpoints paginated up to 200 records

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ | Service is plain @Injectable() — multi-step QueryRunner transaction with FIFO recalc justifies no base class; controller uses @Controller() no-prefix pattern matching M09/M10 |
| II. Multi-Tenancy | ✅ | tenancy.requireTenantId() on all write paths; read endpoints scoped via tenant_id in QB WHERE clause |
| III. Error Handling | ✅ | 2 new ErrorCodes (COSECHA_NOT_FOUND, COSECHA_MESA_NO_DISPONIBLE); AppError used for all domain failures |
| IV. Audit | ✅ | AuditService.write() post-transaction with action `cosecha_registrada` |
| V. Roles | ✅ | JwtAuthGuard + RolesGuard; write: operario/supervisor/admin_global; read: all authenticated |
| VI. Transactions | ✅ | Full QueryRunner: INSERT cosecha + UPDATE mesa + FIFO UPDATE mesas + qr.manager.save(HistorialMesa) — commit or full rollback |
| VII. API Responses | ✅ | ok() and page() used exclusively; HTTP 201 on POST |
| VIII. Code Quality | ✅ | Strict types; class-validator on DTOs; no `any` |
| IX. Modules | ✅ | Single module src/modules/cosecha/ |
| X. Small Steps | ✅ | M10 fully implemented; M11 is next isolated step |

## Project Structure

### Documentation (this feature)

```text
specs/011-cosecha/
├── plan.md              ← this file
├── data-model.md        ← entity details
├── contracts/
│   └── api-spec.json    ← endpoint contracts
└── tasks.md             ← /speckit-tasks output (not yet)
```

### Source Code

```text
src/modules/cosecha/
├── entities/
│   └── cosecha.entity.ts          ← plain entity, no BaseEntity, no deleted_at
├── dto/
│   ├── create-cosecha.dto.ts
│   └── query-cosechas.dto.ts
├── cosecha.service.ts              ← plain @Injectable()
├── cosecha.controller.ts           ← @Controller() no prefix
└── cosecha.module.ts

migrations/
└── 1771200000000-CosechaInit.ts   ← created in plan phase

src/common/errors/
└── error-codes.ts   ← add 2 new codes (// cosecha block)

src/app.module.ts    ← add CosechaModule import
```

## Implementation Details

### Error Codes to Add (error-codes.ts)

Add after the `// trasplante` block:

```typescript
// cosecha
COSECHA_NOT_FOUND: 'COSECHA_NOT_FOUND',
COSECHA_MESA_NO_DISPONIBLE: 'COSECHA_MESA_NO_DISPONIBLE',
```

### Entity Details

#### Cosecha (plain entity — no BaseEntity, no deleted_at)

```
Table: cosechas
Columns:
  id                 uuid           NOT NULL DEFAULT gen_random_uuid()  ← PK
  tenant_id          uuid           NULL
  mesa_id            uuid           NOT NULL
  tunel_id           uuid           NOT NULL  ← denormalized at harvest time
  posicion_al_momento int           NOT NULL DEFAULT 1
  fecha_hora         timestamptz    NOT NULL DEFAULT now()
  peso_kg            decimal(10,3)  NOT NULL  CHECK (peso_kg > 0)
  usuario_id         uuid           NOT NULL
  observaciones      text           NULL
  created_at         timestamptz    NOT NULL DEFAULT now()
  updated_at         timestamptz    NOT NULL DEFAULT now()
  PK: (id)
  INDEXES: tenant_id, mesa_id, tunel_id, fecha_hora
```

TypeORM entity:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cosechas')
export class Cosecha {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  mesa_id!: string;

  @Column({ type: 'uuid' })
  tunel_id!: string;

  @Column({ type: 'int', default: 1 })
  posicion_al_momento!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_kg!: number;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'text', nullable: true, default: null })
  observaciones!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
```

### DTO Details

#### CreateCosechaDto

```typescript
mesa_id        @IsUUID()
peso_kg        @IsNumber() @Min(0.001) @Max(9999999.999)
observaciones  @IsOptional() @IsString() @MaxLength(2000)
```

#### QueryCosechasDto

```typescript
extends PageQueryDto
mesa_id?     @IsOptional() @IsUUID()
tunel_id?    @IsOptional() @IsUUID()
fecha_desde? @IsOptional() @IsISO8601()
fecha_hasta? @IsOptional() @IsISO8601()
sortBy?      @IsOptional() @IsString()
sortOrder?   @IsOptional() @IsIn(['ASC', 'DESC'])
```

### registrarCosecha — Full Algorithm

**PRE-TRANSACTION VALIDATIONS:**

1. `tenantId = this.tenancy.requireTenantId()`
2. `mesa = await this.mesasService.getMesaById(dto.mesa_id, tenantId)` — throws MESA_NOT_FOUND 404 if not found
3. Validate: `mesa.estado === MesaEstado.ACTIVA && mesa.posicion_actual === 1` → throw `COSECHA_MESA_NO_DISPONIBLE` 422 if not
4. `tunel_id = mesa.tunel_id` (from mesa directly; no separate tunnel lookup)

**TRANSACTION (QueryRunner):**

5. `qr = dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
6. INSERT cosecha:
   ```typescript
   const saved = await qr.manager.save(Cosecha, {
     tenant_id: tenantId,
     mesa_id: dto.mesa_id,
     tunel_id,
     posicion_al_momento: 1,
     fecha_hora: new Date(),
     peso_kg: dto.peso_kg,
     usuario_id: userId,
     observaciones: dto.observaciones ?? null,
   });
   ```
7. UPDATE mesa estado + posicion_actual:
   ```typescript
   await qr.query(
     `UPDATE mesas SET estado = 'en_cosecha', posicion_actual = NULL, updated_at = now() WHERE id = $1`,
     [dto.mesa_id],
   );
   ```
8. FIFO recalc — decrement all remaining mesas in tunnel:
   ```typescript
   await qr.query(
     `UPDATE mesas SET posicion_actual = posicion_actual - 1, updated_at = now()
      WHERE tunel_id = $1 AND posicion_actual > 1 AND deleted_at IS NULL`,
     [tunel_id],
   );
   ```
9. Write HistorialMesa:
   ```typescript
   await qr.manager.save(HistorialMesa, {
     mesa_id: dto.mesa_id,
     tipo_evento: HistorialTipoEvento.COSECHA,
     tenant_id: tenantId,
     usuario_id: userId,
     fecha_hora: new Date(),
     detalle: { cosecha_id: saved.id, peso_kg: dto.peso_kg },
   });
   ```
10. `await qr.commitTransaction()`
11. `catch → await qr.rollbackTransaction(); throw`
12. `finally → await qr.release()`

**POST-TRANSACTION:**

13. `await this.writeAudit('cosecha_registrada', 'cosecha', saved.id, auditReq, tenantId, 201)`

**RESPONSE (HTTP 201):**

```typescript
return ok({ cosecha: saved, mesa_id: dto.mesa_id, tunel_id, posicion_recalculada: true });
```

### listCosechas — Algorithm

1. `tenantId = this.tenancy.requireTenantId()`
2. `const { skip, limit } = clampPagination(q.page, q.limit, 200)`
3. QB on `cosechas` alias `c`:
   - Base: `.where('c.tenant_id = :tenantId', { tenantId })`
   - `mesa_id` filter: `.andWhere('c.mesa_id = :mesa_id', { mesa_id: q.mesa_id })`
   - `tunel_id` filter: `.andWhere('c.tunel_id = :tunel_id', { tunel_id: q.tunel_id })`
   - `fecha_desde` filter: `.andWhere('c.fecha_hora >= :fecha_desde', { fecha_desde: new Date(q.fecha_desde) })`
   - `fecha_hasta` filter: `.andWhere('c.fecha_hora <= :fecha_hasta', { fecha_hasta: new Date(q.fecha_hasta) })`
4. `.orderBy('c.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit)`
5. `getManyAndCount()` → return `{ items, total }`

### getCosechaById — Algorithm

1. `const cosecha = await this.cosechaRepo.findOne({ where: { id, tenant_id: tenantId } })`
2. If null → throw `COSECHA_NOT_FOUND` 404
3. Return `cosecha`

### getCosechasByMesa — Algorithm

1. `await this.mesasService.getMesaById(mesa_id, tenantId)` — throws MESA_NOT_FOUND 404 if not found
2. `const { skip, limit } = clampPagination(q.page, q.limit, 200)`
3. QB on `cosechas` alias `c`:
   - `.where('c.mesa_id = :mesa_id', { mesa_id })`
   - `.andWhere('c.tenant_id = :tenantId', { tenantId })`
   - `.orderBy('c.fecha_hora', 'DESC')`
   - `.skip(skip).take(limit)`
4. `getManyAndCount()` → return `{ items, total }`

### Controller Routes

| Method | Path | Roles Guard | HTTP Status | Handler |
|--------|------|-------------|-------------|---------|
| POST | `'cosecha'` | @Roles(operario, supervisor, admin_global) | 201 | `registrarCosecha()` |
| GET | `'cosecha'` | JwtAuthGuard (no roles restriction) | 200 | `listCosechas()` |
| GET | `'cosecha/:id'` | JwtAuthGuard (no roles restriction) | 200 | `getCosechaById()` |
| GET | `'mesas/:mesa_id/cosechas'` | JwtAuthGuard (no roles restriction) | 200 | `getCosechasByMesa()` |

All declared at class level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()` with no prefix.

**Note**: POST uses `@HttpCode(201)` explicitly (NestJS default for POST is 201 — explicit for clarity).

### Module Definition

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Cosecha]),  // HistorialMesa already registered in MesasModule — do NOT re-register
    TenancyModule,
    AuditModule,
    MesasModule,  // provides MesasService (getMesaById) + HistorialMesa entity in transaction context
  ],
  providers: [CosechaService],
  controllers: [CosechaController],
  exports: [CosechaService],  // M12 Packing will need cosecha_id linkage
})
export class CosechaModule {}
```

### Key Import Notes

- `HistorialMesa` and `HistorialTipoEvento` → import from `src/modules/mesas/entities/historial-mesa.entity`; used in `qr.manager.save()` inside transaction
- `MesasModule` exports `MesasService` and `HistorialMesaService` — `HistorialMesa` entity already registered in MesasModule; do NOT re-register in `TypeOrmModule.forFeature([])` here
- `MesaEstado` → import from `src/modules/mesas/entities/mesa.entity`
- `MesasService.getMesaById(id, tenantId)` → confirmed method at `mesas.service.ts:135`
- `clampPagination` → import from `src/common/query/query-utils`
- `auditLogPayload` → import from `src/common/audit/audit.util`

### Audit Constants

```typescript
export const AUDIT = {
  COSECHA: 'cosecha_registrada',
} as const;
```

## Migration

File: `migrations/1771200000000-CosechaInit.ts`

Summary:
- `CREATE TABLE cosechas` (plain, no deleted_at)
- PK: id (uuid)
- INDEXES: tenant_id, mesa_id, tunel_id, fecha_hora

## Complexity Tracking

No constitution violations. Plain `@Injectable()` service justified by multi-step QueryRunner transaction (INSERT cosecha + UPDATE mesa + bulk FIFO UPDATE + qr.manager.save HistorialMesa) requiring full atomicity and no shared base class overhead.
