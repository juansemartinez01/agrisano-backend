# Data Model: M05 — Quimicos y Principios Activos

**Date**: 2026-06-04 | **Branch**: `005-quimicos-principios-activos`

## Entities

### Quimico

**Table**: `quimicos`  
**Base**: Extends `BaseEntity` (id, tenant_id, created_at, updated_at, deleted_at)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | from BaseEntity |
| tenant_id | uuid | nullable, INDEX | from BaseEntity |
| establecimiento_id | uuid | NOT NULL | scoped to establishment; immutable after creation |
| nombre | varchar(150) | NOT NULL | unique per (tenant_id, establecimiento_id) among non-deleted |
| unidad_medida | varchar(30) | NOT NULL | free text; e.g. 'L', 'kg', 'mL', 'g', 'unidad' |
| stock_actual | decimal(10,3) | NOT NULL, DEFAULT 0 | read-only from this module; managed by M07/M08 |
| activo | boolean | NOT NULL, DEFAULT true | soft active/inactive flag |
| created_at | timestamptz | NOT NULL | from BaseEntity |
| updated_at | timestamptz | NOT NULL | from BaseEntity |
| deleted_at | timestamptz | nullable | soft delete; from BaseEntity |

**Indexes**:
- `IDX_quimicos_tenant_id` ON (tenant_id)
- `IDX_quimicos_establecimiento_id` ON (establecimiento_id)
- `IDX_quimicos_activo` ON (activo)
- `UQ_quimicos_tenant_est_nombre` — UNIQUE (tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL

**Soft Delete**: Yes (`deleted_at`). Standard TypeORM behavior excludes soft-deleted rows from all queries.

**Immutable fields**: `establecimiento_id`, `stock_actual` — PATCH guard throws `QUIMICO_FIELD_IMMUTABLE` if either is present in request body.

---

### PrincipioActivo

**Table**: `principios_activos`  
**Base**: Plain entity (no `BaseEntity`, no `tenant_id`)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| nombre | varchar(100) | NOT NULL, UNIQUE | globally unique across all tenants |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Soft Delete**: No. Hard delete only, and only when no quimico references this principle (`quimico_principio_activo` count = 0).

**Global**: No `tenant_id`. All tenants share the same catalog.

---

### QuimicoPrincipioActivo

**Table**: `quimico_principio_activo`  
**Base**: Plain entity (no `BaseEntity`, no `tenant_id`)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| quimico_id | uuid | NOT NULL, FK → quimicos(id) ON DELETE CASCADE | part of composite PK |
| principio_activo_id | uuid | NOT NULL, FK → principios_activos(id) ON DELETE CASCADE | part of composite PK |

**Primary Key**: `(quimico_id, principio_activo_id)` — composite

**Indexes**:
- `IDX_qpa_principio_activo_id` ON (principio_activo_id) — for reference count queries on PA delete

**Usage**: Managed explicitly in `QuimicosService`. On create: INSERT rows. On update (when principios_activos provided): DELETE WHERE quimico_id = X, then INSERT new rows (inside `runInTx`). On quimico soft-delete: no cascade needed (links remain for historical references, but quimico is excluded from queries by soft-delete).

**Note on CASCADE**: FK `quimico_id → quimicos(id) ON DELETE CASCADE` applies to **hard** deletes only. Since quimicos use soft-delete, the join table rows are preserved when a quimico is soft-deleted.

---

## Relationships

```
Quimico (N) ──── (N) PrincipioActivo
                  via quimico_principio_activo join table
                  (manually managed, not @ManyToMany)

Quimico (many) ──── Establecimiento (via establecimiento_id, no FK constraint at DB level — validated at service layer)
Quimico (many) ──── Tenant (via tenant_id from BaseEntity)
```

---

## State Machine: Quimico

```
[CREATED, activo=true, stock_actual=0]
      │
      ├─ PATCH activo=false ──→ [INACTIVE, activo=false]
      │                               │
      │                               └─ PATCH activo=true ──→ [ACTIVE]
      │
      ├─ stock_actual modified by M07/M08 ──→ [stock_actual > 0]
      │
      └─ DELETE (admin_global) ──→ [SOFT DELETED, deleted_at set]
```

---

## Validation Rules

| Rule | Scope | Error Code |
|------|-------|------------|
| nombre unique per (tenant_id, establecimiento_id) among non-deleted | Create & Update | QUIMICO_NOMBRE_DUPLICADO |
| establecimiento_id immutable after creation | Update | QUIMICO_FIELD_IMMUTABLE |
| stock_actual not settable via API | Update | QUIMICO_FIELD_IMMUTABLE |
| principio_activo IDs must all exist in global catalog | Create & Update | BAD_REQUEST (with unknown_ids list) |
| PrincipioActivo.nombre globally unique | Create & Update PA | PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO |
| PrincipioActivo hard delete blocked if referenced | Delete PA | PRINCIPIO_ACTIVO_REFERENCIADO |

---

## TypeORM Entity Sketches

### quimico.entity.ts

```typescript
@Entity('quimicos')
export class Quimico extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 30 })
  unidad_medida!: string;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  stock_actual!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Runtime-only field (not a DB column), populated by getQuimicoWithPrincipios()
  principios_activos?: PrincipioActivo[];
}
```

### principio-activo.entity.ts

```typescript
@Entity('principios_activos')
export class PrincipioActivo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
```

### quimico-principio-activo.entity.ts

```typescript
@Entity('quimico_principio_activo')
export class QuimicoPrincipioActivo {
  @PrimaryColumn({ type: 'uuid' })
  quimico_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  principio_activo_id!: string;
}
```
