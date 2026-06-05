# Research: M03 — Siembra

**Branch**: `003-siembra` | **Date**: 2026-06-04

## Resolved Decisions

---

### Decision 1 — SiembraService does NOT extend BaseCrudTenantService

**Decision**: `SiembraService` is a plain `@Injectable()` class — it does not extend `BaseCrudTenantService<Siembra>`.
**Rationale**: The create operation requires an explicit `QueryRunner` transaction spanning two entities (`siembras` and `bandejas`). `BaseCrudTenantService.create()` uses `repository.save()` with no transaction control. The service needs to inject `DataSource` directly. Forcing extension of the base class and overriding `create()` would be more complex than writing the service from scratch.
**What it still uses**: Direct repository queries for `findOne`/`find`, `TenancyService.requireTenantId()` for tenant scoping, `DataSource.createQueryRunner()` for transactions.
**Alternatives considered**: Extending and overriding create() — rejected; requires fighting the base class. Using the `runInTx` helper (`src/common/database/transaction.ts`) — rejected because `runInTx` wraps `DataSource.transaction()` which gives `EntityManager` not `QueryRunner`; the explicit QueryRunner is required per spec clarification Q2.

---

### Decision 2 — BandejaService DOES extend BaseCrudTenantService

**Decision**: `BandejaService extends BaseCrudTenantService<Bandeja>` for `list` and `findById` operations. The default `estado=en_nursery` filter is applied at the service level before calling `this.list()`.
**Rationale**: Bandejas are read-mostly. All write operations happen through `SiembraService` (create) or will be in M11 (transplant). Extending the base class for list/findById avoids duplicating tenant scoping logic.
**Default estado filter**:
```typescript
async listBandejas(q: QueryBandejasDto) {
  const estadoFilter = q.estado ?? BandejaEstado.EN_NURSERY;
  const filters: Record<string, unknown> = { estado: estadoFilter };
  // add other filters...
  return this.list({ ...q, filters }, { filterAllowed: [...], strictTenant: true });
}
```

---

### Decision 3 — Explicit QueryRunner pattern for createSiembra and deleteSiembra

**Decision**: Both `createSiembra` and `deleteSiembra` use the explicit QueryRunner pattern:
```typescript
const qr = this.dataSource.createQueryRunner();
await qr.connect();
await qr.startTransaction();
try {
  // ... work ...
  await qr.commitTransaction();
} catch (err) {
  await qr.rollbackTransaction();
  throw err;
} finally {
  await qr.release();
}
```
**Rationale**: Provides full control over commit/rollback. Guarantees atomicity per spec FR-005 and clarification Q2.
**For createSiembra**: Inserts siembra first, then each bandeja via `qr.manager.save(Bandeja, bandejaData)`.
**For deleteSiembra cascade**: Issues a raw UPDATE via `qr.manager.query(...)`, then soft-deletes the siembra via `qr.manager.softDelete(Siembra, id)`.

---

### Decision 4 — Lot validation using LotesService.mustFindById

**Decision**: Validate lote tipo by calling `this.lotesService.mustFindById(loteId, { strictTenant: true })` then checking `lot.tipo`. This runs BEFORE opening the QueryRunner transaction (per clarification Q3).
**Rationale**: `LotesService` inherits `mustFindById` from `BaseCrudTenantService`, which automatically scopes to the current tenant and throws `AppError NOT_FOUND` if missing. Checking tipo BEFORE the transaction avoids any partial writes.
**Implementation**:
```typescript
// Validate ALL lots before opening transaction
for (const group of dto.bandejas) {
  const semilla = await this.lotesService.mustFindById(group.lote_semilla_id, { strictTenant: true });
  if (semilla.tipo !== LoteTipo.SEMILLA) throw new AppError({ code: ErrorCodes.LOTE_TIPO_INCORRECTO, status: 422, ... });
  const sustrato = await this.lotesService.mustFindById(group.lote_sustrato_id, { strictTenant: true });
  if (sustrato.tipo !== LoteTipo.SUSTRATO) throw new AppError({ code: ErrorCodes.LOTE_TIPO_INCORRECTO, status: 422, ... });
}
```

---

### Decision 5 — Establishment validation using EstablecimientosService

**Decision**: Validate establishment by calling `this.estService.mustFindById(establecimientoId, { strictTenant: true })`. This also runs before the transaction.
**Rationale**: `EstablecimientosService` inherits `mustFindById` from `BaseCrudTenantService`. If establishment doesn't exist in tenant → throws 404. This is sufficient for cross-tenant protection.
**Note**: Supervisor and operario role-specific scoping (M01's `findOneForUser`) is NOT applied here because the siembra creation endpoint accepts any authenticated user who knows the establishment ID. The establishment existence + tenant check is sufficient.

---

### Decision 6 — PATCH immutable fields guard (same pattern as M02)

**Decision**: Controller PATCH handler checks `Object.keys(req.body ?? {})` for any key not in `{ 'observaciones' }`. Throws `AppError SIEMBRA_FIELD_IMMUTABLE 400` if any extra key found.
**Rationale**: `UpdateSiembraDto` contains only `observaciones`. ValidationPipe with `whitelist: true` strips unknown fields before DTO binding, but `req.body` still carries the originals. Same guard pattern as M02's tipo guard.
**Implementation**:
```typescript
const ALLOWED = new Set(['observaciones']);
if (Object.keys((req.body as Record<string, unknown>) ?? {}).some(k => !ALLOWED.has(k))) {
  throw new AppError({ code: ErrorCodes.SIEMBRA_FIELD_IMMUTABLE, status: 400, message: '...' });
}
```

---

### Decision 7 — GET /siembras/:id response with nested bandejas + lot info

**Decision**: Use a custom QueryBuilder with LEFT JOINs to fetch siembra → bandejas → lotes in one query. Map to response shape including `lote_semilla: { id, numero_lote, tipo }` and `lote_sustrato: { id, numero_lote, tipo }` on each bandeja.
**Rationale**: TypeORM relations would require eager loading config on entities which could affect all other queries. Custom QueryBuilder gives explicit control and avoids N+1.
**Alternative**: TypeORM `find` with `relations: ['bandejas']` then separate lote lookups — rejected; N+1 problem.
**Note**: The Siembra entity does NOT declare `@OneToMany` in TypeORM (to avoid eager loading globally). The service uses raw QB for this endpoint only.

---

### Decision 8 — fecha field is PostgreSQL `date` (not timestamp)

**Decision**: `fecha` on `Siembra` is stored as PostgreSQL `date` type, not `timestamptz`. TypeORM uses `@Column({ type: 'date' })`. It stores as `YYYY-MM-DD` string.
**Rationale**: Seeding date is a calendar date (day granularity), not a point in time. Using `date` avoids timezone complications when querying by date range.
**Default**: If omitted, the controller passes `new Date().toISOString().split('T')[0]` (today's date string) to the service.

---

### Decision 9 — Cascade delete via bulk UPDATE, not CASCADE FK

**Decision**: The bandeja FK `siembra_id → siembras(id)` is NOT configured with `ON DELETE CASCADE`. The cascade soft-delete is implemented as:
```sql
UPDATE bandejas SET deleted_at = now() WHERE siembra_id = :id AND deleted_at IS NULL
```
within the QueryRunner transaction, followed by `softDelete(Siembra, id)`.
**Rationale**: PostgreSQL `ON DELETE CASCADE` performs hard deletes, which conflicts with soft-delete semantics. Bulk UPDATE in a transaction is correct and performant (single query, per clarification Q6).
