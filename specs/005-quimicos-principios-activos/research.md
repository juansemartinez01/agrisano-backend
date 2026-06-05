# Research: M05 — Quimicos y Principios Activos

**Date**: 2026-06-04 | **Branch**: `005-quimicos-principios-activos`

## Decision 1: Join Table Strategy

**Decision**: Use explicit `QuimicoPrincipioActivo` TypeORM entity with manual DELETE + INSERT inside `runInTx`, rather than TypeORM `@ManyToMany` decorator.

**Rationale**: M05's replace-or-ignore semantics require full control over the join table. Using `@ManyToMany` would require loading the full entity with relations on every PATCH to perform the save, adding unnecessary overhead and coupling to TypeORM's relation-sync internals. Explicit management also makes the reference-count query in `PrincipiosActivosService.delete()` straightforward.

**Alternatives considered**:
- `@ManyToMany + @JoinTable`: TypeORM auto-syncs join table on `save()`. Rejected because it makes the replace-or-ignore boundary (undefined vs. provided) harder to express cleanly and adds implicit eager/lazy load complexity.
- Raw SQL via DataSource: More verbose than using a TypeORM entity. Rejected in favor of the entity approach for consistency with the rest of the codebase.

---

## Decision 2: PrincipiosActivosService Base Class

**Decision**: Plain `@Injectable()` with no base class.

**Rationale**: `BaseCrudTenantService<T>` requires `T extends { id: string; tenant_id: string | null }`. `PrincipioActivo` has no `tenant_id` field, so the base service's tenant-scoping logic is inapplicable. A plain service injecting `Repository<PrincipioActivo>` is the correct and minimal solution.

**Alternatives considered**:
- Adding a `tenant_id` column to `PrincipioActivo`: Rejected. The spec explicitly defines it as a global catalog shared across all tenants.
- Extending `BaseCrudTenantService` with `allowGlobal: true`: Would require setting `tenant_id = null` on all records, adding a meaningless column and complicating queries.

---

## Decision 3: principios_activos Loading Strategy for GET /quimicos/:id

**Decision**: QueryBuilder with explicit LEFT JOINs through the join table entity.

**Rationale**: TypeORM's `relations: ['principios_activos']` approach requires `@ManyToMany` on the entity, which we are not using (Decision 1). A QueryBuilder LEFT JOIN through `quimico_principio_activo` and then `principios_activos` is efficient (single SQL query) and explicit.

**Implementation**:
```sql
SELECT q.*, pa.*
FROM quimicos q
LEFT JOIN quimico_principio_activo qpa ON qpa.quimico_id = q.id
LEFT JOIN principios_activos pa ON pa.id = qpa.principio_activo_id
WHERE q.id = :id AND q.tenant_id = :tenantId AND q.deleted_at IS NULL
```
In TypeORM QueryBuilder terms, use `getRawAndEntities()` or manually map the joined rows.

Alternative: two separate queries (one for quimico, one for principios_activos). Simpler but two round trips. Acceptable for this use case given the small catalog size — use this if JOIN mapping proves awkward.

---

## Decision 4: UUID Validation for principioActivoIds

**Decision**: Load all IDs via `paRepo.findBy({ id: In(principioActivoIds) })`, compare found count to input count, collect unknown IDs.

**Rationale**: Single round trip to the database; works regardless of catalog size; unknown IDs are easily computed with a Set difference.

**Error shape**:
```json
{
  "code": "BAD_REQUEST",
  "message": "Principios activos no encontrados",
  "details": { "unknown_ids": ["<uuid>", ...] }
}
```

---

## Decision 5: stock_actual Immutability

**Decision**: PATCH guard at controller level rejects `establecimiento_id` OR `stock_actual` with `QUIMICO_FIELD_IMMUTABLE` 400.

**Rationale**: Explicit rejection provides a clear API contract for callers. Silent ignore was considered (Q4) but explicit rejection was confirmed as the correct behavior (Q6). The `UpdateQuimicoDto` class does not include either field, so `class-validator` already strips them in most configurations, but the explicit guard adds defense-in-depth.

---

## Decision 6: Admin List Scope

**Decision**: `GET /admin/quimicos` returns all non-deleted chemicals (active and inactive) within the admin_global's own tenant. No mandatory filters — `establecimiento_id` and `activo` can be passed optionally but are not required.

**Rationale**: Admin panel oversight of all chemicals in a tenant, regardless of establishment. Standard TypeORM soft-delete behavior already excludes `deleted_at IS NOT NULL` rows. The same `listQuimicos()` service method is reused — the admin controller just enforces the `admin_global` role and applies no additional filter defaults.

**Note**: `admin_global` is still tenant-scoped (JWT carries tenant_id). Cross-tenant access is not in scope for this module.

---

## Decision 7: Transaction for principios_activos Replace

**Decision**: Use `runInTx(dataSource, ...)` from `src/common/database/transaction.ts`.

**Rationale**: The DELETE + INSERT pair must be atomic. `runInTx` is already the established utility in this codebase (used in prior modules). The transaction wraps only the join table operations; the Quimico entity update (`this.update(...)`) is a separate save that occurs after the transaction, which is acceptable because the join table state is the only thing that needs atomicity.

**Alternative**: Wrap entire update (quimico + links) in a single transaction. More correct but more complex. Acceptable to scope the transaction to just the join table for this module.
