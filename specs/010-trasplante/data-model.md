# Data Model: M10 — Trasplante

## New Entities

### MesaBandeja

**Table**: `mesa_bandeja`
**Module**: `src/modules/trasplante/entities/mesa-bandeja.entity.ts`
**Type**: Plain entity — no BaseEntity, no deleted_at, immutable once written

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| mesa_id | uuid | NOT NULL, PK (part 1) | FK → mesas(id) |
| bandeja_id | uuid | NOT NULL, PK (part 2) | FK → bandejas(id) |
| fecha_trasplante | timestamptz | NOT NULL DEFAULT now() | Set server-side inside transaction |

**Composite PK**: (mesa_id, bandeja_id)

**Indexes**:
- `IDX_mb_mesa_id` ON mesa_id — supports GET /mesas/:id/trasplantes
- `IDX_mb_bandeja_id` ON bandeja_id — supports reverse bandeja lookup

**Notes**:
- One row per bandeja per transplant into that mesa
- A mesa may accumulate many MesaBandeja rows across its lifecycle (multiple transplant cycles)
- No update or delete — immutable join record

## Modified Entities

### Mesa (existing — src/modules/mesas/entities/mesa.entity.ts)

Fields modified by the transplant transaction (via raw SQL inside QueryRunner — no TypeORM entity write):

| Field | Change | Trigger |
|-------|--------|---------|
| estado | SET 'activa' | Any transplant |
| posicion_actual | SET MAX(tunnel)+1 | Any transplant |
| tunel_id | SET dto.tunel_id | Any transplant |
| fecha_ultimo_trasplante | SET now() | Any transplant |

### Bandeja (existing — src/modules/siembra/entities/bandeja.entity.ts)

Fields modified by the transplant transaction (via raw SQL inside QueryRunner):

| Field | Change | Trigger |
|-------|--------|---------|
| estado | SET 'trasplantada' | Each bandeja in transplant |
| mesa_id | SET dto.mesa_id | Each bandeja in transplant |
| fecha_trasplante | SET now() | Each bandeja in transplant |

## Inserted Records (per transplant operation)

| Table | Count | Notes |
|-------|-------|-------|
| mesa_bandeja | N rows | One per bandeja_id in request |
| historial_mesa | 1 row | tipo_evento='trasplante', detalle includes tunel_id, posicion_actual, bandeja_ids |

## State Transitions

### Mesa state machine (transplant path)

```
en_cosecha → activa (posicion_actual=MAX+1, tunel_id=dto.tunel_id)
activa (posicion_actual=NULL) → activa (posicion_actual=MAX+1, tunel_id=dto.tunel_id)
```

Rejected states (TRASPLANTE_MESA_ESTADO_INVALIDO 422):
- activa with posicion_actual IS NOT NULL (already positioned in a tunnel)
- baja

### Bandeja state machine (transplant path)

```
en_nursery → trasplantada (mesa_id=dto.mesa_id, fecha_trasplante=now())
```

Rejected states (TRASPLANTE_BANDEJA_INVALIDA 422):
- trasplantada (already transplanted)

## Validation Rules

| Rule | Error Code | HTTP |
|------|-----------|------|
| mesa not found or wrong tenant | MESA_NOT_FOUND | 404 |
| mesa not in transplantable state | TRASPLANTE_MESA_ESTADO_INVALIDO | 422 |
| tunel not found | TUNEL_NOT_FOUND | 404 |
| tunel.establecimiento_id ≠ mesa.establecimiento_id | TRASPLANTE_ESTABLECIMIENTO_MISMATCH | 422 |
| bandeja not found | BANDEJA_NOT_FOUND | 404 |
| bandeja.estado ≠ en_nursery OR bandeja.establecimiento_id ≠ mesa.establecimiento_id | TRASPLANTE_BANDEJA_INVALIDA | 422 |
| bandeja_ids is empty | DTO @ArrayMinSize(1) | 400 |
