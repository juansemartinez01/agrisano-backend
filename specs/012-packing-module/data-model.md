# Data Model: M12 — Packing (Lote Packing)

## Overview

Two new tables: `lotes_packing` (one per cosecha, UNIQUE cosecha_id) and `lotes_packing_categorias` (1–3 rows per lote_packing). No soft-delete, no BaseEntity inheritance.

## Entities

### LotePacking

**Table**: `lotes_packing`

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| id | uuid | NOT NULL | PK, DEFAULT gen_random_uuid() | |
| tenant_id | uuid | NULL | — | Multi-tenancy scope |
| cosecha_id | uuid | NOT NULL | UNIQUE | One packing per cosecha |
| fecha_hora | timestamptz | NOT NULL | DEFAULT now() | Server-set on creation |
| peso_bruto_kg | numeric(10,3) | NOT NULL | CHECK > 0 | Total gross weight |
| usuario_id | uuid | NOT NULL | — | From JWT, never from body |
| observaciones | text | NULL | — | Optional notes |
| created_at | timestamptz | NOT NULL | DEFAULT now() | Auto-managed |
| updated_at | timestamptz | NOT NULL | DEFAULT now() | Auto-managed |

**Indexes**:
- `IDX_lotes_packing_tenant_id` on `(tenant_id)`
- `IDX_lotes_packing_cosecha_id` on `(cosecha_id)` — also enforces UNIQUE constraint

**Relationships**:
- References `cosechas(id)` via `cosecha_id` (logical FK, not enforced at DB level per project pattern)

---

### LotePackingCategoria

**Table**: `lotes_packing_categorias`

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| id | uuid | NOT NULL | PK, DEFAULT gen_random_uuid() | |
| lote_packing_id | uuid | NOT NULL | — | FK → lotes_packing(id) |
| categoria | varchar(10) | NOT NULL | IN ('primera','segunda','descarte') | Quality tier |
| peso_kg | numeric(10,3) | NOT NULL | CHECK > 0 | Weight in this category |
| cantidad_cajas | integer | NOT NULL | CHECK > 0 | Box count |
| peso_neto_por_caja | numeric(10,3) | NOT NULL | CHECK > 0 | Net weight per box |

**Indexes**:
- `IDX_lotes_packing_categorias_lote_packing_id` on `(lote_packing_id)`

**Constraints**:
- 1–3 rows per `lote_packing_id`
- No two rows share the same `(lote_packing_id, categoria)` — enforced at service layer before transaction

---

## Enum

**CategoriaPackingEnum** (TypeScript / column values):
- `primera` — highest quality tier
- `segunda` — second quality tier
- `descarte` — discard/waste tier

Stored as `varchar(10)` in the database (not a native PostgreSQL ENUM type, to avoid migration complexity on enum changes).

---

## Entity Relationships

```
cosechas (1) ─────────────── (0..1) lotes_packing
                                          │
                                      (1..3)
                               lotes_packing_categorias
```

- One `cosecha` → zero or one `lote_packing` (enforced by UNIQUE on `cosecha_id`)
- One `lote_packing` → one to three `lote_packing_categorias` (enforced at service layer)

---

## Creation Rules

1. `cosecha_id` must reference an existing cosecha in the same tenant — validated via `CosechaService.getCosechaById()` before the transaction
2. Duplicate `categoria` values within the same request are rejected with `PACKING_CATEGORIA_DUPLICADA` (422) before the transaction opens
3. Existing packing for the same `cosecha_id` is rejected with `PACKING_YA_REGISTRADO` (409) before the transaction opens
4. LotePacking and all LotePackingCategorias are inserted in a single atomic transaction (QueryRunner)
5. `fecha_hora` is set to `new Date()` at insertion time — never from the request body
6. `usuario_id` is taken from the JWT — never from the request body

---

## Immutability

Records in both tables are immutable after creation:
- No UPDATE endpoints
- No DELETE endpoints
- No `deleted_at` column (no soft-delete)
