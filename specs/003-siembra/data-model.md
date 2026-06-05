# Data Model: M03 — Siembra

**Branch**: `003-siembra` | **Date**: 2026-06-04

## Entities

### Siembra

**File**: `src/modules/siembra/entities/siembra.entity.ts`
**Table**: `siembras`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited |
| tenant_id | UUID | INDEX, nullable | — | inherited; from tenantContext |
| establecimiento_id | UUID | NOT NULL, INDEX | — | FK → establecimientos.id |
| fecha | DATE | NOT NULL | — | calendar date (no time); defaults to today in controller |
| observaciones | TEXT | nullable | NULL | free-text notes |
| usuario_id | UUID | NOT NULL | — | from JWT sub; no FK constraint (loose coupling) |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**: `IDX_siembras_tenant_id`, `IDX_siembras_establecimiento_id`, `IDX_siembras_fecha`

**TypeORM decorator pattern**:
```typescript
@Entity('siembras')
export class Siembra extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'date' })
  fecha!: string; // stored as 'YYYY-MM-DD' string

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;
}
```

> **No `@OneToMany` relation** to Bandeja — avoids TypeORM eager/lazy loading globally. Bandejas are loaded via explicit QueryBuilder in the service.

---

### Bandeja

**File**: `src/modules/siembra/entities/bandeja.entity.ts`
**Table**: `bandejas`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited |
| tenant_id | UUID | INDEX, nullable | — | inherited |
| siembra_id | UUID | NOT NULL, INDEX | — | FK → siembras.id |
| lote_semilla_id | UUID | NOT NULL, INDEX | — | FK → lotes.id (must be tipo=semilla) |
| lote_sustrato_id | UUID | NOT NULL, INDEX | — | FK → lotes.id (must be tipo=sustrato) |
| estado | bandeja_estado ENUM | NOT NULL | 'en_nursery' | transitions managed by M11 |
| fecha_entrada_nursery | TIMESTAMPTZ | NOT NULL | now() | set at creation |
| fecha_trasplante | TIMESTAMPTZ | nullable | NULL | set by M11 |
| mesa_id | UUID | nullable | NULL | set by M11 |
| observaciones | TEXT | nullable | NULL | |
| codigo | VARCHAR(100) | nullable | NULL | reserved for future QR |
| establecimiento_id | UUID | NOT NULL, INDEX | — | denormalized from siembra |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**: `IDX_bandejas_tenant_id`, `IDX_bandejas_siembra_id`, `IDX_bandejas_establecimiento_id`, `IDX_bandejas_estado`, `IDX_bandejas_lote_semilla_id`, `IDX_bandejas_lote_sustrato_id`

**TypeORM decorator pattern**:
```typescript
export enum BandejaEstado {
  EN_NURSERY = 'en_nursery',
  TRASPLANTADA = 'trasplantada',
}

@Entity('bandejas')
export class Bandeja extends BaseEntity {
  @Column({ type: 'uuid' })
  siembra_id!: string;

  @Column({ type: 'uuid' })
  lote_semilla_id!: string;

  @Column({ type: 'uuid' })
  lote_sustrato_id!: string;

  @Column({ type: 'enum', enum: BandejaEstado, default: BandejaEstado.EN_NURSERY })
  estado!: BandejaEstado;

  @Column({ type: 'timestamptz' })
  fecha_entrada_nursery!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_trasplante!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  mesa_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  codigo!: string | null;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;
}
```

---

## Enum Type

**PostgreSQL type**: `bandeja_estado`
**Values**: `'en_nursery'`, `'trasplantada'`
**Created in migration** before table creation.

---

## State Transitions

### Bandeja.estado

```
CREATE (estado='en_nursery', fecha_entrada_nursery=now())
  │
  │ Transplant operation (M11 — Trasplante)
  ▼
estado='trasplantada'  ← fecha_trasplante, mesa_id set
  │
  │ (no further transitions in M03 scope)
```

**Key M03 rules**:
- M03 only creates bandejas (always `en_nursery`)
- M03 can soft-delete bandejas (only if `en_nursery` — via siembra cascade delete)
- `trasplantada` state is read-only from M03's perspective

---

## Relationships

```
Tenant (tenant_id)
  │
  │ 1:N
  ▼
Establecimiento ◄──── Siembra ────► User (usuario_id, loose FK)
                          │
                          │ 1:N (no ORM relation declared)
                          ▼
                       Bandeja ──► Lote (lote_semilla_id)
                                ──► Lote (lote_sustrato_id)
                       (establecimiento_id denormalized from siembra)
```

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts` under `// siembra`:

```typescript
// siembra
SIEMBRA_NOT_FOUND: 'SIEMBRA_NOT_FOUND',
SIEMBRA_HAS_TRASPLANTADAS: 'SIEMBRA_HAS_TRASPLANTADAS',
SIEMBRA_FIELD_IMMUTABLE: 'SIEMBRA_FIELD_IMMUTABLE',
BANDEJA_NOT_FOUND: 'BANDEJA_NOT_FOUND',
LOTE_TIPO_INCORRECTO: 'LOTE_TIPO_INCORRECTO',
```

---

## Migration

**File**: `migrations/1770400000000-SiembraInit.ts`

```sql
-- Step 1: ENUM type
CREATE TYPE "bandeja_estado" AS ENUM ('en_nursery', 'trasplantada');

-- Step 2: siembras table
CREATE TABLE "siembras" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "establecimiento_id" uuid NOT NULL,
  "fecha" date NOT NULL,
  "observaciones" text,
  "usuario_id" uuid NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_siembras" PRIMARY KEY ("id"),
  CONSTRAINT "FK_siembras_establecimiento" FOREIGN KEY ("establecimiento_id")
    REFERENCES "establecimientos"("id")
);

-- Step 3: bandejas table
CREATE TABLE "bandejas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "siembra_id" uuid NOT NULL,
  "lote_semilla_id" uuid NOT NULL,
  "lote_sustrato_id" uuid NOT NULL,
  "estado" "bandeja_estado" NOT NULL DEFAULT 'en_nursery',
  "fecha_entrada_nursery" TIMESTAMP WITH TIME ZONE NOT NULL,
  "fecha_trasplante" TIMESTAMP WITH TIME ZONE,
  "mesa_id" uuid,
  "observaciones" text,
  "codigo" character varying(100),
  "establecimiento_id" uuid NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_bandejas" PRIMARY KEY ("id"),
  CONSTRAINT "FK_bandejas_siembra" FOREIGN KEY ("siembra_id")
    REFERENCES "siembras"("id"),
  CONSTRAINT "FK_bandejas_lote_semilla" FOREIGN KEY ("lote_semilla_id")
    REFERENCES "lotes"("id"),
  CONSTRAINT "FK_bandejas_lote_sustrato" FOREIGN KEY ("lote_sustrato_id")
    REFERENCES "lotes"("id")
);

-- Step 4: Indexes
CREATE INDEX "IDX_siembras_tenant_id" ON "siembras" ("tenant_id");
CREATE INDEX "IDX_siembras_establecimiento_id" ON "siembras" ("establecimiento_id");
CREATE INDEX "IDX_siembras_fecha" ON "siembras" ("fecha");
CREATE INDEX "IDX_bandejas_tenant_id" ON "bandejas" ("tenant_id");
CREATE INDEX "IDX_bandejas_siembra_id" ON "bandejas" ("siembra_id");
CREATE INDEX "IDX_bandejas_establecimiento_id" ON "bandejas" ("establecimiento_id");
CREATE INDEX "IDX_bandejas_estado" ON "bandejas" ("estado");
CREATE INDEX "IDX_bandejas_lote_semilla_id" ON "bandejas" ("lote_semilla_id");
CREATE INDEX "IDX_bandejas_lote_sustrato_id" ON "bandejas" ("lote_sustrato_id");
```

**Down**:
```sql
DROP all indexes, DROP TABLE bandejas, DROP TABLE siembras, DROP TYPE bandeja_estado
```
