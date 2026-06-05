# Data Model: M06 — Stock Movimientos

**Branch**: `006-stock-movimientos` | **Date**: 2026-06-05

## Entities

### MovimientoStock

**Table**: `movimientos_stock`

Plain TypeORM entity — does NOT extend BaseEntity. No `deleted_at`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| tenant_id | uuid | NULLABLE, INDEX | Nullable to match quimicos convention; always set in practice |
| quimico_id | uuid | NOT NULL, FK → quimicos(id) | Validated to belong to same tenant before insert |
| establecimiento_id | uuid | NOT NULL, INDEX | Denormalized from quimico at insert time |
| tipo | movimiento_tipo ENUM | NOT NULL | 'ingreso' \| 'egreso_manual' |
| cantidad | decimal(10,3) | NOT NULL | Must be > 0; validated in DTO |
| unidad_medida | varchar(30) | NOT NULL | Copied from quimico.unidad_medida at insert time |
| numero_remito | varchar(100) | NULLABLE | Invoice/receipt reference for traceability |
| observaciones | text | NULLABLE | Free-form notes |
| usuario_id | uuid | NOT NULL | Always from JWT req.user.sub |
| fecha | date | NOT NULL | Defaults to CURRENT_DATE if not provided |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

**Enum**:
```sql
CREATE TYPE movimiento_tipo AS ENUM ('ingreso', 'egreso_manual');
```

**Indexes**:
```sql
CREATE INDEX "IDX_movimientos_stock_tenant_id" ON movimientos_stock (tenant_id);
CREATE INDEX "IDX_movimientos_stock_quimico_id" ON movimientos_stock (quimico_id);
CREATE INDEX "IDX_movimientos_stock_establecimiento_id" ON movimientos_stock (establecimiento_id);
CREATE INDEX "IDX_movimientos_stock_tipo" ON movimientos_stock (tipo);
CREATE INDEX "IDX_movimientos_stock_fecha" ON movimientos_stock (fecha);
```

**Foreign Key**:
```sql
CONSTRAINT "FK_movimientos_stock_quimico"
  FOREIGN KEY (quimico_id) REFERENCES quimicos(id)
```

---

### Quimico (existing — modified field)

The `stock_actual decimal(10,3)` column already exists (created in migration 1770600000000-QuimicosInit). No schema change needed; only the runtime value is mutated by this module's transactions.

---

## Relationships

```
movimientos_stock ──── quimicos
  quimico_id (FK)     id (PK)
  N movements         1 quimico
```

Each Quimico has zero or more MovimientoStock records. The relationship is one-way: MovimientoStock holds the FK, Quimico does not declare a TypeORM `@OneToMany` (not needed for this module's queries).

---

## State & Lifecycle

MovimientoStock is append-only. No state transitions. The only lifecycle events are:

```
[CREATE] → persisted (immutable forever)
```

Quimico.stock_actual transitions:
```
ingreso:        stock_actual += cantidad  (atomic SQL)
egreso_manual:  stock_actual -= cantidad  (atomic SQL, may go negative)
```

---

## Validation Rules (DTO level)

| Field | Rule |
|-------|------|
| quimico_id | `@IsUUID()`, required |
| tipo | `@IsEnum(MovimientoTipo)`, required |
| cantidad | `@IsNumber()`, `@Min(0.001)` (must be > 0) |
| numero_remito | `@IsOptional()`, `@IsString()`, `@MaxLength(100)` |
| observaciones | `@IsOptional()`, `@IsString()` |
| fecha | `@IsOptional()`, `@IsDateString()` |

Fields NOT in CreateMovimientoDto (server-side only): unidad_medida, establecimiento_id, usuario_id, tenant_id.

---

## Query Filters (QueryMovimientosDto)

Extends `PageQueryDto` (page, limit).

| Field | Type | Applied as |
|-------|------|------------|
| quimico_id | uuid optional | `WHERE m.quimico_id = :qid` |
| establecimiento_id | uuid optional | `WHERE m.establecimiento_id = :eid` |
| tipo | enum optional | `WHERE m.tipo = :tipo` |
| fecha_desde | date string optional | `WHERE m.fecha >= :desde` |
| fecha_hasta | date string optional | `WHERE m.fecha <= :hasta` |
| sortBy | 'fecha' \| 'created_at' | ORDER BY (default: 'fecha') |
| sortOrder | 'ASC' \| 'DESC' | ORDER direction (default: 'DESC') |

No default filter — when no query params provided, all tenant movements are returned.
