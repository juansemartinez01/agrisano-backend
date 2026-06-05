# Research: M04 — Recetas (Nursery Recipes)

**Branch**: `004-recetas` | **Date**: 2026-06-04

## Resolved Decisions

---

### Decision 1 — RecetasService DOES extend BaseCrudTenantService

**Decision**: `RecetasService extends BaseCrudTenantService<Receta>`.
**Rationale**: All CRUD operations are single-row with no multi-entity transaction requirements. `BaseCrudTenantService` provides `list`, `create`, `update`, `mustFindById`, and `softDelete` with built-in tenant scoping — exactly what this module needs. No explicit QueryRunner is required (unlike M03 SiembraService).
**Alternatives considered**: Plain `@Injectable()` without base class — rejected; no justification for the extra boilerplate when the base class fits perfectly.

---

### Decision 2 — PATCH immutable fields guard

**Decision**: The PATCH handler checks `Object.keys(req.body ?? {})` against `ALLOWED = new Set(['nombre', 'descripcion', 'activo'])`. Any key outside this set → throw `AppError RECETA_FIELD_IMMUTABLE 400`. Same pattern as M03 (`SIEMBRA_FIELD_IMMUTABLE`).
**Rationale**: `establecimiento_id` is immutable after creation (spec clarification Q1). ValidationPipe with `whitelist: true` strips unknown fields before DTO binding, but `req.body` still carries the originals. The guard must run before DTO validation to give the correct error code.
**Alternatives considered**: DTO-only enforcement (not including `establecimiento_id` in UpdateRecetaDto) — rejected; per spec clarification the field must be explicitly rejected, not silently stripped.

---

### Decision 3 — No default activo filter on list

**Decision**: `listRecetas(q)` does NOT apply a default `activo` filter. When `q.activo` is undefined, all non-deleted recipes are returned.
**Rationale**: Spec FR-007 and clarification Q3 explicitly require no default filter. Unlike `GET /bandejas` (which defaults to `en_nursery`), recipe listing serves as a full catalog view. Callers opt-in to active/inactive filtering.
**Implementation**: Build `filters` object only when `q.activo !== undefined`. Pass to `this.list()` with `filterAllowed: ['establecimiento_id', 'activo']`.

---

### Decision 4 — Search on nombre only (single ILIKE column)

**Decision**: Search uses `searchColumns: ['nombre']` in `BaseCrudTenantService.list()` options. This invokes `applySearch` which wraps a single ILIKE in a `Brackets` clause.
**Rationale**: Only one searchable field (nombre). No OR across multiple columns needed (unlike M02 lotes which searched both `numero_lote` and `proveedor`). `applySearch` from `query-utils.ts` handles single-column ILIKE correctly.
**Alternatives considered**: Custom `customizeQb` — not needed; `searchColumns: ['nombre']` is sufficient.

---

### Decision 5 — Uniqueness constraint: partial index on (tenant_id, establecimiento_id, nombre)

**Decision**: Partial unique index `UQ_recetas_tenant_est_nombre ON recetas (tenant_id, establecimiento_id, nombre) WHERE deleted_at IS NULL`.
**Rationale**: Matches spec clarification Q2 and mirrors M02 lotes partial index pattern. Enforces uniqueness at DB level while allowing reuse of names after soft-delete.
**Application-level check**: Service also checks uniqueness in code before attempting to insert (to return `RECETA_NOMBRE_DUPLICADO` 409 rather than a raw DB constraint error). This dual-check follows M02 lotes `LOTE_NUMERO_DUPLICADO` pattern.

---

### Decision 6 — Establishment validation via EstablecimientosService.mustFindById

**Decision**: On `createReceta`, the service calls `this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })`. If the establishment does not exist in the tenant → throws `ESTABLECIMIENTO_NOT_FOUND 404`.
**Rationale**: `mustFindById` on `BaseCrudTenantService` automatically scopes to the current tenant and raises a standard 404 on miss. No additional cross-tenant check needed.
**No update-time validation**: `establecimiento_id` is immutable (clarification Q1); therefore, establishment is never re-validated on PATCH.

---

### Decision 7 — Admin controller scope

**Decision**: `AdminRecetasController` has `@Roles('admin_global')` class-level guard and exposes only `GET /admin/recetas`. It calls `svc.listRecetas(q)` which returns all non-deleted tenant recipes (active + inactive). No additional filter applied.
**Rationale**: Matches spec clarification Q5 — admin list has the same query as the regular list but is scoped to admin_global only.
**Audit**: No audit event for list operations (read-only).
