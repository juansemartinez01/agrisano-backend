# Data Model: M02 — Lotes

**Branch**: `002-lotes` | **Date**: 2026-06-04

## Entities

### Lote

**File**: `src/modules/lotes/entities/lote.entity.ts`
**Table**: `lotes`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited from BaseEntity |
| tenant_id | UUID | INDEX, nullable | — | inherited; set from tenantContext |
| tipo | lote_tipo ENUM | NOT NULL | — | values: 'semilla', 'sustrato'; immutable after creation |
| numero_lote | VARCHAR(100) | NOT NULL | — | supplier lot identifier |
| proveedor | VARCHAR(200) | nullable | NULL | supplier name |
| observaciones | TEXT | nullable | NULL | free-text notes |
| activo | BOOLEAN | NOT NULL | true | soft-disable; distinct from soft-delete |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**TypeORM decorator pattern**:
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

**Indexes**:
- `IDX_lotes_tenant_id` on (`tenant_id`)
- `IDX_lotes_tipo` on (`tipo`)
- `IDX_lotes_activo` on (`activo`)
- `UQ_lotes_tenant_tipo_numero` — PARTIAL UNIQUE on (`tenant_id`, `tipo`, `numero_lote`) WHERE `deleted_at IS NULL`

> **Note**: The partial unique index cannot be expressed via TypeORM decorators. It is created exclusively in the migration with raw SQL.

---

## Enum Type

**PostgreSQL type**: `lote_tipo`
**Values**: `'semilla'`, `'sustrato'`
**Created in migration** before the table creation.
**Down migration**: drop table first, then drop the type.

---

## State Transitions

### Lote.activo

```
CREATE (activo=true)
  │
  │ PATCH activo=false (supervisor, admin_global)
  ▼
activo=false  ← deactivated; still counts toward uniqueness
  │
  │ PATCH activo=true (reactivation)
  ▼
activo=true
  │
  │ DELETE (admin_global, no bandeja reference)
  ▼
deleted_at IS NOT NULL  ← soft-deleted; excluded from uniqueness check
```

**Key distinctions**:
- `activo=false`: lot is "disabled" but not deleted; still blocks duplicate `numero_lote`
- `deleted_at IS NOT NULL`: lot is soft-deleted; no longer blocks duplicate `numero_lote`

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts` under `// lotes`:

```typescript
LOTE_NOT_FOUND: 'LOTE_NOT_FOUND',
LOTE_NUMERO_DUPLICADO: 'LOTE_NUMERO_DUPLICADO',
LOTE_REFERENCED_BY_BANDEJA: 'LOTE_REFERENCED_BY_BANDEJA',
LOTE_TIPO_IMMUTABLE: 'LOTE_TIPO_IMMUTABLE',
```

---

## Migration

**File**: `migrations/1770300000000-LotesInit.ts`

```sql
-- Step 1: Create enum type
CREATE TYPE "lote_tipo" AS ENUM ('semilla', 'sustrato');

-- Step 2: Create lotes table
CREATE TABLE "lotes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "tipo" "lote_tipo" NOT NULL,
  "numero_lote" VARCHAR(100) NOT NULL,
  "proveedor" VARCHAR(200),
  "observaciones" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_lotes" PRIMARY KEY ("id")
);

-- Step 3: Regular indexes
CREATE INDEX "IDX_lotes_tenant_id" ON "lotes" ("tenant_id");
CREATE INDEX "IDX_lotes_tipo" ON "lotes" ("tipo");
CREATE INDEX "IDX_lotes_activo" ON "lotes" ("activo");

-- Step 4: Partial unique index (soft-delete compatible)
CREATE UNIQUE INDEX "UQ_lotes_tenant_tipo_numero"
  ON "lotes" ("tenant_id", "tipo", "numero_lote")
  WHERE "deleted_at" IS NULL;
```

**Down**:
```sql
DROP INDEX "public"."UQ_lotes_tenant_tipo_numero";
DROP INDEX "public"."IDX_lotes_activo";
DROP INDEX "public"."IDX_lotes_tipo";
DROP INDEX "public"."IDX_lotes_tenant_id";
DROP TABLE "lotes";
DROP TYPE "lote_tipo";
```
