# Implementation Plan: M13 — Trazabilidad (Traceability)

**Branch**: `014-trazabilidad` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-trazabilidad/spec.md`

## Summary

Read-only traceability chain module. Two endpoints assemble multi-table data from M03–M12 tables with no writes, no migrations, and no new entities. `TrazabilidadService` is a plain `@Injectable()` that injects `DataSource` directly and runs raw SQL queries for all multi-table joins. `TrazabilidadController` uses `@Controller()` with no prefix — route strings on each handler. No `BaseCrudTenantService`, no `@InjectRepository`. `CosechaModule` and `MesasModule` are imported only for tenant-ownership validation (their services throw 404 if the record does not belong to the tenant). All responses via `ok()`.

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js (NestJS 10.x)

**Primary Dependencies**: NestJS, TypeORM DataSource (raw queries), passport-jwt

**Storage**: PostgreSQL — reads from tables: `mesas`, `cosechas`, `mesa_bandeja`, `bandejas`, `siembras`, `lotes`, `lotes_packing`, `lotes_packing_categorias`, `aplicaciones_quimicas`, `aplicaciones_quimicas_detalle`, `aplicacion_quimica_mesa`, `aplicacion_quimica_bandeja`

**Testing**: Manual integration via REST (project pattern — no new test files required)

**Target Platform**: Linux server (same as M01–M12)

**Project Type**: NestJS REST API module

**Performance Goals**: Both endpoints complete within 2 seconds under normal tenant load (sequential raw queries, no N+1 beyond per-bandeja siembra fetch)

**Constraints**: No new npm packages; strict TypeScript (no `any`); no modifications to existing modules except `app.module.ts`; no new error codes (reuses `COSECHA_NOT_FOUND`, `MESA_NOT_FOUND`)

**Scale/Scope**: Unbounded cosecha list per mesa (no pagination); read-only

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Template First | ✅ | Plain `@Injectable()` — multi-table raw queries across 10+ tables justify no base class; matches M09–M12 pattern for complex aggregation |
| II. Multi-Tenancy | ✅ | `tenancy.requireTenantId()` on both paths; cosecha/mesa ownership validated via `CosechaService` and `MesasService`; all raw queries include `tenant_id` parameter |
| III. Error Handling | ✅ | Reuses `COSECHA_NOT_FOUND` and `MESA_NOT_FOUND` via delegated service calls; no new error codes needed |
| IV. Audit | ✅ | Read-only module — audit writes are not required for read operations per constitution |
| V. Roles | ✅ | `JwtAuthGuard` only; no `RolesGuard` — all authenticated users may read traceability data |
| VI. Transactions | ✅ | Read-only — no transaction required |
| VII. API Responses | ✅ | `ok()` used exclusively |
| VIII. Code Quality | ✅ | Strict types; no `any`; raw query results typed via explicit interfaces |
| IX. Modules | ✅ | Single module `src/modules/trazabilidad/` |
| X. Small Steps | ✅ | M12 fully implemented; M13 is the final isolated step |

## Project Structure

### Documentation (this feature)

```text
specs/013-trazabilidad/
├── plan.md              ← this file
├── spec.md              ← feature spec
├── contracts/
│   └── api-spec.json    ← endpoint contracts
└── tasks.md             ← /speckit-tasks output (not yet)
```

### Source Code

```text
src/modules/trazabilidad/
├── trazabilidad.service.ts     ← plain @Injectable(), DataSource injection
├── trazabilidad.controller.ts  ← @Controller() no prefix, JwtAuthGuard only
└── trazabilidad.module.ts

src/app.module.ts  ← add TrazabilidadModule import
```

No new entities. No new DTOs (no request body — path params only). No migration.

## Implementation Details

### Service: TrazabilidadService

```typescript
@Injectable()
export class TrazabilidadService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly cosechaService: CosechaService,
    private readonly mesasService: MesasService,
  ) {}
```

#### getTrazabilidadByCosecha(cosecha_id: string, tenantId: string)

**STEP 1 — Validate cosecha (throws COSECHA_NOT_FOUND 404 if missing/wrong tenant):**
```typescript
const cosecha = await this.cosechaService.getCosechaById(cosecha_id, tenantId);
```

**STEP 2 — Load mesa info:**
```typescript
const [mesa] = await this.dataSource.query<MesaRow[]>(
  `SELECT id, codigo_qr, estado, tunel_id, establecimiento_id
   FROM mesas
   WHERE id = $1 AND deleted_at IS NULL`,
  [cosecha.mesa_id],
);
```

**STEP 3 — Determine cycle transplant date:**
```typescript
const [cycleResult] = await this.dataSource.query<{ cycle_date: string | null }[]>(
  `SELECT MAX(fecha_trasplante) AS cycle_date
   FROM mesa_bandeja
   WHERE mesa_id = $1 AND fecha_trasplante <= $2`,
  [cosecha.mesa_id, cosecha.fecha_hora],
);
const cycleDate: string | null = cycleResult?.cycle_date ?? null;
```

**STEP 4 — Load cycle bandejas (only if cycleDate is not null):**
```typescript
let bandejasCiclo: BandejaCicloRow[] = [];
let bandejaIds: string[] = [];

if (cycleDate) {
  const mbRows = await this.dataSource.query<MesaBandejaRaw[]>(
    `SELECT mb.bandeja_id, mb.fecha_trasplante,
            b.siembra_id, b.lote_semilla_id, b.lote_sustrato_id, b.estado
     FROM mesa_bandeja mb
     JOIN bandejas b ON b.id = mb.bandeja_id
     WHERE mb.mesa_id = $1 AND mb.fecha_trasplante = $2`,
    [cosecha.mesa_id, cycleDate],
  );
  bandejaIds = mbRows.map(r => r.bandeja_id);

  // For each bandeja: load siembra + lotes
  bandejasCiclo = await Promise.all(
    mbRows.map(async (mb) => {
      const [siembra] = await this.dataSource.query<SiembraRow[]>(
        `SELECT s.id, s.fecha_hora, s.usuario_id,
                ls.id AS lote_semilla_id, ls.codigo AS lote_semilla_codigo,
                lsu.id AS lote_sustrato_id, lsu.codigo AS lote_sustrato_codigo
         FROM siembras s
         JOIN lotes ls ON ls.id = s.lote_semilla_id
         JOIN lotes lsu ON lsu.id = s.lote_sustrato_id
         WHERE s.id = $1`,
        [mb.siembra_id],
      );
      return { ...mb, siembra: siembra ?? null };
    }),
  );
}
```

**STEP 5 — Load packing (LEFT JOIN lotes_packing + lotes_packing_categorias):**
```typescript
const packingRows = await this.dataSource.query<PackingRow[]>(
  `SELECT lp.id, lp.fecha_hora, lp.peso_bruto_kg, lp.usuario_id, lp.observaciones,
          array_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
   FROM lotes_packing lp
   LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
   WHERE lp.cosecha_id = $1 AND lp.tenant_id = $2
   GROUP BY lp.id`,
  [cosecha_id, tenantId],
);
const packing = packingRows[0] ?? null;
```

**STEP 6 — Load greenhouse chemical applications (only if cycleDate is not null):**
```typescript
let aplicacionesInvernadero: AplicacionRow[] = [];
if (cycleDate) {
  aplicacionesInvernadero = await this.dataSource.query<AplicacionRow[]>(
    `SELECT a.id, a.fecha_hora, a.observaciones, a.usuario_id, a.receta_id,
            json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles
     FROM aplicaciones_quimicas a
     JOIN aplicacion_quimica_mesa aqm ON aqm.aplicacion_id = a.id
     LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id
     WHERE aqm.mesa_id = $1
       AND a.fecha_hora >= $2
       AND a.fecha_hora <= $3
       AND a.tenant_id = $4
     GROUP BY a.id
     ORDER BY a.fecha_hora ASC`,
    [cosecha.mesa_id, cycleDate, cosecha.fecha_hora, tenantId],
  );
}
```

**STEP 7 — Load nursery chemical applications (only if bandejaIds.length > 0):**
```typescript
let aplicacionesNursery: AplicacionRow[] = [];
if (bandejaIds.length > 0) {
  aplicacionesNursery = await this.dataSource.query<AplicacionRow[]>(
    `SELECT a.id, a.fecha_hora, a.receta_id, a.observaciones, a.usuario_id,
            json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles
     FROM aplicaciones_quimicas a
     JOIN aplicacion_quimica_bandeja aqb ON aqb.aplicacion_id = a.id
     LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id
     WHERE aqb.bandeja_id = ANY($1::uuid[])
       AND a.contexto = 'nursery'
       AND a.tenant_id = $2
     GROUP BY a.id
     ORDER BY a.fecha_hora ASC`,
    [bandejaIds, tenantId],
  );
}
```

**RETURN:**
```typescript
return {
  cosecha,
  mesa: mesa ?? null,
  packing,
  bandejas_ciclo: bandejasCiclo,
  aplicaciones_invernadero: aplicacionesInvernadero,
  aplicaciones_nursery: aplicacionesNursery,
};
```

---

#### getTrazabilidadByMesa(mesa_id: string, tenantId: string)

**STEP 1 — Validate mesa (throws MESA_NOT_FOUND 404 if missing/wrong tenant):**
```typescript
const mesa = await this.mesasService.getMesaById(mesa_id, tenantId);
```

**STEP 2 — Load all cosechas with packing summary:**
```typescript
const rows = await this.dataSource.query<CosechaMesaRow[]>(
  `SELECT c.id, c.fecha_hora, c.peso_kg, c.tunel_id,
          lp.id AS packing_id, lp.peso_bruto_kg,
          json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
   FROM cosechas c
   LEFT JOIN lotes_packing lp ON lp.cosecha_id = c.id
   LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
   WHERE c.mesa_id = $1 AND c.tenant_id = $2
   GROUP BY c.id, lp.id, lp.peso_bruto_kg
   ORDER BY c.fecha_hora DESC`,
  [mesa_id, tenantId],
);
```

**RETURN:**
```typescript
return {
  mesa: {
    id: mesa.id,
    codigo_qr: mesa.codigo_qr,
    estado: mesa.estado,
    tunel_id: mesa.tunel_id,
    establecimiento_id: mesa.establecimiento_id,
  },
  cosechas: rows.map(r => ({
    cosecha_id: r.id,
    fecha_hora: r.fecha_hora,
    peso_kg: r.peso_kg,
    packing: r.packing_id
      ? { peso_bruto_kg: r.peso_bruto_kg, categorias: r.categorias ?? [] }
      : null,
  })),
};
```

---

### Controller: TrazabilidadController

```typescript
@Controller()
@UseGuards(JwtAuthGuard)
export class TrazabilidadController {
  constructor(private readonly svc: TrazabilidadService) {}

  @Get('trazabilidad/cosecha/:cosecha_id')
  async getTrazabilidadByCosecha(
    @Param('cosecha_id') cosecha_id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.tenancy.requireTenantId();
    const result = await this.svc.getTrazabilidadByCosecha(cosecha_id, tenantId);
    return ok(result);
  }

  @Get('trazabilidad/mesa/:mesa_id')
  async getTrazabilidadByMesa(
    @Param('mesa_id') mesa_id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.tenancy.requireTenantId();
    const result = await this.svc.getTrazabilidadByMesa(mesa_id, tenantId);
    return ok(result);
  }
}
```

**Note**: `tenantId` is obtained from `TenancyService.requireTenantId()` (injected as a constructor param alongside the service). No `req.tenantId` pattern needed if TenancyService is already request-scoped; align with existing module pattern (see M11/M12 controller for exact tenancy extraction pattern).

### Module: TrazabilidadModule

```typescript
@Module({
  imports: [
    TenancyModule,
    CosechaModule,   // exports CosechaService (getCosechaById)
    MesasModule,     // exports MesasService (getMesaById)
  ],
  providers: [TrazabilidadService],
  controllers: [TrazabilidadController],
  exports: [],
})
export class TrazabilidadModule {}
```

### app.module.ts change

Add `TrazabilidadModule` to the `imports` array after `PackingModule`.

### Result Interfaces (typed raw query rows)

Define inline in the service file (or a co-located types file if preferred):

```typescript
interface MesaRow {
  id: string;
  codigo_qr: string;
  estado: string;
  tunel_id: string | null;
  establecimiento_id: string | null;
}

interface MesaBandejaRaw {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
}

interface SiembraRow {
  id: string;
  fecha_hora: string;
  usuario_id: string;
  lote_semilla_id: string;
  lote_semilla_codigo: string;
  lote_sustrato_id: string;
  lote_sustrato_codigo: string;
}

interface BandejaCicloRow extends MesaBandejaRaw {
  siembra: SiembraRow | null;
}

interface AplicacionRow {
  id: string;
  fecha_hora: string;
  receta_id: string | null;
  observaciones: string | null;
  usuario_id: string;
  detalles: Record<string, unknown>[] | null;
}

interface PackingRow {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: number;
  usuario_id: string;
  observaciones: string | null;
  categorias: Record<string, unknown>[] | null;
}

interface CosechaMesaRow {
  id: string;
  fecha_hora: string;
  peso_kg: number;
  tunel_id: string | null;
  packing_id: string | null;
  peso_bruto_kg: number | null;
  categorias: Record<string, unknown>[] | null;
}
```

### Key Import References

| Symbol | Source |
|--------|--------|
| `ok` | `src/common/http/api-response` |
| `AppError`, `ErrorCodes` | `src/common/errors/` (reuse `COSECHA_NOT_FOUND`, `MESA_NOT_FOUND`) |
| `TenancyService` | `TenancyModule` |
| `CosechaService` | `CosechaModule` (exported) |
| `MesasService`, `MesaWithTunel` | `MesasModule` (exported) |
| `DataSource` | `typeorm` |
| `JwtAuthGuard` | `src/common/auth/` or `infra/auth/` (follow project pattern) |
| `AuthRequest` | Follow pattern from M11/M12 controller |

### No Migration

No migration file needed — this module reads exclusively from tables created by M03–M12.

### No New Error Codes

Reuses `ErrorCodes.COSECHA_NOT_FOUND` (thrown by `CosechaService.getCosechaById`) and `ErrorCodes.MESA_NOT_FOUND` (thrown by `MesasService.getMesaById`).
