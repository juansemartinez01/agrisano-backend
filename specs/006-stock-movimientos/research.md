# Research: M06 — Stock Movimientos

**Date**: 2026-06-05 | **Branch**: `006-stock-movimientos`

All decisions below were resolved by reading the existing codebase (M01–M05) rather than external sources. No external research was required.

---

## Decision 1: Entity Base Class

**Decision**: MovimientoStock is a plain TypeORM entity. It does NOT extend `BaseEntity` from `src/common/database/base.entity.ts`.

**Rationale**: `BaseEntity` includes `deleted_at: Date | null` (a `@DeleteDateColumn`). Movements are permanently immutable — they cannot be soft-deleted. Including `deleted_at` would create a footgun (accidental `.softDelete()` calls would silently corrupt the audit trail). The column would also mislead future developers into thinking movements support soft-delete. Defining the four needed columns (id, tenant_id, created_at, updated_at) explicitly costs four lines and removes all ambiguity.

**Alternatives considered**: Subclass BaseEntity and never use `softDelete()`. Rejected: the contract is violated at the class level even if never called; tooling and generic services might invoke it unintentionally.

---

## Decision 2: Service Base Class

**Decision**: StockMovimientosService is a plain `@Injectable()`. It does NOT extend `BaseCrudTenantService`.

**Rationale**: `BaseCrudTenantService` provides `list()`, `create()`, `update()`, `softDelete()`, and `mustFindById()`. This module needs none of `update()` or `softDelete()`. The `create()` path requires a custom QueryRunner transaction (INSERT + UPDATE in one atomic operation) that `BaseCrudTenantService.create()` does not support. Using the base class would require overriding the core method anyway — creating a thin wrapper with no real inheritance benefit. `QuimicosService.mustFindById()` is reused via injection for quimico validation.

**Alternatives considered**: Subclass and override `create()`. Rejected: more coupling, more code, no reuse gain.

---

## Decision 3: QueryRunner Transaction Pattern

**Decision**: Use the identical QueryRunner pattern as M03 `SiembraService.createSiembra()`:
```
qr = dataSource.createQueryRunner()
await qr.connect(); await qr.startTransaction()
try { ...; await qr.commitTransaction() }
catch(err) { await qr.rollbackTransaction(); throw err }
finally { await qr.release() }
```

**Rationale**: This pattern is already established and tested in the codebase. The stock update uses atomic SQL (`UPDATE quimicos SET stock_actual = stock_actual + $1 WHERE id = $2`) so concurrent transactions cannot produce incorrect totals — each sees committed state.

**Alternatives considered**: `runInTx()` helper (used in M05 for QPA updates). Rejected for the stock update: `runInTx` uses `EntityManager` which abstracts away the query runner; for a two-entity atomic write that must be a raw SQL UPDATE, explicit QueryRunner is clearer and matches M03.

---

## Decision 4: Negative Stock Warning — Pre-Commit Evaluation

**Decision**: Calculate `projectedStock = Number(quimico.stock_actual) + delta` BEFORE opening the transaction. Set `warning = projectedStock < 0 ? 'Stock resultante negativo' : undefined`. The transaction still commits.

**Rationale**: The warning is informational only — it does not block the save. Evaluating it pre-commit avoids reading `stock_actual` inside the transaction (which would require a SELECT FOR UPDATE). The stock_actual read comes from the `quimicosService.mustFindById()` call which is the most recent committed value at that moment. There is a theoretical TOCTOU window for concurrent egressos, but since warnings are advisory (not enforcement), this is acceptable — the stock update itself is atomic.

**Alternatives considered**: Read `stock_actual` inside the transaction with SELECT FOR UPDATE for precise warning. Rejected: unnecessary locking overhead for an advisory warning.

---

## Decision 5: Controller Routing — No Prefix

**Decision**: `@Controller()` with no path prefix. Each `@Get()` / `@Post()` handler carries its full route string: `'stock-movimientos'`, `'stock-movimientos/:id'`, `'quimicos/:quimicoId/movimientos'`.

**Rationale**: The convenience endpoint `GET /quimicos/:quimicoId/movimientos` cannot be registered in `QuimicosController` (M05 is closed). Defining it in `StockMovimientosController` with a full explicit path is the cleanest solution — no route conflicts, no module coupling. NestJS prefix-less controllers are idiomatic for cross-resource routes.

**Alternatives considered**: (a) Add the route to QuimicosController by modifying M05. Rejected: violates the "closed module" constraint. (b) Create a separate controller class just for the quimico route. Rejected: unnecessary file for two lines of delegation.

---

## Decision 6: unidad_medida and establecimiento_id from Body

**Decision**: These fields are not present in `CreateMovimientoDto` at all (not declared, not validated, not forbidden). `class-validator` with `@Transform` + whitelist stripping (if globally configured) or simply not reading them in the service achieves silent ignore.

**Rationale**: If the fields are not in the DTO, they are never bound. No explicit rejection needed. Security is not a concern (neither field changes permissions or exposes sensitive data).

**Alternatives considered**: Declare them in the DTO with `@IsOptional()` and a validator that always ignores the value. Rejected: confusing DTO API that implies the fields are accepted. Best to simply omit them from the DTO entirely.

---

## Decision 7: Pagination and Sorting

**Decision**: Reuse `PageQueryDto` from `src/common/query/page-query.dto.ts`. `QueryMovimientosDto` extends it and adds optional filter fields. Use `clampPagination()` from `src/common/query/query-utils.ts`. Default sort: `fecha DESC`.

**Rationale**: Consistent with M03 (SiembraService) which uses the same pattern. No changes to shared utilities needed.

---

## Decision 8: Audit Pattern

**Decision**: Call `AuditService.write()` after transaction commit (outside the transaction). Use `auditLogPayload()` helper. Event names: `stock_movimiento_ingreso` and `stock_movimiento_egreso_manual`.

**Rationale**: Audit calls are outside the business transaction to avoid audit failures rolling back committed movements. Consistent with M05 QuimicosService pattern.

---

## Resolved: No Unknown Dependencies

All dependencies confirmed present in the codebase:
- `QuimicosService.mustFindById()` — inherited from BaseCrudTenantService, available via QuimicosModule exports ✓
- `TenancyService.requireTenantId()` — available via TenancyModule ✓
- `AuditService.write()` + `auditLogPayload()` — available via AuditModule ✓
- `clampPagination()` — `src/common/query/query-utils.ts` ✓
- `AppError` + `ErrorCodes` — `src/common/errors/*` ✓
- `ok()`, `page()` — `src/common/http/api-response.ts` ✓
- `DataSource` — injected from TypeORM, available in any NestJS module ✓
