# Data Model: M08 — Mesas (Greenhouse Tables)

**Branch**: `009-mesas-greenhouse-tables` | **Date**: 2026-06-05

## Entities

### Mesa (Growing Table)

**File**: `src/modules/mesas/entities/mesa.entity.ts`
**Table**: `mesas`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited |
| tenant_id | UUID | INDEX, nullable | — | inherited; from tenantContext |
| establecimiento_id | UUID | NOT NULL, INDEX | — | denormalized, immutable after creation; no FK |
| tunel_id | UUID | NOT NULL, INDEX | — | set at creation; updated by M10/M11 transplant |
| codigo_qr | VARCHAR(100) | NOT NULL, UNIQUE (global) | — | plain UUID v4 generated server-side; never from request body |
| posicion_actual | INTEGER | nullable | NULL | FIFO position in tunnel; NULL when estado = en_cosecha or baja |
| estado | ENUM(mesa_estado) | NOT NULL | 'activa' | Lifecycle: activa → en_cosecha (M11) → baja; reactivar: baja → activa |
| fecha_ultimo_trasplante | TIMESTAMPTZ | nullable | NULL | set by M10/M11 transplant flows only |
| plantas_estimadas | INTEGER | NOT NULL | 450 | planning estimate; updatable via PATCH |
| activo | BOOLEAN | NOT NULL | true | admin visibility flag; independent of estado |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**:
- `IDX_mesas_tenant_id` ON `mesas(tenant_id)`
- `IDX_mesas_establecimiento_id` ON `mesas(establecimiento_id)`
- `IDX_mesas_tunel_id` ON `mesas(tunel_id)`
- `IDX_mesas_estado` ON `mesas(estado)`
- `IDX_mesas_activo` ON `mesas(activo)`
- `UQ_mesas_codigo_qr` — `UNIQUE CONSTRAINT ON mesas(codigo_qr)` — global uniqueness
- `UQ_mesas_tunel_posicion` — `UNIQUE INDEX ON mesas(tunel_id, posicion_actual) WHERE posicion_actual IS NOT NULL` — prevents duplicate FIFO positions

**ENUM type**: `mesa_estado` — values: `'activa'`, `'en_cosecha'`, `'baja'`

---

### HistorialMesa (Table Event Log)

**File**: `src/modules/mesas/entities/historial-mesa.entity.ts`
**Table**: `historial_mesa`
**Note**: Does NOT extend `BaseEntity` — no `deleted_at` (immutable append-only log)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | |
| tenant_id | UUID | INDEX, nullable | — | from caller's tenantContext |
| mesa_id | UUID | NOT NULL, INDEX | — | FK → mesas.id (loose, no DB FK constraint) |
| tipo_evento | ENUM(historial_tipo_evento) | NOT NULL | — | event classification |
| fecha_hora | TIMESTAMPTZ | NOT NULL | now() | when the event occurred |
| detalle | JSONB | nullable | NULL | free-form event payload; schema varies by tipo_evento |
| usuario_id | UUID | NOT NULL, INDEX | — | actor who triggered the event |
| created_at | TIMESTAMPTZ | NOT NULL | now() | |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | |

**Indexes**:
- `IDX_historial_mesa_mesa_id` ON `historial_mesa(mesa_id)`
- `IDX_historial_mesa_tenant_id` ON `historial_mesa(tenant_id)`
- `IDX_historial_mesa_tipo_evento` ON `historial_mesa(tipo_evento)`
- `IDX_historial_mesa_fecha_hora` ON `historial_mesa(fecha_hora)`

**ENUM type**: `historial_tipo_evento` — values: `'trasplante'`, `'cosecha'`, `'cambio_posicion'`, `'aplicacion_quimica'`, `'reactivacion'`, `'baja'`

---

## State Machine — Mesa.estado

```
          ┌─────────────────────────────────┐
          │            activa               │
          │  (posicion_actual: 1..N)        │
          └──────┬──────────────────────────┘
                 │
    M11 sets     │ dar-de-baja
    en_cosecha   │ (supervisor/admin)
                 │
          ┌──────▼──────────────────────────┐
          │          en_cosecha             │
          │  (posicion_actual: NULL)        │
          └──────┬──────────────────────────┘
                 │
                 │ dar-de-baja (supervisor/admin)
                 │
          ┌──────▼──────────────────────────┐
          │             baja                │◄────────── dar-de-baja from activa
          │  (posicion_actual: NULL)        │            (supervisor/admin)
          └──────┬──────────────────────────┘
                 │
                 │ reactivar (supervisor/admin)
                 │
          ┌──────▼──────────────────────────┐
          │  activa (posicion_actual: NULL) │
          │  "pendiente de ubicar"          │
          │  M10 transplant assigns new pos │
          └─────────────────────────────────┘

Soft-delete: only allowed when estado = 'baja' (admin_global only)
```

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts` under `// mesas`:

```typescript
// mesas
MESA_NOT_FOUND: 'MESA_NOT_FOUND',
MESA_QR_NOT_FOUND: 'MESA_QR_NOT_FOUND',
MESA_ESTADO_INVALIDO: 'MESA_ESTADO_INVALIDO',
MESA_FIELD_IMMUTABLE: 'MESA_FIELD_IMMUTABLE',
MESA_SOLO_BAJA_DELETE: 'MESA_SOLO_BAJA_DELETE',
```

---

## Relationships

```
Tenant (tenant_id)
  │
  │ 1:N
  ▼
Establecimiento ◄──────────── Mesa (establecimiento_id, loose FK)
                               │  (immutable, denormalized)
                               │
Tunel ◄────────────────────── Mesa (tunel_id, loose FK)
  │                            │  (assigned at creation; M10/M11 can update)
  │ 1:N                        │ 1:N
  ▼                            ▼
Mesa.posicion_actual      HistorialMesa (mesa_id, loose FK)
(FIFO ordered per tunel)  (immutable append-only log)
                          Events written by:
                          - M08 (baja, reactivacion)
                          - M09 (aplicacion_quimica)
                          - M10 (trasplante, cambio_posicion)
                          - M11 (cosecha)
```

**No FK constraints at DB level** — loose coupling, same pattern as all prior modules (M01–M07).

---

## Migration

**File**: `migrations/1770900000000-MesasInit.ts`

### Up SQL

```sql
-- Step 1: ENUM types
CREATE TYPE "mesa_estado" AS ENUM ('activa', 'en_cosecha', 'baja');
CREATE TYPE "historial_tipo_evento" AS ENUM (
  'trasplante', 'cosecha', 'cambio_posicion',
  'aplicacion_quimica', 'reactivacion', 'baja'
);

-- Step 2: mesas table
CREATE TABLE "mesas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "establecimiento_id" uuid NOT NULL,
  "tunel_id" uuid NOT NULL,
  "codigo_qr" character varying(100) NOT NULL,
  "posicion_actual" integer,
  "estado" "mesa_estado" NOT NULL DEFAULT 'activa',
  "fecha_ultimo_trasplante" TIMESTAMP WITH TIME ZONE,
  "plantas_estimadas" integer NOT NULL DEFAULT 450,
  "activo" boolean NOT NULL DEFAULT true,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_mesas" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_mesas_codigo_qr" UNIQUE ("codigo_qr")
);

-- Step 3: mesas indexes
CREATE INDEX "IDX_mesas_tenant_id" ON "mesas" ("tenant_id");
CREATE INDEX "IDX_mesas_establecimiento_id" ON "mesas" ("establecimiento_id");
CREATE INDEX "IDX_mesas_tunel_id" ON "mesas" ("tunel_id");
CREATE INDEX "IDX_mesas_estado" ON "mesas" ("estado");
CREATE INDEX "IDX_mesas_activo" ON "mesas" ("activo");

-- Step 4: FIFO uniqueness (partial — only when posicion_actual IS NOT NULL)
CREATE UNIQUE INDEX "UQ_mesas_tunel_posicion"
  ON "mesas" ("tunel_id", "posicion_actual")
  WHERE "posicion_actual" IS NOT NULL;

-- Step 5: historial_mesa table
CREATE TABLE "historial_mesa" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "mesa_id" uuid NOT NULL,
  "tipo_evento" "historial_tipo_evento" NOT NULL,
  "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "detalle" jsonb,
  "usuario_id" uuid NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_historial_mesa" PRIMARY KEY ("id")
);

-- Step 6: historial_mesa indexes
CREATE INDEX "IDX_historial_mesa_mesa_id" ON "historial_mesa" ("mesa_id");
CREATE INDEX "IDX_historial_mesa_tenant_id" ON "historial_mesa" ("tenant_id");
CREATE INDEX "IDX_historial_mesa_tipo_evento" ON "historial_mesa" ("tipo_evento");
CREATE INDEX "IDX_historial_mesa_fecha_hora" ON "historial_mesa" ("fecha_hora");
```

### Down SQL

```sql
-- Reverse order: historial first, then mesas, then ENUMs
DROP INDEX "public"."IDX_historial_mesa_fecha_hora";
DROP INDEX "public"."IDX_historial_mesa_tipo_evento";
DROP INDEX "public"."IDX_historial_mesa_tenant_id";
DROP INDEX "public"."IDX_historial_mesa_mesa_id";
DROP TABLE "historial_mesa";

DROP INDEX "public"."UQ_mesas_tunel_posicion";
DROP INDEX "public"."IDX_mesas_activo";
DROP INDEX "public"."IDX_mesas_estado";
DROP INDEX "public"."IDX_mesas_tunel_id";
DROP INDEX "public"."IDX_mesas_establecimiento_id";
DROP INDEX "public"."IDX_mesas_tenant_id";
DROP TABLE "mesas";

DROP TYPE "historial_tipo_evento";
DROP TYPE "mesa_estado";
```
