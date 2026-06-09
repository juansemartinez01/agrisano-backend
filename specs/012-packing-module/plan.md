# Implementation Plan: M12 — Packing (Lote Packing)

**Branch**: `013-packing-module` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-packing-module/spec.md`

## Summary

Register the packing result for a harvest (cosecha) atomically: INSERT lote_packing record and INSERT 1–3 lote_packing_categoria records inside a single QueryRunner transaction. Pre-transaction guards validate cosecha ownership, duplicate-category values, and uniqueness of cosecha_id. Exposes four endpoints (one write, three read-only). Returns HTTP 201. PackingService is a plain `@Injectable()` with no base class. PackingController uses `@Controller()` with no prefix — all routes are explicit full paths.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS 10.x)

**Primary Dependencies**: NestJS, TypeORM, class-validator, passport-jwt

**Storage**: PostgreSQL via TypeORM DataSource + QueryRunner for atomic multi-step transactions

**Testing**: Manual integration via REST (no new test files required per project pattern)

**Target Platform**: Linux server (same environment as M01-M11)

**Project Type**: NestJS REST API module

**Performance Goals**: Packing registration completes within 2 seconds under normal load (1 LotePacking + up to 3 LotePackingCategoria inserts)

**Constraints**: No new npm packages; strict TypeScript (no `any`); no modifications to existing modules except `error-codes.ts` and `app.module.ts`; records are immutable once written (no update/delete, no deleted_at)

**Scale/Scope**: One packing record per cosecha; read endpoints paginated up to 200 records

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ | PackingService is plain @Injectable() — multi-step atomic QueryRunner transaction justifies no base class; matches M09–M11 pattern |
| II. Multi-Tenancy | ✅ | tenancy.requireTenantId() on all paths; cosecha ownership validated via CosechaService; reads scoped via tenant_id WHERE clause |
| III. Error Handling | ✅ | 3 new ErrorCodes (PACKING_NOT_FOUND, PACKING_YA_REGISTRADO, PACKING_CATEGORIA_DUPLICADA); AppError used for all domain failures |
| IV. Audit | ✅ | AuditService.write() post-transaction with action `packing_registrado` |
| V. Roles | ✅ | JwtAuthGuard + RolesGuard; write: operario/supervisor/admin_global; read: all authenticated |
| VI. Transactions | ✅ | Full QueryRunner: INSERT lote_packing + INSERT lote_packing_categorias (loop) — commit or full rollback |
| VII. API Responses | ✅ | ok() and page() used exclusively; HTTP 201 on POST |
| VIII. Code Quality | ✅ | Strict types; class-validator on DTOs; no `any` |
| IX. Modules | ✅ | Single module src/modules/packing/ |
| X. Small Steps | ✅ | M11 fully implemented; M12 is next isolated step |

## Project Structure

### Documentation (this feature)

```text
specs/012-packing-module/
├── plan.md              ← this file
├── data-model.md        ← entity details
├── contracts/
│   └── api-spec.json    ← endpoint contracts
└── tasks.md             ← /speckit-tasks output (not yet)
```

### Source Code

```text
src/modules/packing/
├── entities/
│   ├── lote-packing.entity.ts           ← plain entity, no BaseEntity, no deleted_at
│   └── lote-packing-categoria.entity.ts ← plain entity, no BaseEntity
├── dto/
│   ├── create-packing.dto.ts            ← includes categorias[] nested DTO
│   └── query-packing.dto.ts             ← extends PageQueryDto
├── packing.service.ts                   ← plain @Injectable()
├── packing.controller.ts                ← @Controller() no prefix
└── packing.module.ts

migrations/
└── 1771300000000-PackingInit.ts         ← created in plan phase

src/common/errors/
└── error-codes.ts   ← add 3 new codes (// packing block)

src/app.module.ts    ← add PackingModule import
```

## Implementation Details

### Error Codes to Add (error-codes.ts)

Add after the `// cosecha` block:

```typescript
// packing
PACKING_NOT_FOUND: 'PACKING_NOT_FOUND',
PACKING_YA_REGISTRADO: 'PACKING_YA_REGISTRADO',
PACKING_CATEGORIA_DUPLICADA: 'PACKING_CATEGORIA_DUPLICADA',
```

### Entity Details

#### LotePacking (plain entity — no BaseEntity, no deleted_at)

```
Table: lotes_packing
Columns:
  id              uuid             NOT NULL DEFAULT gen_random_uuid()  ← PK
  tenant_id       uuid             NULL
  cosecha_id      uuid             NOT NULL  UNIQUE
  fecha_hora      timestamptz      NOT NULL DEFAULT now()
  peso_bruto_kg   numeric(10,3)    NOT NULL  CHECK (peso_bruto_kg > 0)
  usuario_id      uuid             NOT NULL
  observaciones   text             NULL
  created_at      timestamptz      NOT NULL DEFAULT now()
  updated_at      timestamptz      NOT NULL DEFAULT now()
  PK: (id)
  UNIQUE: (cosecha_id)
  INDEXES: (tenant_id, cosecha_id)
```

TypeORM entity:

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('lotes_packing')
export class LotePacking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid', unique: true })
  cosecha_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_bruto_kg!: number;

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

#### LotePackingCategoria (plain entity — no BaseEntity)

```
Table: lotes_packing_categorias
Columns:
  id                    uuid          NOT NULL DEFAULT gen_random_uuid()  ← PK
  lote_packing_id       uuid          NOT NULL  FK → lotes_packing(id)
  categoria             varchar(10)   NOT NULL  (enum: primera|segunda|descarte)
  peso_kg               numeric(10,3) NOT NULL  CHECK (peso_kg > 0)
  cantidad_cajas        integer       NOT NULL  CHECK (cantidad_cajas > 0)
  peso_neto_por_caja    numeric(10,3) NOT NULL  CHECK (peso_neto_por_caja > 0)
  PK: (id)
  INDEX: (lote_packing_id)
```

TypeORM entity:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum CategoriaPackingEnum {
  PRIMERA = 'primera',
  SEGUNDA = 'segunda',
  DESCARTE = 'descarte',
}

@Entity('lotes_packing_categorias')
export class LotePackingCategoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  lote_packing_id!: string;

  @Column({ type: 'varchar', length: 10 })
  categoria!: CategoriaPackingEnum;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_kg!: number;

  @Column({ type: 'int' })
  cantidad_cajas!: number;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_neto_por_caja!: number;
}
```

### DTO Details

#### CreatePackingCategoriaDto (nested)

```typescript
categoria          @IsEnum(CategoriaPackingEnum)
peso_kg            @IsNumber() @Min(0.001) @Max(9999999.999)
cantidad_cajas     @IsInt() @Min(1)
peso_neto_por_caja @IsNumber() @Min(0.001) @Max(9999999.999)
```

#### CreatePackingDto

```typescript
cosecha_id     @IsUUID()
peso_bruto_kg  @IsNumber() @Min(0.001) @Max(9999999.999)
observaciones  @IsOptional() @IsString() @MaxLength(1000)
categorias     @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => CreatePackingCategoriaDto)
```

#### QueryPackingDto

```typescript
extends PageQueryDto
cosecha_id?   @IsOptional() @IsUUID()
sortBy?       @IsOptional() @IsString()
sortOrder?    @IsOptional() @IsIn(['ASC', 'DESC'])
```

### registrarPacking — Full Algorithm

**PRE-TRANSACTION VALIDATIONS:**

1. `tenantId = this.tenancy.requireTenantId()`
2. `await this.cosechaService.getCosechaById(dto.cosecha_id, tenantId)` — throws `COSECHA_NOT_FOUND` 404 if cosecha does not exist or belongs to different tenant
3. Duplicate-category check:
   ```typescript
   const categorias = dto.categorias.map(c => c.categoria);
   if (new Set(categorias).size !== categorias.length) {
     throw new AppError(ErrorCodes.PACKING_CATEGORIA_DUPLICADA, 422);
   }
   ```
4. Uniqueness pre-check:
   ```typescript
   const existing = await this.lotePackingRepo.findOne({ where: { cosecha_id: dto.cosecha_id } });
   if (existing) throw new AppError(ErrorCodes.PACKING_YA_REGISTRADO, 409);
   ```

**TRANSACTION (QueryRunner):**

5. `qr = dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
6. INSERT lote_packing:
   ```typescript
   const saved = await qr.manager.save(LotePacking, {
     tenant_id: tenantId,
     cosecha_id: dto.cosecha_id,
     fecha_hora: new Date(),
     peso_bruto_kg: dto.peso_bruto_kg,
     usuario_id: userId,
     observaciones: dto.observaciones ?? null,
   });
   ```
7. INSERT all categorias:
   ```typescript
   const savedCategorias = await qr.manager.save(
     LotePackingCategoria,
     dto.categorias.map(c => ({
       lote_packing_id: saved.id,
       categoria: c.categoria,
       peso_kg: c.peso_kg,
       cantidad_cajas: c.cantidad_cajas,
       peso_neto_por_caja: c.peso_neto_por_caja,
     })),
   );
   ```
8. `await qr.commitTransaction()`
9. `catch → await qr.rollbackTransaction(); throw`
10. `finally → await qr.release()`

**POST-TRANSACTION:**

11. `await this.auditService.write('packing_registrado', 'lote_packing', saved.id, auditReq, tenantId, 201)`

**RESPONSE (HTTP 201):**

```typescript
return ok({ lote_packing: saved, categorias: savedCategorias });
```

### getPackingById — Algorithm

1. `const lp = await this.lotePackingRepo.findOne({ where: { id, tenant_id: tenantId } })`
2. If null → throw `PACKING_NOT_FOUND` 404
3. `const categorias = await this.categoriaRepo.find({ where: { lote_packing_id: id } })`
4. Return `ok({ lote_packing: lp, categorias })`

### getPackingByCosecha — Algorithm

1. `await this.cosechaService.getCosechaById(cosecha_id, tenantId)` — validates cosecha exists in tenant
2. `const lp = await this.lotePackingRepo.findOne({ where: { cosecha_id, tenant_id: tenantId } })`
3. If null → throw `PACKING_NOT_FOUND` 404
4. `const categorias = await this.categoriaRepo.find({ where: { lote_packing_id: lp.id } })`
5. Return `ok({ lote_packing: lp, categorias })`

### listPacking — Algorithm

1. `tenantId = this.tenancy.requireTenantId()`
2. `const { skip, limit } = clampPagination(q.page, q.limit, 200)`
3. QB on `lotes_packing` alias `lp`:
   - Base: `.where('lp.tenant_id = :tenantId', { tenantId })`
   - `cosecha_id` filter: `.andWhere('lp.cosecha_id = :cosecha_id', { cosecha_id: q.cosecha_id })`
4. `.orderBy('lp.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit)`
5. `getManyAndCount()` → return `page({ items, total, page: q.page, limit })`

### Controller Routes

| Method | Path | Roles Guard | HTTP Status | Handler |
|--------|------|-------------|-------------|---------|
| POST | `'packing'` | @Roles(operario, supervisor, admin_global) | 201 | `registrarPacking()` |
| GET | `'packing'` | JwtAuthGuard (no roles restriction) | 200 | `listPacking()` |
| GET | `'packing/:id'` | JwtAuthGuard (no roles restriction) | 200 | `getPackingById()` |
| GET | `'cosechas/:cosecha_id/packing'` | JwtAuthGuard (no roles restriction) | 200 | `getPackingByCosecha()` |

All declared at class level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()` with no prefix.

**Note**: POST uses `@HttpCode(201)` explicitly.

### Module Definition

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([LotePacking, LotePackingCategoria]),
    TenancyModule,
    AuditModule,
    CosechaModule,   // provides CosechaService (getCosechaById)
  ],
  providers: [PackingService],
  controllers: [PackingController],
  exports: [],
})
export class PackingModule {}
```

### Key Import Notes

- `CosechaService.getCosechaById(id, tenantId)` — exported from `CosechaModule`
- `clampPagination` → import from `src/common/query/query-utils`
- `auditLogPayload` → import from `src/common/audit/audit.util`
- `ok`, `page` → import from `src/common/http/api-response`
- `AppError`, `ErrorCodes` → import from `src/common/errors/`
- `TenancyService` → import from `TenancyModule`

### Audit Constants

```typescript
export const AUDIT = {
  PACKING: 'packing_registrado',
} as const;
```

## Migration

File: `migrations/1771300000000-PackingInit.ts`

Summary:
- `CREATE TABLE lotes_packing` (plain, no deleted_at, UNIQUE cosecha_id)
- `CREATE TABLE lotes_packing_categorias` (categoria stored as varchar(10))
- INDEXES: `lotes_packing(tenant_id, cosecha_id)`, `lotes_packing_categorias(lote_packing_id)`

## Complexity Tracking

No constitution violations. Plain `@Injectable()` service justified by multi-step QueryRunner transaction (INSERT lote_packing + loop INSERT lote_packing_categorias) requiring full atomicity and pre-transaction validation guards. No shared base class overhead needed.
