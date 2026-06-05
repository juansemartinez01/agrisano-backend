# Implementation Plan: M06 — Stock Movimientos (Chemical Stock Movements)

**Branch**: `006-stock-movimientos` | **Date**: 2026-06-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-stock-movimientos/spec.md`

## Summary

Build the `stock-movimientos` NestJS module that records manual stock movements (ingreso / egreso_manual) for chemicals and updates `quimicos.stock_actual` atomically in the same QueryRunner transaction. The module exposes four read/write endpoints, enforces role-based access (supervisor and admin_global can write; all authenticated users can read), produces audit records for every mutation, and warns (without blocking) when an egreso would produce negative stock. Movements are permanently immutable — no update or delete endpoints exist. The entity is a plain TypeORM class with no soft-delete column.

## Technical Context

**Language/Version**: TypeScript 5 / Node 20 (strict mode, no `any`)

**Primary Dependencies**: NestJS 10, TypeORM 0.3, class-validator, class-transformer (all already installed)

**Storage**: PostgreSQL — new table `movimientos_stock`, enum type `movimiento_tipo`

**Testing**: Jest (unit) + existing integration test suite

**Target Platform**: Linux server (same as M01–M05)

**Project Type**: REST web service module within NestJS monolith

**Performance Goals**: Standard CRUD — p95 < 200 ms for list/get under normal tenant load

**Constraints**: No new npm packages; TypeScript strict; reuse all existing shared infrastructure

**Scale/Scope**: Per-tenant append-only log; volume proportional to chemical purchase/consumption frequency

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | PARTIAL | MovimientoStock cannot extend BaseEntity (no deleted_at needed). Service cannot extend BaseCrudTenantService (custom QueryRunner logic). Both deviations are minimal and justified — all other shared infrastructure (ok/page, AppError, TenancyService, AuditService) is reused. |
| II. Multi-Tenancy | PASS | tenant_id on every row; all queries scoped with `WHERE tenant_id = :tenantId`; quimico cross-tenant validated via QuimicosService |
| III. Error Handling | PASS | AppError + ErrorCodes for all domain failures (MOVIMIENTO_NOT_FOUND, MOVIMIENTO_CANTIDAD_INVALIDA) |
| IV. Audit | PASS | AuditService.write() called on every POST with stock_movimiento_ingreso / stock_movimiento_egreso_manual |
| V. Roles | PASS | JwtAuthGuard + RolesGuard; supervisor and admin_global for POST; all authenticated for GET |
| VI. Transactions | PASS | QueryRunner wraps INSERT movimiento + UPDATE quimicos stock_actual; full rollback on failure |
| VII. API Responses | PASS | All endpoints return ok() or page() |
| VIII. Code Quality | PASS | Strict TS, class-validator DTOs, no any |
| IX. Modules | PASS | One module under src/modules/stock-movimientos/ |
| X. Small Steps | PASS | Single module, fully specified before implementation |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| MovimientoStock does not extend BaseEntity | BaseEntity includes deleted_at; movements are immutable and must never be soft-deleted — the column would be misleading and create a footgun for accidental softDelete calls | Could add deleted_at and never use it, but that violates the principle of honest data models |
| StockMovimientosService does not extend BaseCrudTenantService | The service needs a custom QueryRunner transaction that BaseEntity services don't support, and there is no update/delete to inherit | Could subclass and override everything, but that creates more coupling than a plain @Injectable() |

## Project Structure

### Documentation (this feature)

```text
specs/006-stock-movimientos/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api-spec.json    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
src/modules/stock-movimientos/
├── entities/
│   └── movimiento-stock.entity.ts
├── dto/
│   ├── create-movimiento.dto.ts
│   └── query-movimientos.dto.ts
├── stock-movimientos.service.ts
├── stock-movimientos.controller.ts
└── stock-movimientos.module.ts

migrations/
└── 1770700000000-StockMovimientosInit.ts

src/common/errors/
└── error-codes.ts        (add MOVIMIENTO_NOT_FOUND, MOVIMIENTO_CANTIDAD_INVALIDA)

src/app.module.ts         (add StockMovimientosModule import)
```

**Structure Decision**: Single NestJS module under `src/modules/stock-movimientos/`. No sub-directories beyond `entities/` and `dto/` — same flat structure as M04 Recetas and M05 Quimicos. Controller uses `@Controller()` (no prefix) with explicit route strings on each handler to accommodate the `/quimicos/:quimicoId/movimientos` convenience endpoint without modifying QuimicosModule.

## Implementation Details

### Entity: MovimientoStock

Plain TypeORM entity — NOT extending BaseEntity. Columns defined explicitly:

```
Table: movimientos_stock
- id: uuid PK DEFAULT gen_random_uuid()
- tenant_id: uuid (nullable — matches quimicos pattern; always set in practice)
- quimico_id: uuid NOT NULL FK → quimicos(id)
- establecimiento_id: uuid NOT NULL (denormalized, copied from quimico)
- tipo: movimiento_tipo ENUM NOT NULL ('ingreso' | 'egreso_manual')
- cantidad: decimal(10,3) NOT NULL CHECK > 0
- unidad_medida: varchar(30) NOT NULL (copied from quimico)
- numero_remito: varchar(100) NULLABLE
- observaciones: text NULLABLE
- usuario_id: uuid NOT NULL (from JWT)
- fecha: date NOT NULL DEFAULT CURRENT_DATE
- created_at: timestamptz NOT NULL DEFAULT now()
- updated_at: timestamptz NOT NULL DEFAULT now()
NO deleted_at
```

### Service: StockMovimientosService

Plain `@Injectable()`. Constructor injects: `DataSource`, `Repository<MovimientoStock>`, `QuimicosService`, `TenancyService`, `AuditService`.

#### `createMovimiento(dto: CreateMovimientoDto, userId: string)`

```
1. tenantId = tenancy.requireTenantId()
2. quimico = await quimicosService.mustFindById(dto.quimico_id, { strictTenant: true })
   → throws AppError QUIMICO_NOT_FOUND 404 if not in tenant
3. delta = dto.tipo === 'ingreso' ? +dto.cantidad : -dto.cantidad
4. projectedStock = Number(quimico.stock_actual) + delta
5. warning = projectedStock < 0 ? 'Stock resultante negativo' : undefined
6. qr = dataSource.createQueryRunner()
   await qr.connect(); await qr.startTransaction()
   try:
     movimiento = qr.manager.create(MovimientoStock, {
       tenant_id: tenantId,
       quimico_id: dto.quimico_id,
       tipo: dto.tipo,
       cantidad: dto.cantidad,
       unidad_medida: quimico.unidad_medida,      // ← from quimico, not dto
       establecimiento_id: quimico.establecimiento_id,  // ← from quimico, not dto
       usuario_id: userId,
       fecha: dto.fecha ?? today(),
       numero_remito: dto.numero_remito ?? null,
       observaciones: dto.observaciones ?? null,
     })
     saved = await qr.manager.save(MovimientoStock, movimiento)
     await qr.manager.query(
       `UPDATE quimicos SET stock_actual = stock_actual + $1 WHERE id = $2`,
       [delta, dto.quimico_id]   // atomic SQL, not JS-calculated value
     )
     await qr.commitTransaction()
   catch: await qr.rollbackTransaction(); throw
   finally: await qr.release()
7. await auditService.write(auditLogPayload({ ... }), 'stock_movimiento_ingreso' | 'stock_movimiento_egreso_manual')
8. return { movimiento: saved, quimico_stock_actual: projectedStock, warning }
   (warning key omitted from return if undefined — spread {...obj} without undefined keys)
```

#### `listMovimientos(q: QueryMovimientosDto)`

```
tenantId = tenancy.requireTenantId()
{ page, limit, skip } = clampPagination(q.page, q.limit, 200)
sortBy = q.sortBy in ['fecha', 'created_at'] ? q.sortBy : 'fecha'
sortOrder = q.sortOrder ?? 'DESC'
qb = repo.createQueryBuilder('m')
  .where('m.tenant_id = :tenantId', { tenantId })
if q.quimico_id → andWhere('m.quimico_id = :qid', ...)
if q.establecimiento_id → andWhere('m.establecimiento_id = :eid', ...)
if q.tipo → andWhere('m.tipo = :tipo', ...)
if q.fecha_desde → andWhere('m.fecha >= :desde', ...)
if q.fecha_hasta → andWhere('m.fecha <= :hasta', ...)
.orderBy(`m.${sortBy}`, sortOrder).skip(skip).take(limit)
[items, total] = await qb.getManyAndCount()
return { items, total }
```

#### `getMovimiento(id: string)`

```
tenantId = tenancy.requireTenantId()
m = await repo.findOne({ where: { id, tenant_id: tenantId } })
if !m → throw AppError MOVIMIENTO_NOT_FOUND 404
return m
```

#### `listByQuimico(quimicoId: string, q: QueryMovimientosDto)`

```
await quimicosService.mustFindById(quimicoId, { strictTenant: true })
return listMovimientos({ ...q, quimico_id: quimicoId })
```

### Controller: StockMovimientosController

`@Controller()` with NO path prefix. Routes:

| Decorator | Guard | Path | Handler |
|-----------|-------|------|---------|
| `@Get('stock-movimientos')` | JwtAuthGuard | GET /stock-movimientos | listMovimientos |
| `@Get('stock-movimientos/:id')` | JwtAuthGuard | GET /stock-movimientos/:id | getMovimiento |
| `@Post('stock-movimientos')` | JwtAuthGuard + RolesGuard | POST /stock-movimientos | createMovimiento |
| `@Get('quimicos/:quimicoId/movimientos')` | JwtAuthGuard | GET /quimicos/:quimicoId/movimientos | listByQuimico |

`createMovimiento` extracts `userId = req.user.sub` from JWT. Returns `ok({ movimiento, quimico_stock_actual, ...warning && { warning } })`.

### Module: StockMovimientosModule

```
imports: [TypeOrmModule.forFeature([MovimientoStock]), TenancyModule, AuditModule, QuimicosModule]
providers: [StockMovimientosService]
controllers: [StockMovimientosController]
exports: []  ← nothing exported; M08 will import this module when needed
```

### Migration: 1770700000000-StockMovimientosInit.ts

- CREATE TYPE movimiento_tipo AS ENUM ('ingreso', 'egreso_manual')
- CREATE TABLE movimientos_stock (all columns, no deleted_at, FK → quimicos)
- Indexes: tenant_id, quimico_id, establecimiento_id, tipo, fecha

### Error Codes to Add (error-codes.ts)

```typescript
// stock movimientos
MOVIMIENTO_NOT_FOUND: 'MOVIMIENTO_NOT_FOUND',
MOVIMIENTO_CANTIDAD_INVALIDA: 'MOVIMIENTO_CANTIDAD_INVALIDA',
```

### app.module.ts Change

Add `StockMovimientosModule` to the imports array after `QuimicosModule`.

## Phase 0: Research

See [research.md](research.md) — all decisions confirmed from existing codebase analysis.

## Phase 1: Design Artifacts

- [data-model.md](data-model.md) — entity schema, relationships, indexes
- [contracts/api-spec.json](contracts/api-spec.json) — OpenAPI 3.0 endpoint contracts
