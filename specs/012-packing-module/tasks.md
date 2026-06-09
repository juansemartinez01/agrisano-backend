# Tasks: M12 — Packing

**Branch**: `013-packing-module` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Implementation Strategy

MVP = Phase 3 (US1: register packing). Phases 4–5 (read endpoints) build on top.
All phases must reach `npx tsc --noEmit` clean before proceeding.

## Phase 1: Foundational

Blocking prerequisites — must complete before user story phases.

- [x] T001 Add 3 error codes to `src/common/errors/error-codes.ts` after the `// cosecha` block: `PACKING_NOT_FOUND: 'PACKING_NOT_FOUND'`, `PACKING_YA_REGISTRADO: 'PACKING_YA_REGISTRADO'`, `PACKING_CATEGORIA_DUPLICADA: 'PACKING_CATEGORIA_DUPLICADA'`
- [x] T002 [P] Create entity `src/modules/packing/entities/lote-packing.entity.ts` — plain entity (NO BaseEntity, NO deleted_at): export enum CategoriaPackingEnum { PRIMERA='primera', SEGUNDA='segunda', DESCARTE='descarte' }; @Entity('lotes_packing') export class LotePacking { @PrimaryGeneratedColumn('uuid') id!: string; @Column({ type: 'uuid', nullable: true }) tenant_id!: string | null; @Column({ type: 'uuid', unique: true }) cosecha_id!: string; @Column({ type: 'timestamptz', default: () => 'now()' }) fecha_hora!: Date; @Column({ type: 'decimal', precision: 10, scale: 3 }) peso_bruto_kg!: number; @Column({ type: 'uuid' }) usuario_id!: string; @Column({ type: 'text', nullable: true, default: null }) observaciones!: string | null; @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date; @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date; }
- [x] T003 [P] Create entity `src/modules/packing/entities/lote-packing-categoria.entity.ts` — plain entity (NO BaseEntity): @Entity('lotes_packing_categorias') export class LotePackingCategoria { @PrimaryGeneratedColumn('uuid') id!: string; @Column({ type: 'uuid' }) lote_packing_id!: string; @Column({ type: 'varchar', length: 10 }) categoria!: CategoriaPackingEnum; @Column({ type: 'decimal', precision: 10, scale: 3 }) peso_kg!: number; @Column({ type: 'int' }) cantidad_cajas!: number; @Column({ type: 'decimal', precision: 10, scale: 3 }) peso_neto_por_caja!: number; } — import CategoriaPackingEnum from lote-packing.entity
- [x] T004 [P] Create DTO `src/modules/packing/dto/create-packing.dto.ts` — export class CreatePackingCategoriaDto { @IsEnum(CategoriaPackingEnum) categoria!: CategoriaPackingEnum; @IsNumber() @Min(0.001) @Max(9999999.999) peso_kg!: number; @IsInt() @Min(1) cantidad_cajas!: number; @IsNumber() @Min(0.001) @Max(9999999.999) peso_neto_por_caja!: number; }; export class CreatePackingDto { @IsUUID() cosecha_id!: string; @IsNumber() @Min(0.001) @Max(9999999.999) peso_bruto_kg!: number; @IsOptional() @IsString() @MaxLength(1000) observaciones?: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => CreatePackingCategoriaDto) categorias!: CreatePackingCategoriaDto[]; }
- [x] T005 [P] Create DTO `src/modules/packing/dto/query-packing.dto.ts` — extends PageQueryDto: cosecha_id @IsOptional() @IsUUID(), sortBy @IsOptional() @IsString(), sortOrder @IsOptional() @IsIn(['ASC','DESC'])

**MVP Checkpoint**: Run `npx tsc --noEmit` — must be clean before Phase 3.

## Phase 2: Migration Verification

- [x] T006 Verify migration file `migrations/1771300000000-PackingInit.ts` exists and contains: CREATE TABLE lotes_packing with PK id (uuid), UNIQUE cosecha_id, columns tenant_id/cosecha_id/fecha_hora/peso_bruto_kg/usuario_id/observaciones/created_at/updated_at, NO deleted_at; CREATE TABLE lotes_packing_categorias with PK id (uuid), columns lote_packing_id/categoria/peso_kg/cantidad_cajas/peso_neto_por_caja; and indexes IDX_lotes_packing_tenant_id, IDX_lotes_packing_cosecha_id, IDX_lotes_packing_cat_lp_id — do NOT run or modify it

## Phase 3 — US1: Register Packing (POST /packing)

**Story goal**: POST /packing atomically records a packing batch and 1–3 category breakdowns for a cosecha. Returns HTTP 201 with ok({ lote_packing, categorias }).

**Independent test**: POST /packing with { cosecha_id: <valid uuid>, peso_bruto_kg: 125.500, categorias: [{ categoria: 'primera', peso_kg: 100.000, cantidad_cajas: 10, peso_neto_por_caja: 10.000 }] } → 201 with ok({ lote_packing, categorias }); second POST with same cosecha_id → 409 PACKING_YA_REGISTRADO; POST with [{ categoria: 'primera' … }, { categoria: 'primera' … }] → 422 PACKING_CATEGORIA_DUPLICADA.

- [x] T007 [US1] Create service `src/modules/packing/packing.service.ts` — plain @Injectable() (NO BaseCrudTenantService); inject: @InjectRepository(LotePacking) lotePackingRepo: Repository<LotePacking>, @InjectRepository(LotePackingCategoria) categoriaRepo: Repository<LotePackingCategoria>, private readonly dataSource: DataSource, private readonly tenancy: TenancyService, private readonly cosechaService: CosechaService, private readonly auditService: AuditService, private readonly logger: Logger; define AuditReq interface { requestId: string; method: string; url: string; email?: string; userId: string }; define AUDIT constant = { PACKING: 'packing_registrado' } as const; define private writeAudit(action, entity, entityId, auditReq, tenantId, status) helper using auditLogPayload matching M10/M11 pattern; imports: clampPagination from src/common/query/query-utils, auditLogPayload from src/common/audit/audit.util, ok/page from src/common/http/api-response, AppError/ErrorCodes from src/common/errors/, CosechaService from src/modules/cosecha/cosecha.service
- [x] T008 [US1] Implement registrarPacking(dto: CreatePackingDto, userId: string, auditReq: AuditReq) in PackingService:
  PRE-TRANSACTION (ALL before QueryRunner opens): (1) tenantId = this.tenancy.requireTenantId(); (2) await this.cosechaService.getCosechaById(dto.cosecha_id, tenantId) — throws COSECHA_NOT_FOUND 404 if cosecha missing or wrong tenant; (3) duplicate-category check: const cats = dto.categorias.map(c => c.categoria); if (new Set(cats).size !== cats.length) throw new AppError(ErrorCodes.PACKING_CATEGORIA_DUPLICADA, 422); (4) uniqueness pre-check: const existing = await this.lotePackingRepo.findOne({ where: { cosecha_id: dto.cosecha_id } }); if (existing) throw new AppError(ErrorCodes.PACKING_YA_REGISTRADO, 409);
  TRANSACTION: qr = this.dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction(); try { (1) const saved = await qr.manager.save(LotePacking, { tenant_id: tenantId, cosecha_id: dto.cosecha_id, fecha_hora: new Date(), peso_bruto_kg: dto.peso_bruto_kg, usuario_id: userId, observaciones: dto.observaciones ?? null }); (2) const savedCategorias = await qr.manager.save(LotePackingCategoria, dto.categorias.map(c => ({ lote_packing_id: saved.id, categoria: c.categoria, peso_kg: c.peso_kg, cantidad_cajas: c.cantidad_cajas, peso_neto_por_caja: c.peso_neto_por_caja }))); await qr.commitTransaction(); } catch(err) { await qr.rollbackTransaction(); throw err; } finally { await qr.release(); }
  POST-TRANSACTION: await this.writeAudit(AUDIT.PACKING, 'lote_packing', saved.id, auditReq, tenantId, 201);
  RETURN: { lote_packing: saved, categorias: savedCategorias }
- [x] T009 [US1] Create controller `src/modules/packing/packing.controller.ts` — @UseGuards(JwtAuthGuard, RolesGuard) @Controller() NO prefix; local AuthRequest type (Request & { user: JwtPayload; id: string; tenantId?: string | null; method: string; url: string }); POST 'packing' @Roles('operario','supervisor','admin_global') @HttpCode(201) → registrarPacking; extract userId = req.user?.sub; build auditReq from req; return ok(result)
- [x] T010 [US1] Create module `src/modules/packing/packing.module.ts` — imports: TypeOrmModule.forFeature([LotePacking, LotePackingCategoria]), TenancyModule, AuditModule, CosechaModule; providers: [PackingService]; controllers: [PackingController]; exports: [] — nothing exported (no module depends on PackingService)
- [x] T011 [US1] Register PackingModule in `src/app.module.ts` — add import and add to imports array after CosechaModule

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 4 — US2: View Packing for a Cosecha (GET /packing/:id + GET /cosechas/:cosecha_id/packing)

**Story goal**: GET /packing/:id returns single packing with categorias[] nested; GET /cosechas/:cosecha_id/packing returns the packing for a specific cosecha or 404.

**Independent test**: GET /packing/:id with valid id → ok({ lote_packing, categorias[] }); invalid id → 404 PACKING_NOT_FOUND; GET /cosechas/:cosecha_id/packing with existing packing → ok({ lote_packing, categorias[] }); cosecha with no packing → 404 PACKING_NOT_FOUND.

- [x] T012 [P] [US2] Add getPackingById(id: string, tenantId: string) to PackingService — lotePackingRepo.findOne({ where: { id, tenant_id: tenantId } }); if null throw AppError PACKING_NOT_FOUND 404; categorias = await categoriaRepo.find({ where: { lote_packing_id: id } }); return { lote_packing: lp, categorias }
- [x] T013 [P] [US2] Add getPackingByCosecha(cosecha_id: string, tenantId: string) to PackingService — await cosechaService.getCosechaById(cosecha_id, tenantId) to validate cosecha exists; lp = await lotePackingRepo.findOne({ where: { cosecha_id, tenant_id: tenantId } }); if null throw AppError PACKING_NOT_FOUND 404; categorias = await categoriaRepo.find({ where: { lote_packing_id: lp.id } }); return { lote_packing: lp, categorias }
- [x] T014 [US2] Add GET 'packing/:id' and GET 'cosechas/:cosecha_id/packing' routes to PackingController — both JwtAuthGuard only (no roles restriction); GET 'packing/:id': @Param('id') id, tenantId from req.tenantId ?? '', call getPackingById, return ok(result); GET 'cosechas/:cosecha_id/packing': @Param('cosecha_id') cosecha_id, tenantId from req.tenantId ?? '', call getPackingByCosecha, return ok(result) — NOTE: this route is in PackingController, NOT CosechaController

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 5 — US3: Browse All Packing Records (GET /packing)

**Story goal**: GET /packing returns paginated list of all packing records, filterable by cosecha_id.

**Independent test**: GET /packing → paginated list, default sort fecha_hora DESC; GET /packing?cosecha_id=X → list filtered to that cosecha; empty page if no records match.

- [x] T015 [US3] Add listPacking(q: QueryPackingDto, tenantId: string) to PackingService — tenantId = this.tenancy.requireTenantId(); const { skip, limit } = clampPagination(q.page, q.limit, 200); QB on lotes_packing alias 'lp': .where('lp.tenant_id = :tenantId', { tenantId }); if q.cosecha_id: .andWhere('lp.cosecha_id = :cosecha_id', { cosecha_id: q.cosecha_id }); .orderBy('lp.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit); getManyAndCount(); return { items, total }
- [x] T016 [US3] Add GET 'packing' route to PackingController — no roles restriction (all authenticated via JwtAuthGuard); @Query() q: QueryPackingDto, tenantId from req.tenantId ?? ''; call listPacking; return page(r.items, q.page ?? 1, q.limit ?? 20, r.total)

**Checkpoint**: Run `npx tsc --noEmit` — must be clean.

## Phase 6: Verification

- [x] T017 Final `npx tsc --noEmit` — zero errors required
- [x] T018 Verify migration `migrations/1771300000000-PackingInit.ts` is listed in the migrations/ directory
- [x] T019 Verify PackingModule is registered in `src/app.module.ts` imports array
- [x] T020 Verify no `any` type used in any new file under `src/modules/packing/`

## Dependencies

```
T001 → T007 (error codes must exist before service references them)
T002 → T007 (LotePacking entity needed in service constructor injection)
T003 → T007 (LotePackingCategoria entity needed in service constructor injection)
T004 → T008 (CreatePackingDto needed for registrarPacking signature)
T005 → T015 (QueryPackingDto needed for listPacking)
T007 → T008 (service class before implementing registrarPacking)
T008 → T009 (registrarPacking before POST controller route)
T009 → T010 (controller before module wires it)
T010 → T011 (module before AppModule imports it)
T012, T013 → T014 (getPackingById + getPackingByCosecha before GET routes)
T015 → T016 (listPacking before GET /packing route)
T011 → T017 (all wired before final tsc check)
```

## Parallel Opportunities

- T002 and T003 can run simultaneously (different entity files, no shared dependencies)
- T004 and T005 can run simultaneously (different DTO files, no shared dependencies)
- T002, T003, T004, T005 can all run simultaneously after T001
- T012 and T013 can run simultaneously (independent service methods, different signatures)
