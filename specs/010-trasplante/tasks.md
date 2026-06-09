# Tasks: M10 — Trasplante

**Branch**: `011-trasplante-transplant` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Implementation Strategy

MVP = Phase 3 (US1: execute transplant). Phase 4 (US2: list history) builds on top.
All phases must reach `npx tsc --noEmit` clean before proceeding.

## Phase 1: Foundational

Blocking prerequisites — must complete before user story phases.

- [x] T001 Add 3 error codes to src/common/errors/error-codes.ts (TRASPLANTE_MESA_ESTADO_INVALIDO, TRASPLANTE_BANDEJA_INVALIDA, TRASPLANTE_ESTABLECIMIENTO_MISMATCH) after the `// aplicaciones-quimicas` block
- [x] T002 Create entity src/modules/trasplante/entities/mesa-bandeja.entity.ts — plain entity, @PrimaryColumn mesa_id and bandeja_id (uuid), @Column fecha_trasplante (timestamptz default now()), NO BaseEntity, NO deleted_at
- [x] T003 [P] Create DTO src/modules/trasplante/dto/create-trasplante.dto.ts — fields: mesa_id @IsUUID(), tunel_id @IsUUID(), bandeja_ids @IsArray() @IsUUID('all', { each: true }) @ArrayMinSize(1), observaciones @IsOptional() @IsString()
- [x] T004 [P] Create DTO src/modules/trasplante/dto/query-trasplantes.dto.ts — extends PageQueryDto, sortBy @IsOptional() @IsString(), sortOrder @IsOptional() @IsIn(['ASC','DESC'])

**MVP Checkpoint**: Run `npx tsc --noEmit` — must be clean before Phase 3.

## Phase 2: Verification

- [x] T005 Verify migration file migrations/1771100000000-TrasplanteInit.ts exists and contains CREATE TABLE mesa_bandeja with composite PK (mesa_id, bandeja_id), fecha_trasplante timestamptz, FK constraints, and 2 indexes — do NOT run or modify it

## Phase 3 — US1: Execute Transplant Operation

**Story goal**: POST /trasplante atomically transplants nursery bandejas into a greenhouse mesa.

**Independent test**: POST /trasplante with valid mesa (en_cosecha), tunel (same establecimiento), and 3 en_nursery bandejas → 200 with mesa_id, tunel_id, posicion_actual, bandejas_trasplantadas.

- [x] T006 [US1] Create service src/modules/trasplante/trasplante.service.ts — plain @Injectable(), inject: mesaRepo (NOT used directly), dataSource, tenancy, mesasService, bandejaService, tunelesService, audit, logger; import MesaEstado from mesas entity, BandejaEstado from bandeja entity; AUDIT constant = { TRASPLANTE: 'trasplante_ejecutado' }
- [x] T007 [US1] Implement executeTrasplante(dto: CreateTrasplanteDto, userId: string, auditReq) in TrasplanteService:
  PRE-TRANSACTION: (1) tenantId = tenancy.requireTenantId(); (2) load mesa via mesasService.getMesaById(dto.mesa_id, tenantId); (3) validate mesa.estado === EN_COSECHA OR (ACTIVA AND posicion_actual === null) → throw TRASPLANTE_MESA_ESTADO_INVALIDO 422; (4) load tunel via tunelesService.mustFindById(dto.tunel_id, { strictTenant: true }); (5) validate tunel.establecimiento_id === mesa.establecimiento_id → throw TRASPLANTE_ESTABLECIMIENTO_MISMATCH 422; (6) for each bandeja_id: bandejaService.getBandeja(id) then validate estado === EN_NURSERY AND establecimiento_id === mesa.establecimiento_id → throw TRASPLANTE_BANDEJA_INVALIDA 422;
  TRANSACTION: connect+start; SELECT MAX(posicion_actual) from mesas for newPos; for each bandeja_id: raw UPDATE bandejas SET estado='trasplantada', mesa_id=$1, fecha_trasplante=now(), updated_at=now(); qr.manager.save(MesaBandeja, { mesa_id, bandeja_id, fecha_trasplante: new Date() }); raw UPDATE mesas SET estado='activa', posicion_actual=$1, tunel_id=$2, fecha_ultimo_trasplante=now(), updated_at=now(); qr.manager.save(HistorialMesa, { ... tipo_evento: TRASPLANTE }); commit; catch → rollback+throw; finally release;
  POST: writeAudit(); return ok({ mesa_id, tunel_id, posicion_actual: newPos, bandejas_trasplantadas })
- [x] T008 [US1] Create controller src/modules/trasplante/trasplante.controller.ts — @UseGuards(JwtAuthGuard, RolesGuard) @Controller() no prefix; local AuthRequest type; POST 'trasplante' @Roles('operario','supervisor','admin_global') @HttpCode(200) → executeTrasplante; extract userId from req.user.sub
- [x] T009 [US1] Create module src/modules/trasplante/trasplante.module.ts — imports: TypeOrmModule.forFeature([MesaBandeja]), TenancyModule, AuditModule, MesasModule, SiembraModule, TunelesModule; providers: [TrasplanteService]; controllers: [TrasplanteController]; NO exports (nothing needed by other modules)
- [x] T010 [US1] Register TrasplanteModule in src/app.module.ts — add import and add to imports array after AplicacionesQuimicasModule

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 4 — US2: View Transplant History for a Mesa

**Story goal**: GET /mesas/:mesa_id/trasplantes returns paginated MesaBandeja records for that mesa.

**Independent test**: GET /mesas/:mesa_id/trasplantes → paginated list ordered by fecha_trasplante DESC; 404 if mesa not found or wrong tenant; empty page if no transplant history.

- [x] T011 [US2] Add listTrasplantesByMesa(mesa_id: string, q: QueryTrasplantesDto, tenantId: string) to TrasplanteService — validate mesa via mesasService.getMesaById(mesa_id, tenantId); clampPagination; QB on MesaBandeja alias 'mb' where mb.mesa_id=:mesa_id order by fecha_trasplante DESC; getManyAndCount(); return { items, total }; inject @InjectRepository(MesaBandeja) mesaBandejaRepo
- [x] T012 [US2] Add GET 'mesas/:mesa_id/trasplantes' route to TrasplanteController — JwtAuthGuard only (all authenticated); extract tenantId via tenancy.requireTenantId(); call listTrasplantesByMesa; return page(result, q)

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 5: Verification

- [x] T013 Final `npx tsc --noEmit` — zero errors required
- [x] T014 Verify migration 1771100000000-TrasplanteInit.ts is listed in migrations/ directory
- [x] T015 Verify TrasplanteModule is registered in app.module.ts imports array
- [x] T016 Verify no `any` type used in any new file (search src/modules/trasplante/)

## Dependencies

```
T001 → T006 (error codes must exist before service)
T002 → T006 (MesaBandeja entity needed in service)
T003, T004 → T007 (DTOs needed for service method signatures)
T006 → T007 (service class before implementing methods)
T007 → T008 (service before controller uses it)
T008 → T009 (controller before module wires it)
T009 → T010 (module before AppModule imports it)
T011 (adds to service) → T012 (adds route to controller)
T010 → T013 (all wired before final tsc check)
```

## Parallel Opportunities

- T003 and T004 can run simultaneously (different DTO files, no shared dependencies)
