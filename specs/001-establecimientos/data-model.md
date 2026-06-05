# Data Model: M01 — Establecimientos

**Branch**: `001-establecimientos` | **Date**: 2026-06-04

## Entities

### Establecimiento

**File**: `src/modules/establecimientos/entities/establecimiento.entity.ts`
**Table**: `establecimientos`
**Extends**: `BaseEntity` (inherits `id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | inherited from BaseEntity |
| tenant_id | UUID | INDEX, nullable | — | inherited; set from TenancyService context |
| nombre | VARCHAR(150) | NOT NULL | — | required |
| ubicacion | VARCHAR(300) | nullable | NULL | optional |
| activo | BOOLEAN | NOT NULL | true | soft-disable flag; false = excluded from supervisor/operario listings |
| created_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | inherited |
| deleted_at | TIMESTAMPTZ | nullable | NULL | soft delete; inherited |

**Indexes**:
- `IDX_establecimientos_tenant_id` on (`tenant_id`)

**TypeORM decorator pattern**:
```typescript
@Entity('establecimientos')
export class Establecimiento extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ubicacion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
```

---

### UsuarioEstablecimiento

**File**: `src/modules/establecimientos/entities/usuario-establecimiento.entity.ts`
**Table**: `usuario_establecimiento`
**Extends**: Nothing (plain entity; NOT BaseEntity — no tenant_id or soft delete needed)

| Column | Type | Constraints | Default | Notes |
|--------|------|-------------|---------|-------|
| id | UUID | PK | gen_random_uuid() | |
| user_id | UUID | NOT NULL, FK→users.id CASCADE | — | assignee |
| establecimiento_id | UUID | NOT NULL, FK→establecimientos.id CASCADE | — | target |
| assigned_at | TIMESTAMPTZ | NOT NULL | now() | assignment timestamp |

**Constraints**:
- `UQ_ue_user_establecimiento` UNIQUE on (`user_id`, `establecimiento_id`) — prevents duplicate assignments
- `FK_ue_user`: `user_id` → `users(id)` ON DELETE CASCADE
- `FK_ue_establecimiento`: `establecimiento_id` → `establecimientos(id)` ON DELETE CASCADE

**Indexes**:
- `IDX_ue_user_id` on (`user_id`)
- `IDX_ue_establecimiento_id` on (`establecimiento_id`)

**TypeORM decorator pattern**:
```typescript
@Entity('usuario_establecimiento')
@Unique('UQ_ue_user_establecimiento', ['user_id', 'establecimiento_id'])
export class UsuarioEstablecimiento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  assigned_at!: Date;
}
```

---

## State Transitions

### Establecimiento.activo

```
         POST /establecimientos
               │
               ▼
          ┌─────────┐
          │ activo  │  ◄── default: true
          │ = true  │
          └────┬────┘
               │ PATCH activo=false (admin_global)
               ▼
          ┌─────────┐
          │ activo  │  (invisible to supervisor/operario listings)
          │ = false │  (audit: 'establecimiento_deactivated')
          └────┬────┘
               │ PATCH activo=true (admin_global, reactivate)
               ▼
          ┌─────────┐
          │ activo  │
          │ = true  │
          └─────────┘
               │ DELETE /establecimientos/:id (admin_global)
               ▼
          ┌─────────────┐
          │ deleted_at  │  (soft delete; invisible everywhere)
          │  IS NOT NULL│  (audit: 'establecimiento_deleted')
          └─────────────┘
```

**Key rule**: Deactivation (`activo=false`) does NOT cascade to `usuario_establecimiento`. Assignment records are preserved.

---

## Relationships

```
Tenant (tenant_id)
  │
  │ 1:N
  ▼
Establecimiento
  │           ▲
  │ N:M via   │ usuario_establecimiento
  │           │
  ▼           │
User ─────────┘
```

- One tenant → many establishments
- One establishment → many users (via join table)
- One user → many establishments (via join table)
- admin_global users are NOT required to have join table entries; they access all tenant establishments directly

---

## ErrorCodes additions

Add to `src/common/errors/error-codes.ts`:

```typescript
// establecimientos
ESTABLECIMIENTO_NOT_FOUND: 'ESTABLECIMIENTO_NOT_FOUND',
ASSIGNMENT_NOT_FOUND: 'ASSIGNMENT_NOT_FOUND',
ASSIGNMENT_CONFLICT: 'ASSIGNMENT_CONFLICT',
```

---

## Migration

**File**: `migrations/1770200000000-EstablecimientosInit.ts`

```sql
-- Table: establecimientos
CREATE TABLE establecimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  nombre VARCHAR(150) NOT NULL,
  ubicacion VARCHAR(300),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IDX_establecimientos_tenant_id ON establecimientos(tenant_id);

-- Table: usuario_establecimiento
CREATE TABLE usuario_establecimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  establecimiento_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT UQ_ue_user_establecimiento UNIQUE (user_id, establecimiento_id),
  CONSTRAINT FK_ue_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT FK_ue_establecimiento FOREIGN KEY (establecimiento_id)
    REFERENCES establecimientos(id) ON DELETE CASCADE
);

CREATE INDEX IDX_ue_user_id ON usuario_establecimiento(user_id);
CREATE INDEX IDX_ue_establecimiento_id ON usuario_establecimiento(establecimiento_id);

-- Role seed (idempotent)
INSERT INTO roles (id, tenant_id, name, created_at, updated_at)
VALUES
  (gen_random_uuid(), NULL, 'operario',     now(), now()),
  (gen_random_uuid(), NULL, 'supervisor',   now(), now()),
  (gen_random_uuid(), NULL, 'admin_global', now(), now())
ON CONFLICT (name) DO NOTHING;
```
