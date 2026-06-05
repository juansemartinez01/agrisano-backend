# Data Model: M04 — Recetas (Nursery Recipes)

**Branch**: `004-recetas` | **Date**: 2026-06-04

## Entities

### Receta

**File**: `src/modules/recetas/entities/receta.entity.ts`
**Table**: `recetas`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited |
| tenant_id | UUID | INDEX, nullable | — | inherited; from tenantContext |
| establecimiento_id | UUID | NOT NULL, INDEX | — | immutable after creation; no FK constraint (loose coupling) |
| nombre | VARCHAR(150) | NOT NULL | — | unique per (tenant_id, establecimiento_id) among non-deleted |
| descripcion | TEXT | nullable | NULL | free-text notes |
| activo | BOOLEAN | NOT NULL | true | enables filtering; no default on list endpoint |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**:
- `IDX_recetas_tenant_id` ON `recetas(tenant_id)`
- `IDX_recetas_establecimiento_id` ON `recetas(establecimiento_id)`
- `IDX_recetas_activo` ON `recetas(activo)`
- `UQ_recetas_tenant_est_nombre` ON `recetas(tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL` — partial unique index

**TypeORM decorator pattern**:
```typescript
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

> **No FK constraint** on `establecimiento_id` — loose coupling, same pattern as `usuario_id` in siembras.
> **No `@Unique` decorator** — uniqueness lives in the migration partial index only.

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts` under `// recetas`:

```typescript
// recetas
RECETA_NOT_FOUND: 'RECETA_NOT_FOUND',
RECETA_NOMBRE_DUPLICADO: 'RECETA_NOMBRE_DUPLICADO',
RECETA_FIELD_IMMUTABLE: 'RECETA_FIELD_IMMUTABLE',
```

---

## Migration

**File**: `migrations/1770500000000-RecetasInit.ts`

```sql
-- Step 1: recetas table
CREATE TABLE "recetas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "establecimiento_id" uuid NOT NULL,
  "nombre" character varying(150) NOT NULL,
  "descripcion" text,
  "activo" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_recetas" PRIMARY KEY ("id")
);

-- Step 2: Indexes
CREATE INDEX "IDX_recetas_tenant_id" ON "recetas" ("tenant_id");
CREATE INDEX "IDX_recetas_establecimiento_id" ON "recetas" ("establecimiento_id");
CREATE INDEX "IDX_recetas_activo" ON "recetas" ("activo");

-- Step 3: Partial unique index (allows nombre reuse after soft-delete)
CREATE UNIQUE INDEX "UQ_recetas_tenant_est_nombre"
  ON "recetas" ("tenant_id", "establecimiento_id", "nombre")
  WHERE "deleted_at" IS NULL;
```

**Down**:
```sql
DROP INDEX "public"."UQ_recetas_tenant_est_nombre";
DROP INDEX "public"."IDX_recetas_activo";
DROP INDEX "public"."IDX_recetas_establecimiento_id";
DROP INDEX "public"."IDX_recetas_tenant_id";
DROP TABLE "recetas";
```

---

## Relationships

```
Tenant (tenant_id)
  │
  │ 1:N
  ▼
Establecimiento ◄──── Receta (establecimiento_id, loose FK)
                      (no FK constraint — loose coupling)
```

**Future**: M08 AplicacionQuimica will reference `receta_id` (FK → recetas.id). No guard in M04.
