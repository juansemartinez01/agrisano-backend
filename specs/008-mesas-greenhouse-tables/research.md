# Research: M08 — Mesas (Greenhouse Tables)

**Branch**: `009-mesas-greenhouse-tables` | **Date**: 2026-06-05

## Summary

No NEEDS CLARIFICATION markers in spec. All 7 design decisions were pre-resolved in the clarification session (2026-06-05). This research confirms prior decisions by cross-referencing the existing M01–M07 codebase.

---

## Decision 1: Controller Routing Pattern

**Decision**: `MesasController` uses `@Controller()` with no prefix; all routes are explicit full-path strings.

**Rationale**: Required to co-locate `GET /tuneles/:tunel_id/mesas` inside `MesasController` without importing or modifying `TunelesController`. Matches M06 `StockMovimientosController` exactly — that controller declares `GET 'quimicos/:quimicoId/movimientos'` alongside `GET 'stock-movimientos'` and `GET 'stock-movimientos/:id'`.

**Pattern confirmed in**: `src/modules/stock-movimientos/stock-movimientos.controller.ts` — `@Controller()` with no prefix, explicit route strings on each handler.

**Route order constraint**: `'mesas/qr/:codigoQr'` MUST be declared before `'mesas/:id'`. NestJS matches routes in declaration order; the literal `qr` segment must win over the `:id` wildcard.

---

## Decision 2: Service Architecture

**Decision**: `MesasService` is a plain `@Injectable()`, not extending `BaseCrudTenantService`.

**Rationale**: FIFO position assignment during `createMesa` requires a `QueryRunner` transaction. `BaseCrudTenantService.create()` calls `repository.save()` directly without exposing a transaction context — wrapping it externally would leave a race condition window between the MAX query and the INSERT. The TypeORM `DataSource.createQueryRunner()` pattern is already used in `StockMovimientosService` for stock balance updates.

**Alternatives considered**:
- Extending `BaseCrudTenantService` with an overridden `create()` — rejected because the base class manages its own repository calls and the override surface is fragile.
- Using PostgreSQL advisory locks — rejected as unnecessary complexity; the UNIQUE constraint on `(tunel_id, posicion_actual)` is a sufficient fallback for the rare concurrent case.

---

## Decision 3: Historial Architecture

**Decision**: `HistorialMesaService` is a separate plain `@Injectable()`, exported from `MesasModule`.

**Rationale**: M09, M10, and M11 need to write historial events for their own domain actions (chemical application, transplant, harvest) without going through the REST layer. Embedding in `MesasService` would create circular module imports when those modules import `MesasModule`. A dedicated service keeps writes composable and the import graph acyclic.

**Caller pattern**: M09/M10/M11 import `MesasModule`, inject `HistorialMesaService`, call `writeEvent({ mesa_id, tipo_evento, detalle, usuario_id, tenant_id })`. No HTTP round-trip.

---

## Decision 4: FIFO Position Atomicity

**Decision**: `QueryRunner` transaction wrapping `SELECT MAX(posicion_actual)` + `INSERT INTO mesas`.

**Rationale**: Without a transaction, two concurrent POST /mesas requests for the same tunnel would both read the same MAX value and attempt to insert at the same position. The `UNIQUE INDEX ON mesas(tunel_id, posicion_actual) WHERE posicion_actual IS NOT NULL` acts as the final safety net (one request fails with a constraint error), but the application should handle this gracefully rather than relying on a DB error. The transaction reduces (but cannot eliminate at READ COMMITTED isolation) the race window.

**Implementation**: `dataSource.createQueryRunner()` → `connect()` → `startTransaction()` → raw SQL MAX query → compute `newPos` → `INSERT` via QB or raw query → `commitTransaction()`. Try/catch wraps for `rollbackTransaction()` on failure; `finally` always releases.

---

## Decision 5: State Transition Guards

**Decision**: Precise error codes and HTTP statuses per state check.

| Operation | Allowed from | Blocked from | Error | HTTP |
|---|---|---|---|---|
| dar-de-baja | activa, en_cosecha | baja | MESA_ESTADO_INVALIDO | 409 |
| reactivar | baja | activa, en_cosecha | MESA_ESTADO_INVALIDO | 409 |
| DELETE | — (any) | activa, en_cosecha | MESA_SOLO_BAJA_DELETE | 409 |
| PATCH | — | (immutable field in body) | MESA_FIELD_IMMUTABLE | 400 |

**Rationale**: Using 409 Conflict for state-machine violations is consistent with M05 (`QUIMICO_FIELD_IMMUTABLE`) and M06 (`MOVIMIENTO_CANTIDAD_INVALIDA`). The `MESA_SOLO_BAJA_DELETE` code is distinct from `MESA_ESTADO_INVALIDO` so clients can display a specific message ("Table must be decommissioned before deletion").

---

## Decision 6: QR Code Format

**Decision**: `randomUUID()` — plain UUID v4, no prefix, no formatting.

**Rationale**: UUID v4 is 36 characters (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), well within the `VARCHAR(100)` column. It is URL-safe for embedding in QR content and natively supported by Node's `crypto.randomUUID()` (no new package needed). The frontend builds the full URL; this module only stores and returns the raw identifier.

**Global uniqueness**: Enforced by `CONSTRAINT "UQ_mesas_codigo_qr" UNIQUE ("codigo_qr")` — not per-tenant. This is intentional: a physical QR label must be globally unique regardless of which tenant's system scans it.

---

## Decision 7: Historial Written Inside Transactions

**Decision**: `dar-de-baja` and `reactivar` write both the state UPDATE and the historial INSERT inside the same `QueryRunner` transaction.

**Rationale**: Ensures historial always reflects actual state — no partial case where the table state changed but no event was recorded, or vice versa. `HistorialMesaService.writeEvent()` itself does not open a transaction (callers may wrap when needed). For `dar-de-baja` and `reactivar`, `MesasService` uses its own `QueryRunner` to wrap both operations atomically.
