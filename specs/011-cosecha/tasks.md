# Tasks: M11 — Cosecha

**Branch**: `012-cosecha-harvest` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Implementation Strategy

MVP = Phase 3 (US1: register harvest). Phases 4–5 (read endpoints) build on top.
All phases must reach `npx tsc --noEmit` clean before proceeding.

## Phase 1: Foundational

Blocking prerequisites — must complete before user story phases.

- [x] T001 Add 2 error codes to `src/common/errors/error-codes.ts` after the `// trasplante` block: `COSECHA_NOT_FOUND: 'COSECHA_NOT_FOUND'` and `COSECHA_MESA_NO_DISPONIBLE: 'COSECHA_MESA_NO_DISPONIBLE'`
- [x] T002 Create entity `src/modules/cosecha/entities/cosecha.entity.ts` — plain entity (NO BaseEntity, NO deleted_at): @PrimaryGeneratedColumn('uuid') id; @Column uuid tenant_id (nullable: true); @Column uuid mesa_id; @Column uuid tunel_id; @Column int posicion_al_momento (default: 1); @Column timestamptz fecha_hora (default: () => 'now()'); @Column decimal(10,3) peso_kg; @Column uuid usuario_id; @Column text observaciones (nullable: true, default: null); @CreateDateColumn timestamptz created_at; @UpdateDateColumn timestamptz updated_at
- [x] T003 [P] Create DTO `src/modules/cosecha/dto/create-cosecha.dto.ts` — fields: mesa_id @IsUUID(), peso_kg @IsNumber() @Min(0.001) @Max(9999999.999), observaciones @IsOptional() @IsString() @MaxLength(2000)
- [x] T004 [P] Create DTO `src/modules/cosecha/dto/query-cosechas.dto.ts` — extends PageQueryDto: mesa_id @IsOptional() @IsUUID(), tunel_id @IsOptional() @IsUUID(), fecha_desde @IsOptional() @IsISO8601(), fecha_hasta @IsOptional() @IsISO8601(), sortBy @IsOptional() @IsString(), sortOrder @IsOptional() @IsIn(['ASC','DESC'])

**MVP Checkpoint**: Run `npx tsc --noEmit` — must be clean before Phase 3.

## Phase 2: Migration Verification

- [x] T005 Verify migration file `migrations/1771200000000-CosechaInit.ts` exists and contains CREATE TABLE cosechas with: PK id (uuid), columns tenant_id/mesa_id/tunel_id/posicion_al_momento/fecha_hora/peso_kg/usuario_id/observaciones/created_at/updated_at, NO deleted_at, and 4 indexes (tenant_id, mesa_id, tunel_id, fecha_hora) — do NOT run or modify it

## Phase 3 — US1: Register Harvest (POST /cosecha)

**Story goal**: POST /cosecha atomically records a harvest: inserts cosecha record, sets mesa to en_cosecha + posicion_actual=NULL, FIFO-decrements remaining mesas in tunnel, writes HistorialMesa entry.

**Independent test**: POST /cosecha with { mesa_id: <uuid of activa mesa at posicion_actual=1>, peso_kg: 1.250 } → 201 with ok({ cosecha, mesa_id, tunel_id, posicion_recalculada: true }); mesa transitions to en_cosecha; other mesas in tunnel have posicion_actual decremented by 1.

- [x] T006 [US1] Create service `src/modules/cosecha/cosecha.service.ts` — plain @Injectable() (NO BaseCrudTenantService); inject: @InjectRepository(Cosecha) cosechaRepo, dataSource, tenancy, mesasService, audit, logger; imports: MesaEstado from mesas entity, HistorialMesa + HistorialTipoEvento from historial-mesa entity, clampPagination from query-utils, auditLogPayload from audit.util; define AUDIT constant = { COSECHA: 'cosecha_registrada' }; define AuditReq interface { requestId, method, url, email?, userId }; define private writeAudit() helper matching M10 pattern
- [x] T007 [US1] Implement registrarCosecha(dto: CreateCosechaDto, userId: string, auditReq: AuditReq) in CosechaService:
  PRE-TRANSACTION (before QueryRunner opens): (1) tenantId = this.tenancy.requireTenantId(); (2) mesa = await this.mesasService.getMesaById(dto.mesa_id, tenantId) — throws MESA_NOT_FOUND 404; (3) validate mesa.estado === MesaEstado.ACTIVA && mesa.posicion_actual === 1 → throw AppError COSECHA_MESA_NO_DISPONIBLE status 422 if not; (4) const tunel_id = mesa.tunel_id (NO separate tunnel lookup);
  TRANSACTION: qr = dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction(); try { (1) saved = await qr.manager.save(Cosecha, { tenant_id: tenantId, mesa_id: dto.mesa_id, tunel_id, posicion_al_momento: 1, fecha_hora: new Date(), peso_kg: dto.peso_kg, usuario_id: userId, observaciones: dto.observaciones ?? null }); (2) await qr.query('UPDATE mesas SET estado = \'en_cosecha\', posicion_actual = NULL, updated_at = now() WHERE id = $1', [dto.mesa_id]); (3) await qr.query('UPDATE mesas SET posicion_actual = posicion_actual - 1, updated_at = now() WHERE tunel_id = $1 AND posicion_actual > 1 AND deleted_at IS NULL', [tunel_id]); (4) await qr.manager.save(HistorialMesa, { mesa_id: dto.mesa_id, tipo_evento: HistorialTipoEvento.COSECHA, tenant_id: tenantId, usuario_id: userId, fecha_hora: new Date(), detalle: { cosecha_id: saved.id, peso_kg: dto.peso_kg } }); await qr.commitTransaction(); } catch(err) { await qr.rollbackTransaction(); throw err; } finally { await qr.release(); }
  POST-TRANSACTION: await this.writeAudit(AUDIT.COSECHA, 'cosecha', saved.id, auditReq, tenantId, 201);
  RETURN: { cosecha: saved, mesa_id: dto.mesa_id, tunel_id, posicion_recalculada: true }
- [x] T008 [US1] Create controller `src/modules/cosecha/cosecha.controller.ts` — @UseGuards(JwtAuthGuard, RolesGuard) @Controller() NO prefix; local AuthRequest type (Request & { user: JwtPayload; id: string; tenantId?: string | null; method: string; url: string }); POST 'cosecha' @Roles('operario','supervisor','admin_global') @HttpCode(201) → registrarCosecha; extract userId = req.user?.sub; build auditReq from req; return ok(result)
- [x] T009 [US1] Create module `src/modules/cosecha/cosecha.module.ts` — imports: TypeOrmModule.forFeature([Cosecha]) (do NOT include HistorialMesa — already in MesasModule), TenancyModule, AuditModule, MesasModule; providers: [CosechaService]; controllers: [CosechaController]; exports: [CosechaService] (M12 Packing will need it)
- [x] T010 [US1] Register CosechaModule in `src/app.module.ts` — add import and add to imports array after TrasplanteModule

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 4 — US2: List Harvests (GET /cosecha)

**Story goal**: GET /cosecha returns paginated, filterable list of harvest records for the tenant.

**Independent test**: GET /cosecha?mesa_id=X&fecha_desde=2026-01-01T00:00:00Z → paginated list filtered by mesa; GET /cosecha?tunel_id=Y → filtered by tunnel; default sort fecha_hora DESC; empty page if no records match.

- [x] T011 [US2] Add listCosechas(q: QueryCosechasDto, tenantId: string) to CosechaService — tenantId = this.tenancy.requireTenantId(); clampPagination(q.page, q.limit, 200); QB on cosechas alias 'c': .where('c.tenant_id = :tenantId'); conditionally add andWhere for mesa_id, tunel_id, fecha_hora >= fecha_desde, fecha_hora <= fecha_hasta; .orderBy('c.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit); getManyAndCount(); return { items, total }
- [x] T012 [US2] Add GET 'cosecha' route to CosechaController — no roles restriction (all authenticated via JwtAuthGuard); extract tenantId from req.tenantId ?? ''; call listCosechas; return page(r.items, q.page ?? 1, q.limit ?? 20, r.total)

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 5 — US3 + US4: Single Record & Per-Mesa History

**Story goal**: GET /cosecha/:id returns single record; GET /mesas/:mesa_id/cosechas returns mesa-scoped paginated history. Both in CosechaController (NOT MesasController).

**Independent test**: GET /cosecha/:id → full record or 404 (COSECHA_NOT_FOUND); GET /mesas/:mesa_id/cosechas with valid mesa → paginated cosechas DESC; 404 if mesa not found.

- [x] T013 [P] [US3] Add getCosechaById(id: string, tenantId: string) to CosechaService — cosechaRepo.findOne({ where: { id, tenant_id: tenantId } }); if null throw AppError COSECHA_NOT_FOUND status 404; return cosecha
- [x] T014 [P] [US4] Add getCosechasByMesa(mesa_id: string, q: QueryCosechasDto, tenantId: string) to CosechaService — await mesasService.getMesaById(mesa_id, tenantId) to validate mesa exists; clampPagination; QB on cosechas alias 'c': .where('c.mesa_id = :mesa_id').andWhere('c.tenant_id = :tenantId').orderBy('c.fecha_hora','DESC').skip(skip).take(limit); getManyAndCount(); return { items, total }
- [x] T015 [US3+US4] Add GET 'cosecha/:id' and GET 'mesas/:mesa_id/cosechas' routes to CosechaController — both JwtAuthGuard only (no roles restriction); GET 'cosecha/:id': @Param('id') id, tenantId from req.tenantId ?? '', call getCosechaById, return ok(cosecha); GET 'mesas/:mesa_id/cosechas': @Param('mesa_id') mesa_id, tenantId from req.tenantId ?? '', call getCosechasByMesa, return page(r.items, q.page ?? 1, q.limit ?? 20, r.total)

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 6: Verification

- [x] T016 Final `npx tsc --noEmit` — zero errors required
- [x] T017 Verify migration `migrations/1771200000000-CosechaInit.ts` is listed in the migrations/ directory
- [x] T018 Verify CosechaModule is registered in `src/app.module.ts` imports array
- [x] T019 Verify no `any` type used in any new file under `src/modules/cosecha/`

## Dependencies

```
T001 → T006 (error codes must exist before service references them)
T002 → T006 (Cosecha entity needed in service constructor injection)
T003 → T007 (CreateCosechaDto needed for registrarCosecha signature)
T004 → T011, T014 (QueryCosechasDto needed for list/filter methods)
T006 → T007 (service class before implementing methods)
T007 → T008 (registrarCosecha before POST controller route)
T008 → T009 (controller before module wires it)
T009 → T010 (module before AppModule imports it)
T011 → T012 (listCosechas before GET 'cosecha' route)
T013, T014 → T015 (getCosechaById + getCosechasByMesa before read routes)
T010 → T016 (all wired before final tsc check)
```

## Parallel Opportunities

- T003 and T004 can run simultaneously (different DTO files, no shared dependencies)
- T013 and T014 can run simultaneously (independent service methods, different signatures)
