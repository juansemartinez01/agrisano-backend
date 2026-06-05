# Data Model: M07 — Tuneles (Greenhouse Tunnels)

**Branch**: `008-tuneles-module` | **Date**: 2026-06-05

## Entities

### Tunel

**File**: `src/modules/tuneles/entities/tunel.entity.ts`
**Table**: `tuneles`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited |
| tenant_id | UUID | INDEX, nullable | — | inherited; from tenantContext |
| establecimiento_id | UUID | NOT NULL, INDEX | — | immutable after creation; no FK constraint (loose coupling) |
| nombre | VARCHAR(100) | NOT NULL | — | unique per (tenant_id, establecimiento_id) among non-deleted |
| capacidad_maxima | INTEGER | NOT NULL, CHECK > 0 | — | max tables this tunnel can hold; M08 metadata |
| activo | BOOLEAN | NOT NULL | true | enables filtering; no default on list endpoint |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**:
- `IDX_tuneles_tenant_id` ON `tuneles(tenant_id)`
- `IDX_tuneles_establecimiento_id` ON `tuneles(establecimiento_id)`
- `IDX_tuneles_activo` ON `tuneles(activo)`
- `UQ_tuneles_tenant_est_nombre` ON `tuneles(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` — partial unique index

**TypeORM decorator pattern**:
```typescript
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

> **No FK constraint** on `establecimiento_id` — loose coupling, same pattern as all prior modules.
> **No `@Unique` decorator** — uniqueness lives in the migration partial index only.

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts` under `// tuneles`:

```typescript
// tuneles
TUNEL_NOT_FOUND: 'TUNEL_NOT_FOUND',
TUNEL_NOMBRE_DUPLICADO: 'TUNEL_NOMBRE_DUPLICADO',
TUNEL_FIELD_IMMUTABLE: 'TUNEL_FIELD_IMMUTABLE',
```

---

## Migration

**File**: `migrations/1770800000000-TunelesInit.ts`

```sql
-- Step 1: tuneles table
CREATE TABLE "tuneles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "establecimiento_id" uuid NOT NULL,
  "nombre" character varying(100) NOT NULL,
  "capacidad_maxima" integer NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_tuneles" PRIMARY KEY ("id")
);

-- Step 2: Indexes
CREATE INDEX "IDX_tuneles_tenant_id" ON "tuneles" ("tenant_id");
CREATE INDEX "IDX_tuneles_establecimiento_id" ON "tuneles" ("establecimiento_id");
CREATE INDEX "IDX_tuneles_activo" ON "tuneles" ("activo");

-- Step 3: Partial unique index (allows nombre reuse after soft-delete)
CREATE UNIQUE INDEX "UQ_tuneles_tenant_est_nombre"
  ON "tuneles" ("tenant_id", "establecimiento_id", "nombre")
  WHERE "deleted_at" IS NULL;
```

**Down**:
```sql
DROP INDEX "public"."UQ_tuneles_tenant_est_nombre";
DROP INDEX "public"."IDX_tuneles_activo";
DROP INDEX "public"."IDX_tuneles_establecimiento_id";
DROP INDEX "public"."IDX_tuneles_tenant_id";
DROP TABLE "tuneles";
```

---

## Relationships

```
Tenant (tenant_id)
  │
  │ 1:N
  ▼
Establecimiento ◄──── Tunel (establecimiento_id, loose FK)
                      (no FK constraint — loose coupling)
                        │
                        │ 1:N (future)
                        ▼
                      Mesa (M08) — tunel_id references tuneles.id
                      (mesas retain tunel_id even after tunnel soft-delete)
```

**Future**: M08 Mesas will reference `tunel_id` (FK → tuneles.id). No guard in M07 — soft-delete proceeds unconditionally.
