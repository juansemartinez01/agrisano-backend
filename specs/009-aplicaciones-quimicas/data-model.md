# Data Model: M09 — Aplicaciones Químicas

## Entities Overview

```
aplicaciones_quimicas (1) ─── (N) aplicaciones_quimicas_detalle
aplicaciones_quimicas (1) ─── (N) aplicacion_quimica_bandeja
aplicaciones_quimicas (1) ─── (N) aplicacion_quimica_mesa
```

## Table: aplicaciones_quimicas

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| tenant_id | uuid | YES | — | Tenant scope |
| establecimiento_id | uuid | NO | — | Denormalized; validates tenant ownership |
| contexto | aplicacion_contexto | NO | — | ENUM: 'nursery' \| 'invernadero' |
| receta_id | uuid | YES | NULL | Only set for nursery applications |
| observaciones | text | YES | NULL | Free-text field |
| usuario_id | uuid | NO | — | From JWT, always server-side |
| fecha_hora | timestamptz | NO | now() | Server-set at transaction time |
| created_at | timestamptz | NO | now() | — |
| updated_at | timestamptz | NO | now() | — |

**Constraints:**
- No `deleted_at` — immutable once created
- Does NOT extend BaseEntity (plain TypeORM entity)
- `contexto=invernadero` → `receta_id` must be NULL (enforced at service layer)

**Indexes:**
- `IDX_aq_tenant_id` ON (tenant_id)
- `IDX_aq_establecimiento_id` ON (establecimiento_id)
- `IDX_aq_contexto` ON (contexto)
- `IDX_aq_fecha_hora` ON (fecha_hora DESC)
- `IDX_aq_receta_id` ON (receta_id) — supports receta filter

## Table: aplicaciones_quimicas_detalle

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| aplicacion_id | uuid | NO | — | FK → aplicaciones_quimicas(id) |
| quimico_id | uuid | NO | — | FK → quimicos(id) |
| cantidad | decimal(10,3) | NO | — | > 0; amount consumed |
| unidad_medida | varchar(30) | NO | — | Copied from quimico at application time |

**Constraints:**
- No `deleted_at`, no timestamps — immutable child record
- `unidad_medida` is snapshotted — never from request body

**Indexes:**
- `IDX_aqd_aplicacion_id` ON (aplicacion_id) — used by getAplicacionById
- `IDX_aqd_quimico_id` ON (quimico_id) — used by quimico_id filter on list

## Table: aplicacion_quimica_bandeja

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| aplicacion_id | uuid | NO | — | Part of composite PK; FK → aplicaciones_quimicas(id) |
| bandeja_id | uuid | NO | — | Part of composite PK |

**Constraints:**
- Composite PK: (aplicacion_id, bandeja_id)
- Only populated for `contexto=nursery` applications

**Indexes:**
- `IDX_aqb_bandeja_id` ON (bandeja_id) — used by getAplicacionesByBandeja

## Table: aplicacion_quimica_mesa

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| aplicacion_id | uuid | NO | — | Part of composite PK; FK → aplicaciones_quimicas(id) |
| mesa_id | uuid | NO | — | Part of composite PK |

**Constraints:**
- Composite PK: (aplicacion_id, mesa_id)
- Only populated for `contexto=invernadero` applications

**Indexes:**
- `IDX_aqm_mesa_id` ON (mesa_id) — used by getAplicacionesByMesa

## ENUM: aplicacion_contexto

```sql
CREATE TYPE "aplicacion_contexto" AS ENUM ('nursery', 'invernadero');
```

## Cross-Module References (not FK'd in DB, enforced at service layer)

| Field | Resolves To | Validation |
|-------|-------------|------------|
| establecimiento_id | establecimientos.id | mustFindById + same tenant |
| quimico_id | quimicos.id | mustFindById + same tenant + same establecimiento |
| bandeja_id | bandejas.id | getBandeja + estado=en_nursery + same establecimiento |
| mesa_id | mesas.id | getMesaById + estado∈{activa,en_cosecha} + same establecimiento |
| receta_id | recetas.id | mustFindById + same tenant (if provided, nursery only) |

## Stock Decrement Pattern

For each chemical detalle in the transaction:
```sql
UPDATE quimicos
SET stock_actual = stock_actual - $1, updated_at = now()
WHERE id = $2 AND tenant_id = $3
```
This is an atomic SQL subtraction — not a read-then-write — preventing race conditions.

## HistorialMesa Write (invernadero only, inside QueryRunner)

For each mesa in an invernadero application:
```typescript
qr.manager.save(HistorialMesa, {
  mesa_id: mesaId,
  tipo_evento: HistorialTipoEvento.APLICACION_QUIMICA,
  tenant_id: tenantId,
  usuario_id: userId,
  fecha_hora: new Date(),
  detalle: {
    aplicacion_id: aplicacion.id,
    quimicos: detalles.map(d => ({ quimico_id: d.quimico_id, cantidad: d.cantidad }))
  }
})
```
Uses `HistorialMesa` entity imported from `src/modules/mesas/entities/historial-mesa.entity`. Written inside the QueryRunner — NOT via `HistorialMesaService.writeEvent()`.

## Stock Warning Shape

```typescript
interface StockWarning {
  quimico_id: string;
  nombre: string;
  projected_stock: number; // negative number
}
```

Computed before opening the transaction. Returned in POST response regardless of sign.
