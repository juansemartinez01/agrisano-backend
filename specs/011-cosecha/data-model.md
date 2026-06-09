# Data Model: M11 — Cosecha (Harvest)

## Entity: Cosecha

**Table**: `cosechas`
**Module**: `src/modules/cosecha/entities/cosecha.entity.ts`
**Type**: Plain TypeORM entity — no `BaseEntity`, no `deleted_at` (immutable by design)

### Columns

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `tenant_id` | uuid | YES | null | Tenant scope; null for global seeds |
| `mesa_id` | uuid | NO | — | FK → mesas(id); mesa at time of harvest |
| `tunel_id` | uuid | NO | — | Denormalized from `mesa.tunel_id` at harvest time |
| `posicion_al_momento` | int | NO | 1 | Always 1 — set server-side; only position-1 mesas can be harvested |
| `fecha_hora` | timestamptz | NO | `now()` | Harvest timestamp — set server-side |
| `peso_kg` | decimal(10,3) | NO | — | Harvested weight in kg; must be > 0 |
| `usuario_id` | uuid | NO | — | Operator who registered harvest; sourced from JWT |
| `observaciones` | text | YES | null | Optional free-form notes |
| `created_at` | timestamptz | NO | `now()` | Auto-managed by TypeORM `@CreateDateColumn` |
| `updated_at` | timestamptz | NO | `now()` | Auto-managed by TypeORM `@UpdateDateColumn` |

### Constraints

- `PK_cosechas`: PRIMARY KEY (`id`)
- `CHK_cosechas_peso`: `peso_kg > 0` (enforced at DTO validation layer)
- No unique constraints — the same mesa can be harvested multiple times across its lifecycle (each retransplant–cosecha cycle creates a new record)
- No foreign-key constraints in migration (consistent with project pattern of not enforcing FK at DB level)

### Indexes

| Name | Column(s) | Purpose |
|------|-----------|---------|
| `IDX_cosechas_tenant_id` | `tenant_id` | Tenant scoping on list queries |
| `IDX_cosechas_mesa_id` | `mesa_id` | Filter / GET /mesas/:id/cosechas |
| `IDX_cosechas_tunel_id` | `tunel_id` | Filter by tunnel on list endpoint |
| `IDX_cosechas_fecha_hora` | `fecha_hora` | Date-range filtering + default sort |

### Lifecycle

```
[Mesa estado=activa, posicion_actual=1]
            │
     POST /cosecha
            │
     ┌──────▼──────────────────────────────────────────────────────┐
     │ ATOMIC TRANSACTION                                          │
     │  1. INSERT cosechas (this record)                           │
     │  2. UPDATE mesas SET estado='en_cosecha', posicion_actual=NULL│
     │  3. UPDATE mesas SET posicion_actual-=1 WHERE posicion>1    │
     │  4. INSERT historial_mesa tipo_evento='cosecha'             │
     └──────────────────────────────────────────────────────────────┘
            │
     [Cosecha record created — immutable]
            │
     [Mesa estado=en_cosecha, posicion_actual=NULL]
            │
     [Awaits retransplant via M10 — out of scope here]
```

## Referenced Entities (not owned by this module)

### Mesa

**Module**: `src/modules/mesas/entities/mesa.entity.ts`
**State transition**: `activa (posicion_actual=1)` → `en_cosecha (posicion_actual=NULL)` during harvest

Fields read at harvest time:
- `estado` — must be `activa`
- `posicion_actual` — must be `1`
- `tunel_id` — denormalized onto Cosecha

### HistorialMesa

**Module**: `src/modules/mesas/entities/historial-mesa.entity.ts`
**Entry written**: `tipo_evento = HistorialTipoEvento.COSECHA ('cosecha')`
**Written inside transaction** via `qr.manager.save(HistorialMesa, { ... })`

Payload stored in `detalle` (JSONB):
```json
{
  "cosecha_id": "<uuid>",
  "peso_kg": 1.250
}
```

## State Diagram: Mesa During Harvest Cycle

```
activa (posicion_actual=1)
        │
        │  POST /cosecha  [M11]
        ▼
en_cosecha (posicion_actual=NULL)
        │
        │  POST /trasplante  [M10]
        ▼
activa (posicion_actual=MAX+1 in new tunnel)
```

## FIFO Queue Effect

Before harvest (tunnel with 3 mesas):

| mesa_id | posicion_actual | estado |
|---------|----------------|--------|
| A | 1 | activa |
| B | 2 | activa |
| C | 3 | activa |

After harvesting mesa A:

| mesa_id | posicion_actual | estado |
|---------|----------------|--------|
| A | NULL | en_cosecha |
| B | 1 | activa |
| C | 2 | activa |

Mesa B is now at position 1 — next to harvest.
