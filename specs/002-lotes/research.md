# Research: M02 — Lotes

**Branch**: `002-lotes` | **Date**: 2026-06-04

## Resolved Decisions

---

### Decision 1 — PostgreSQL enum vs varchar for `tipo`

**Decision**: Use a native PostgreSQL ENUM type (`lote_tipo AS ENUM ('semilla', 'sustrato')`) and TypeORM `enum` column type.
**Rationale**: Native ENUM enforces valid values at the DB layer, self-documents the schema, and avoids invalid rows even if application-level validation is bypassed. TypeORM handles enum columns cleanly with `@Column({ type: 'enum', enum: LoteTipo })`.
**Migration**: `CREATE TYPE "lote_tipo" AS ENUM ('semilla', 'sustrato')` before CREATE TABLE.
**Alternatives considered**: VARCHAR with CHECK constraint — acceptable but less self-documenting; application-only validation — rejected, too easy to bypass.

---

### Decision 2 — Partial unique index for numero_lote uniqueness

**Decision**: Create a PostgreSQL partial unique index: `CREATE UNIQUE INDEX UQ_lotes_tenant_tipo_numero ON lotes (tenant_id, tipo, numero_lote) WHERE deleted_at IS NULL`.
**Rationale**: This enforces uniqueness only among non-soft-deleted lots at the DB level. Business-level pre-check (SELECT before INSERT) provides a clean error code. The partial index is the safety net for race conditions.
**Implementation**: TypeORM cannot express partial unique indexes via entity decorators — it must be created in the migration with raw SQL. The entity does NOT use `@Unique` decorator (would be a full, not partial, index).
**Alternatives considered**: Full unique index — rejects creation even when the prior lot is soft-deleted, violating the spec requirement.

---

### Decision 3 — OR search implementation (bypassing applySearch)

**Decision**: Use `customizeQb` in `BaseCrudTenantService.list()` to inject OR-search manually, bypassing the `applySearch` helper which applies AND logic across columns.
**Rationale**: `applySearch` (in `query-utils.ts`) applies multiple ILIKE conditions with AND — "search term must appear in ALL listed columns." The spec requires OR: "matches if it appears in either field." The `customizeQb` hook runs after tenant scope and before filter/sort, so it is safe to add WHERE conditions there.
**Implementation**:
```typescript
customizeQb: q.q ? (qb, alias) => {
  qb.andWhere(
    new Brackets(b => b
      .where(`${alias}.numero_lote ILIKE :search`, { search: `%${q.q}%` })
      .orWhere(`${alias}.proveedor ILIKE :search`)
    )
  );
} : undefined
```
**Note**: `new Brackets(...)` from TypeORM wraps the OR in parentheses to prevent interference with tenant-scope AND conditions.

---

### Decision 4 — tipo immutability check location

**Decision**: Check `'tipo' in (req.body as Record<string, unknown>)` in the PATCH controller method BEFORE any service call.
**Rationale**: `UpdateLoteDto` intentionally excludes the `tipo` field. If ValidationPipe runs with `whitelist: true`, `tipo` is stripped from `dto` — but `req.body` still contains the raw value. Checking `req.body` catches the intent to change `tipo` even when it's stripped from DTO. This is the minimal, non-intrusive approach (no custom interceptor needed).
**Throws**: `AppError({ code: ErrorCodes.LOTE_TIPO_IMMUTABLE, status: 400 })`.
**Alternatives considered**: Custom NestJS interceptor — more complex, not needed for a single-field guard. `@IsNotIn` on a field that doesn't exist — not applicable. Custom `ValidationPipe` override — over-engineering.

---

### Decision 5 — Bandeja reference check (forward-compatible)

**Decision**: Raw SQL query wrapped in try/catch. Re-throw only `AppError`; swallow all other errors (table-not-found returns postgres error code `42P01`).
**Rationale**: The bandejas table doesn't exist until M04. A raw `queryRunner.query` / `manager.query` will throw a postgres error if the table is missing. Catching non-AppError exceptions and continuing allows M02 to be fully deployed independently.
**Implementation**:
```typescript
try {
  const [{ cnt }] = await this.loteRepo.manager.query(
    `SELECT COUNT(*)::int AS cnt FROM bandejas WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1`,
    [id]
  );
  if (cnt > 0) throw new AppError({ code: ErrorCodes.LOTE_REFERENCED_BY_BANDEJA, status: 409, message: '...' });
} catch (err: unknown) {
  if (err instanceof AppError) throw err;
  // Table not yet created (M04 pending) — skip check gracefully
}
```
**Alternatives considered**: Table existence check before query — more verbose, same effect. Feature flag — unnecessary complexity.

---

### Decision 6 — No UsersService dependency

**Decision**: `LotesService` does NOT depend on `UsersService`. Lots have no user-assignment logic.
**Rationale**: Unlike M01 (establecimientos), lots are not scoped per user — all authenticated users can read them. The service only needs the `Lote` repository and the inherited `BaseCrudTenantService` tenant context.
**Module imports**: `LotesModule` imports `TypeOrmModule.forFeature([Lote])`, `TenancyModule`, `AuditModule`. No `UsersModule`.

---

### Decision 7 — Audit write location (controller)

**Decision**: Same as M01 — audit writes in CONTROLLERS, not in the service.
**Rationale**: Services handle business logic; controllers handle HTTP concerns including audit. Confirmed pattern from `admin-users.controller.ts` and M01 implementation.
**Audit action strings** (module-level const in `lotes.service.ts`):
```typescript
export const AUDIT = {
  CREATED: 'lote_created',
  UPDATED: 'lote_updated',
  DELETED: 'lote_deleted',
} as const;
```
