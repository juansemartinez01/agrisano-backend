# Implementation Plan: M09 — Aplicaciones Químicas

**Branch**: `010-aplicaciones-quimicas` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-aplicaciones-quimicas/spec.md`

## Summary

Record chemical application events (nursery or greenhouse context) with fully atomic transactions: INSERT application + all detalles + bandeja/mesa links + quimico stock decrements + HistorialMesa entries per mesa — all in one QueryRunner. Pre-transaction stock warnings are calculated and returned in the response without blocking the commit. No update or delete operations — records are immutable.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS 10.x)

**Primary Dependencies**: NestJS, TypeORM, class-validator, nestjs-pino, passport-jwt

**Storage**: PostgreSQL via TypeORM DataSource + QueryRunner for atomic multi-step transactions

**Testing**: Manual integration via REST (no new test files required per project pattern)

**Target Platform**: Linux server (same environment as M01-M08)

**Project Type**: NestJS REST API module

**Performance Goals**: 104 DB writes (50 mesas × 3 quimicos) complete within 5 seconds under normal load (per spec SC-001)

**Constraints**: No new npm packages; strict TypeScript (no `any`); no modifications to existing modules except `error-codes.ts` and `app.module.ts`; immutable records (no delete/update endpoints)

**Scale/Scope**: Up to 50 target entities × 3 chemicals = 104 inserts per transaction; paginated list up to 10,000 records

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ | Service is plain @Injectable() (complex transaction logic); controller uses @Controller() no-prefix pattern matching M06/M08 |
| II. Multi-Tenancy | ✅ | tenancy.requireTenantId() in all write paths; all queries scoped to tenant_id |
| III. Error Handling | ✅ | 5 new ErrorCodes; AppError used for all domain failures |
| IV. Audit | ✅ | AuditService.write() on POST create, differentiated by contexto (nursery vs invernadero) |
| V. Roles | ✅ | JwtAuthGuard + RolesGuard; create: operario/supervisor/admin_global; read: all authenticated |
| VI. Transactions | ✅ | Full QueryRunner: aplicacion + detalles + links + stock UPDATE + historial — commit or full rollback |
| VII. API Responses | ✅ | ok() and page() used exclusively |
| VIII. Code Quality | ✅ | Strict types; class-validator on DTOs; no `any` |
| IX. Modules | ✅ | Single module src/modules/aplicaciones-quimicas/ |
| X. Small Steps | ✅ | M08 fully implemented; M09 is next isolated step |

## Project Structure

### Documentation (this feature)

```text
specs/009-aplicaciones-quimicas/
├── plan.md              ← this file
├── data-model.md        ← entity details
├── contracts/
│   └── api-spec.json    ← endpoint contracts
└── tasks.md             ← /speckit-tasks output (not yet)
```

### Source Code

```text
src/modules/aplicaciones-quimicas/
├── entities/
│   ├── aplicacion-quimica.entity.ts           ← plain entity (no BaseEntity)
│   ├── aplicacion-quimica-detalle.entity.ts   ← plain entity
│   ├── aplicacion-quimica-bandeja.entity.ts   ← plain entity, composite PK
│   └── aplicacion-quimica-mesa.entity.ts      ← plain entity, composite PK
├── dto/
│   ├── create-aplicacion.dto.ts
│   └── query-aplicaciones.dto.ts
├── aplicaciones-quimicas.service.ts
├── aplicaciones-quimicas.controller.ts
└── aplicaciones-quimicas.module.ts

migrations/
└── 1771000000000-AplicacionesQuimicasInit.ts   ← created in plan phase

src/common/errors/
└── error-codes.ts   ← add 5 new codes (// aplicaciones-quimicas block)

src/app.module.ts    ← add AplicacionesQuimicasModule import
```

## Implementation Details

### Error Codes to Add (error-codes.ts)

Add after the `// mesas` block:

```typescript
// aplicaciones-quimicas
APLICACION_NOT_FOUND: 'APLICACION_NOT_FOUND',
APLICACION_CONTEXTO_INVALIDO: 'APLICACION_CONTEXTO_INVALIDO',
APLICACION_TARGET_INVALIDO: 'APLICACION_TARGET_INVALIDO',
APLICACION_DETALLES_VACIOS: 'APLICACION_DETALLES_VACIOS',
APLICACION_TARGETS_VACIOS: 'APLICACION_TARGETS_VACIOS',
```

### Entity Details

#### AplicacionQuimica (plain entity — no BaseEntity)

```
Table: aplicaciones_quimicas
Columns:
  id                 uuid           PK, DEFAULT gen_random_uuid()
  tenant_id          uuid           nullable
  establecimiento_id uuid           NOT NULL
  contexto           enum           NOT NULL ('nursery' | 'invernadero')
  receta_id          uuid           nullable
  observaciones      text           nullable
  usuario_id         uuid           NOT NULL
  fecha_hora         timestamptz    NOT NULL DEFAULT now()
  created_at         timestamptz    NOT NULL DEFAULT now()
  updated_at         timestamptz    NOT NULL DEFAULT now()
  — NO deleted_at —
```

#### AplicacionQuimicaDetalle (plain entity)

```
Table: aplicaciones_quimicas_detalle
Columns:
  id             uuid           PK, DEFAULT gen_random_uuid()
  aplicacion_id  uuid           NOT NULL FK → aplicaciones_quimicas(id)
  quimico_id     uuid           NOT NULL FK → quimicos(id)
  cantidad       decimal(10,3)  NOT NULL
  unidad_medida  varchar(30)    NOT NULL  ← copied from quimico at insertion
```

#### AplicacionQuimicaBandeja (plain entity, composite PK)

```
Table: aplicacion_quimica_bandeja
Columns:
  aplicacion_id  uuid    NOT NULL FK → aplicaciones_quimicas(id)
  bandeja_id     uuid    NOT NULL
  PK: (aplicacion_id, bandeja_id)
```

#### AplicacionQuimicaMesa (plain entity, composite PK)

```
Table: aplicacion_quimica_mesa
Columns:
  aplicacion_id  uuid    NOT NULL FK → aplicaciones_quimicas(id)
  mesa_id        uuid    NOT NULL
  PK: (aplicacion_id, mesa_id)
```

### createAplicacion — Full Algorithm

**PRE-TRANSACTION VALIDATION:**

1. `tenantId = this.tenancy.requireTenantId()`
2. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })`
3. If `dto.contexto === AplicacionContexto.INVERNADERO` and `dto.receta_id` → throw `APLICACION_CONTEXTO_INVALIDO` 422
4. If `dto.detalles` is empty/missing → throw `APLICACION_DETALLES_VACIOS` 422
5. If `dto.contexto === 'nursery'` and `!dto.bandeja_ids?.length` → throw `APLICACION_TARGETS_VACIOS` 422
6. If `dto.contexto === 'invernadero'` and `!dto.mesa_ids?.length` → throw `APLICACION_TARGETS_VACIOS` 422
7. Load all quimicos: `this.quimicosService.mustFindById(id, { strictTenant: true })` for each `quimico_id`
8. Validate quimico `establecimiento_id === dto.establecimiento_id` → throw `APLICACION_TARGET_INVALIDO` 422 if mismatch
9. If nursery: `this.bandejaService.getBandeja(bandeja_id)` for each; validate `estado === 'en_nursery'` + `establecimiento_id` match
10. If invernadero: `this.mesasService.getMesaById(mesa_id, tenantId)` for each; validate `estado ∈ {activa, en_cosecha}` + `establecimiento_id` match
11. If `dto.receta_id`: `this.recetasService.mustFindById(dto.receta_id, { strictTenant: true })`
12. **Stock warnings** (before transaction): `projected = Number(quimico.stock_actual) - Number(detalle.cantidad)`; if `projected < 0` → push to `warnings[]`

**TRANSACTION (QueryRunner):**

13. `qr = dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
14. `const aplicacion = qr.manager.create(AplicacionQuimica, { tenant_id: tenantId, establecimiento_id, contexto, receta_id, observaciones, usuario_id, fecha_hora: new Date() }); const saved = await qr.manager.save(AplicacionQuimica, aplicacion)`
15. For each `detalle`:
    - `qr.manager.create(AplicacionQuimicaDetalle, { aplicacion_id: saved.id, quimico_id, cantidad, unidad_medida: quimicoMap[quimico_id].unidad_medida })`
    - `await qr.manager.save(AplicacionQuimicaDetalle, detalle)`
    - `await qr.query('UPDATE quimicos SET stock_actual = stock_actual - $1, updated_at = now() WHERE id = $2 AND tenant_id = $3', [detalle.cantidad, detalle.quimico_id, tenantId])`
16. If nursery: for each `bandeja_id`, `await qr.manager.save(AplicacionQuimicaBandeja, { aplicacion_id: saved.id, bandeja_id })`
17. If invernadero: for each `mesa_id`:
    - `await qr.manager.save(AplicacionQuimicaMesa, { aplicacion_id: saved.id, mesa_id })`
    - `await qr.manager.save(HistorialMesa, { mesa_id, tipo_evento: HistorialTipoEvento.APLICACION_QUIMICA, tenant_id: tenantId, usuario_id, fecha_hora: new Date(), detalle: { aplicacion_id: saved.id, quimicos: savedDetalles.map(d => ({ quimico_id: d.quimico_id, cantidad: d.cantidad })) } })`
18. `await qr.commitTransaction()`
19. `catch → await qr.rollbackTransaction(); throw`
20. `finally → await qr.release()`

Post-transaction: `this.writeAudit(AUDIT.NURSERY or AUDIT.INVERNADERO, ...)`

**RESPONSE:**
```typescript
return {
  aplicacion: saved,
  detalles: savedDetalles,
  afectados: contexto === 'nursery' ? { bandeja_ids } : { mesa_ids },
  warnings,
};
```

### Controller Routes

| Method | Path | Guard | Handler |
|--------|------|-------|---------|
| GET | `'aplicaciones-quimicas'` | JwtAuthGuard | `list()` |
| GET | `'aplicaciones-quimicas/:id'` | JwtAuthGuard | `getOne()` |
| POST | `'aplicaciones-quimicas'` | @Roles(operario, supervisor, admin_global) | `create()` |
| GET | `'mesas/:mesa_id/aplicaciones'` | JwtAuthGuard | `getByMesa()` |
| GET | `'bandejas/:bandeja_id/aplicaciones'` | JwtAuthGuard | `getByBandeja()` |

All declared at class level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()` with no prefix.

### Module Definition

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AplicacionQuimica,
      AplicacionQuimicaDetalle,
      AplicacionQuimicaBandeja,
      AplicacionQuimicaMesa,
    ]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
    QuimicosModule,
    SiembraModule,
    MesasModule,
    RecetasModule,
  ],
  providers: [AplicacionesQuimicasService],
  controllers: [AplicacionesQuimicasController],
})
export class AplicacionesQuimicasModule {}
```

### Key Import Notes

- `HistorialMesa` and `HistorialTipoEvento` → import from `src/modules/mesas/entities/historial-mesa.entity`; used directly in `qr.manager.save()` inside transaction
- `MesasModule` exports `MesasService` and `HistorialMesaService` — `HistorialMesa` entity is already registered in `MesasModule`; do NOT re-register it in `TypeOrmModule.forFeature([])` here
- `BandejaService` is exported from `SiembraModule` → inject and call `getBandeja(id)` method
- `QuimicosService` inherits `mustFindById()` from `BaseCrudTenantService` — uses active tenant context automatically
- `RecetasService` inherits `mustFindById()` — same pattern
- Build a `quimicoMap: Record<string, Quimico>` from loaded quimicos for O(1) lookup during detalle processing

### Audit Constants

```typescript
export const AUDIT = {
  NURSERY: 'aplicacion_quimica_nursery',
  INVERNADERO: 'aplicacion_quimica_invernadero',
} as const;
```

## Migration

File: `migrations/1771000000000-AplicacionesQuimicasInit.ts`

Summary:
- `CREATE TYPE aplicacion_contexto AS ENUM ('nursery', 'invernadero')`
- `CREATE TABLE aplicaciones_quimicas` (no deleted_at, 10 columns)
- `CREATE TABLE aplicaciones_quimicas_detalle` (uuid PK + 4 columns)
- `CREATE TABLE aplicacion_quimica_bandeja` (composite PK)
- `CREATE TABLE aplicacion_quimica_mesa` (composite PK)
- 9 indexes total

## Complexity Tracking

No constitution violations. Plain @Injectable() service justified by complex QueryRunner transaction spanning 4 tables + stock updates + historial writes in a single atomic operation.
