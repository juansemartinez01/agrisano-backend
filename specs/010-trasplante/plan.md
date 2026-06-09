# Implementation Plan: M10 — Trasplante (Transplant)

**Branch**: `011-trasplante-transplant` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-trasplante/spec.md`

## Summary

Atomically transplant nursery trays (bandejas) into a greenhouse table (mesa): update each bandeja to estado=trasplantada + mesa_id, insert MesaBandeja join records, update the mesa to estado=activa + posicion_actual=MAX+1 in the target tunnel, and write a HistorialMesa entry of tipo_evento=trasplante — all in one QueryRunner transaction. Returns HTTP 200. Read endpoint: paginated MesaBandeja records per mesa.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS 10.x)

**Primary Dependencies**: NestJS, TypeORM, class-validator, nestjs-pino, passport-jwt

**Storage**: PostgreSQL via TypeORM DataSource + QueryRunner for atomic multi-step transactions

**Testing**: Manual integration via REST (no new test files required per project pattern)

**Target Platform**: Linux server (same environment as M01-M09)

**Project Type**: NestJS REST API module

**Performance Goals**: Transplant of 50 bandejas completes within 3 seconds under normal load (per spec SC-001)

**Constraints**: No new npm packages; strict TypeScript (no `any`); no modifications to existing modules except `error-codes.ts` and `app.module.ts`; records are immutable once written

**Scale/Scope**: Up to 50 bandejas per transplant; paginated history up to 10,000 records

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ | Service is plain @Injectable() (complex multi-table QueryRunner logic); controller uses @Controller() no-prefix pattern matching M06/M08/M09 |
| II. Multi-Tenancy | ✅ | tenancy.requireTenantId() in all write paths; read scoped via mesasService.getMesaById() tenant check |
| III. Error Handling | ✅ | 3 new ErrorCodes; AppError used for all domain failures; MesasService throws MESA_NOT_FOUND already |
| IV. Audit | ✅ | AuditService.write() on POST trasplante |
| V. Roles | ✅ | JwtAuthGuard + RolesGuard; create: operario/supervisor/admin_global; read: all authenticated |
| VI. Transactions | ✅ | Full QueryRunner: bandeja UPDATEs + MesaBandeja INSERTs + mesa UPDATE + HistorialMesa INSERT — commit or full rollback |
| VII. API Responses | ✅ | ok() and page() used exclusively; HTTP 200 on POST |
| VIII. Code Quality | ✅ | Strict types; class-validator on DTOs; no `any` |
| IX. Modules | ✅ | Single module src/modules/trasplante/ |
| X. Small Steps | ✅ | M09 fully implemented; M10 is next isolated step |

## Project Structure

### Documentation (this feature)

```text
specs/010-trasplante/
├── plan.md              ← this file
├── data-model.md        ← entity details
├── contracts/
│   └── api-spec.json    ← endpoint contracts
└── tasks.md             ← /speckit-tasks output (not yet)
```

### Source Code

```text
src/modules/trasplante/
├── entities/
│   └── mesa-bandeja.entity.ts        ← plain entity, composite PK (mesa_id, bandeja_id)
├── dto/
│   ├── create-trasplante.dto.ts
│   └── query-trasplantes.dto.ts
├── trasplante.service.ts             ← plain @Injectable()
├── trasplante.controller.ts          ← @Controller() no prefix
└── trasplante.module.ts

migrations/
└── 1771100000000-TrasplanteInit.ts   ← created in plan phase

src/common/errors/
└── error-codes.ts   ← add 3 new codes (// trasplante block)

src/app.module.ts    ← add TrasplanteModule import
```

## Implementation Details

### Error Codes to Add (error-codes.ts)

Add after the `// aplicaciones-quimicas` block:

```typescript
// trasplante
TRASPLANTE_MESA_ESTADO_INVALIDO: 'TRASPLANTE_MESA_ESTADO_INVALIDO',
TRASPLANTE_BANDEJA_INVALIDA: 'TRASPLANTE_BANDEJA_INVALIDA',
TRASPLANTE_ESTABLECIMIENTO_MISMATCH: 'TRASPLANTE_ESTABLECIMIENTO_MISMATCH',
```

### Entity Details

#### MesaBandeja (plain entity — no BaseEntity, no deleted_at)

```
Table: mesa_bandeja
Columns:
  mesa_id          uuid           NOT NULL  ← composite PK part 1
  bandeja_id       uuid           NOT NULL  ← composite PK part 2
  fecha_trasplante timestamptz    NOT NULL DEFAULT now()
  PK: (mesa_id, bandeja_id)
  FK: mesa_id → mesas(id)
  FK: bandeja_id → bandejas(id)
```

TypeORM entity:
```typescript
@Entity('mesa_bandeja')
export class MesaBandeja {
  @PrimaryColumn({ type: 'uuid' })
  mesa_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  bandeja_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_trasplante!: Date;
}
```

### DTO Details

#### CreateTrasplanteDto
```typescript
mesa_id      @IsUUID()
tunel_id     @IsUUID()
bandeja_ids  @IsArray() @IsUUID('all', { each: true }) @ArrayMinSize(1)
observaciones  @IsOptional() @IsString()
```

#### QueryTrasplantesDto
```typescript
extends PageQueryDto
sortBy?     @IsOptional() @IsString()
sortOrder?  @IsOptional() @IsIn(['ASC', 'DESC'])
```

### executeTrasplante — Full Algorithm

**PRE-TRANSACTION VALIDATIONS:**

1. `tenantId = this.tenancy.requireTenantId()`
2. `mesa = await this.mesasService.getMesaById(dto.mesa_id, tenantId)` — throws MESA_NOT_FOUND 404 if not found
3. Validate mesa state: `mesa.estado === MesaEstado.EN_COSECHA OR (mesa.estado === MesaEstado.ACTIVA AND mesa.posicion_actual === null)` → if not, throw `TRASPLANTE_MESA_ESTADO_INVALIDO` 422
4. `tunel = await this.tunelesService.mustFindById(dto.tunel_id, { strictTenant: true })` — throws TUNEL_NOT_FOUND 404 if not found
5. Validate `tunel.establecimiento_id === mesa.establecimiento_id` → throw `TRASPLANTE_ESTABLECIMIENTO_MISMATCH` 422 if mismatch
6. For each `bandeja_id` in `dto.bandeja_ids`:
   - `bandeja = await this.bandejaService.getBandeja(bandeja_id)` — throws BANDEJA_NOT_FOUND 404 if not found
   - Validate `bandeja.estado === BandejaEstado.EN_NURSERY` AND `bandeja.establecimiento_id === mesa.establecimiento_id` → throw `TRASPLANTE_BANDEJA_INVALIDA` 422 if fails

**TRANSACTION (QueryRunner):**

7. `qr = dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
8. Calculate new position:
   ```typescript
   const result: Array<{ max: string | null }> = await qr.query(
     `SELECT MAX(posicion_actual) AS max FROM mesas WHERE tunel_id = $1 AND deleted_at IS NULL AND posicion_actual IS NOT NULL`,
     [dto.tunel_id],
   );
   const newPos: number = (Number(result[0]?.max) || 0) + 1;
   ```
9. For each `bandeja_id`:
   ```typescript
   await qr.query(
     `UPDATE bandejas SET estado = 'trasplantada', mesa_id = $1, fecha_trasplante = now(), updated_at = now() WHERE id = $2`,
     [dto.mesa_id, bandeja_id],
   );
   await qr.manager.save(MesaBandeja, { mesa_id: dto.mesa_id, bandeja_id, fecha_trasplante: new Date() });
   ```
10. Update mesa:
    ```typescript
    await qr.query(
      `UPDATE mesas SET estado = 'activa', posicion_actual = $1, tunel_id = $2, fecha_ultimo_trasplante = now(), updated_at = now() WHERE id = $3`,
      [newPos, dto.tunel_id, dto.mesa_id],
    );
    ```
11. Write HistorialMesa:
    ```typescript
    await qr.manager.save(HistorialMesa, {
      mesa_id: dto.mesa_id,
      tipo_evento: HistorialTipoEvento.TRASPLANTE,
      tenant_id: tenantId,
      usuario_id: userId,
      fecha_hora: new Date(),
      detalle: {
        tunel_id: dto.tunel_id,
        posicion_actual: newPos,
        bandeja_ids: dto.bandeja_ids,
        observaciones: dto.observaciones ?? null,
      },
    });
    ```
12. `await qr.commitTransaction()`
13. `catch → await qr.rollbackTransaction(); throw`
14. `finally → await qr.release()`

**POST-TRANSACTION:**

15. `await this.writeAudit(AUDIT.TRASPLANTE, 'trasplante', dto.mesa_id, auditReq, tenantId, 200)`

**RESPONSE (HTTP 200):**
```typescript
return ok({
  mesa_id: dto.mesa_id,
  tunel_id: dto.tunel_id,
  posicion_actual: newPos,
  bandejas_trasplantadas: dto.bandeja_ids,
});
```

### listTrasplantesByMesa — Algorithm

1. `tenantId = this.tenancy.requireTenantId()`
2. `await this.mesasService.getMesaById(mesa_id, tenantId)` — throws MESA_NOT_FOUND 404 if not found or wrong tenant
3. `const { skip, limit } = clampPagination(q.page, q.limit, 200)`
4. QB on `mesa_bandeja` with alias `mb`:
   ```typescript
   .where('mb.mesa_id = :mesa_id', { mesa_id })
   .orderBy('mb.fecha_trasplante', 'DESC')
   .skip(skip).take(limit)
   ```
5. `getManyAndCount()` → return `{ items, total }`

### Controller Routes

| Method | Path | Guard | HTTP Status | Handler |
|--------|------|-------|-------------|---------|
| POST | `'trasplante'` | @Roles(operario, supervisor, admin_global) | 200 | `executeTrasplante()` |
| GET | `'mesas/:mesa_id/trasplantes'` | JwtAuthGuard | 200 | `listTrasplantesByMesa()` |

All declared at class level: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Controller()` with no prefix.

**Note**: POST uses `@HttpCode(200)` — default NestJS is 201 for POST, so this must be explicitly set.

### Module Definition

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([MesaBandeja]),
    TenancyModule,
    AuditModule,
    MesasModule,
    SiembraModule,
    TunelesModule,
  ],
  providers: [TrasplanteService],
  controllers: [TrasplanteController],
})
export class TrasplanteModule {}
```

### Key Import Notes

- `HistorialMesa` and `HistorialTipoEvento` → import from `src/modules/mesas/entities/historial-mesa.entity`; used directly in `qr.manager.save()` inside transaction
- `MesasModule` exports `MesasService` and `HistorialMesaService` — `HistorialMesa` entity is already registered in `MesasModule`; do NOT re-register it in `TypeOrmModule.forFeature([])` here
- `BandejaService` exported from `SiembraModule` → inject, call `getBandeja(id)` method (already tenant-scoped via TenancyService)
- `TunelesService` exported from `TunelesModule` → inject, call `mustFindById(id, { strictTenant: true })`
- `MesaEstado` → import from `src/modules/mesas/entities/mesa.entity`
- `BandejaEstado` → import from `src/modules/siembra/entities/bandeja.entity`
- `MesasService.getMesaById(id, tenantId)` → verified method signature in mesas.service.ts:135
- Bandeja entity has `establecimiento_id` field — confirmed in bandeja.entity.ts
- Mesa entity has `fecha_ultimo_trasplante` field — confirmed in mesa.entity.ts

### Audit Constants

```typescript
export const AUDIT = {
  TRASPLANTE: 'trasplante_ejecutado',
} as const;
```

## Migration

File: `migrations/1771100000000-TrasplanteInit.ts`

Summary:
- `CREATE TABLE mesa_bandeja` (composite PK: mesa_id + bandeja_id, fecha_trasplante timestamptz)
- FK: mesa_id → mesas(id)
- FK: bandeja_id → bandejas(id)
- INDEX on mesa_id (for GET /mesas/:id/trasplantes)
- INDEX on bandeja_id (for reverse lookups)

## Complexity Tracking

No constitution violations. Plain @Injectable() service justified by multi-table QueryRunner transaction (bandeja UPDATEs × N + MesaBandeja INSERTs × N + mesa UPDATE + HistorialMesa INSERT) requiring full atomicity.
