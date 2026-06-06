# Tasks: M09 — Aplicaciones Químicas

**Input**: Design documents from `specs/009-aplicaciones-quimicas/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | data-model.md ✅ | contracts/api-spec.json ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Foundational first (error codes, entities, DTOs), then US1+US2 create flows (MVP), then US3+US4 reverse-lookup reads, then US5 list/getById.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US]**: Which user story this task belongs to

## Path Conventions

All source: `src/modules/aplicaciones-quimicas/`
Error codes: `src/common/errors/error-codes.ts`
App module: `src/app.module.ts`
Migration: `migrations/1771000000000-AplicacionesQuimicasInit.ts`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Error codes, all 4 entities, and 2 DTOs — required by every subsequent phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Error Codes

- [x] T001 Add 5 error codes to `src/common/errors/error-codes.ts` after the `// mesas` block:
  ```
  // aplicaciones-quimicas
  APLICACION_NOT_FOUND: 'APLICACION_NOT_FOUND',
  APLICACION_CONTEXTO_INVALIDO: 'APLICACION_CONTEXTO_INVALIDO',
  APLICACION_TARGET_INVALIDO: 'APLICACION_TARGET_INVALIDO',
  APLICACION_DETALLES_VACIOS: 'APLICACION_DETALLES_VACIOS',
  APLICACION_TARGETS_VACIOS: 'APLICACION_TARGETS_VACIOS',
  ```

### Entities (all plain entities — NO BaseEntity, NO deleted_at)

- [x] T002 [P] Create `src/modules/aplicaciones-quimicas/entities/aplicacion-quimica.entity.ts` — plain entity (no BaseEntity):
  - `@PrimaryGeneratedColumn('uuid') id`
  - `@Column({ type: 'uuid', nullable: true }) tenant_id`
  - `@Column({ type: 'uuid' }) establecimiento_id`
  - `@Column({ type: 'enum', enum: AplicacionContexto, enumName: 'aplicacion_contexto' }) contexto` (export enum AplicacionContexto { NURSERY = 'nursery', INVERNADERO = 'invernadero' })
  - `@Column({ type: 'uuid', nullable: true }) receta_id`
  - `@Column({ type: 'text', nullable: true }) observaciones`
  - `@Column({ type: 'uuid' }) usuario_id`
  - `@Column({ type: 'timestamptz', default: () => 'now()' }) fecha_hora`
  - `@CreateDateColumn() created_at`
  - `@UpdateDateColumn() updated_at`
  - Table name: `aplicaciones_quimicas`

- [x] T003 [P] Create `src/modules/aplicaciones-quimicas/entities/aplicacion-quimica-detalle.entity.ts` — plain entity:
  - `@PrimaryGeneratedColumn('uuid') id`
  - `@Column({ type: 'uuid' }) aplicacion_id`
  - `@Column({ type: 'uuid' }) quimico_id`
  - `@Column({ type: 'decimal', precision: 10, scale: 3 }) cantidad`
  - `@Column({ type: 'varchar', length: 30 }) unidad_medida`
  - Table name: `aplicaciones_quimicas_detalle`

- [x] T004 [P] Create `src/modules/aplicaciones-quimicas/entities/aplicacion-quimica-bandeja.entity.ts` — plain entity with composite PK:
  - `@PrimaryColumn({ type: 'uuid' }) aplicacion_id`
  - `@PrimaryColumn({ type: 'uuid' }) bandeja_id`
  - Table name: `aplicacion_quimica_bandeja`

- [x] T005 [P] Create `src/modules/aplicaciones-quimicas/entities/aplicacion-quimica-mesa.entity.ts` — plain entity with composite PK:
  - `@PrimaryColumn({ type: 'uuid' }) aplicacion_id`
  - `@PrimaryColumn({ type: 'uuid' }) mesa_id`
  - Table name: `aplicacion_quimica_mesa`

### DTOs

- [x] T006 [P] Create `src/modules/aplicaciones-quimicas/dto/create-aplicacion.dto.ts`:
  - Internal class `DetalleItemDto`: `quimico_id: @IsUUID()`, `cantidad: @IsNumber() @IsPositive()`
  - Main DTO fields:
    - `establecimiento_id: @IsUUID()`
    - `contexto: @IsEnum(AplicacionContexto)`
    - `receta_id?: @IsOptional() @IsUUID()`
    - `observaciones?: @IsOptional() @IsString()`
    - `detalles: @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DetalleItemDto)`
    - `bandeja_ids?: @IsOptional() @IsArray() @IsUUID('4', { each: true })`
    - `mesa_ids?: @IsOptional() @IsArray() @IsUUID('4', { each: true })`
  - NO usuario_id, NO fecha_hora, NO unidad_medida fields

- [x] T007 [P] Create `src/modules/aplicaciones-quimicas/dto/query-aplicaciones.dto.ts` extending PageQueryDto:
  - `establecimiento_id?: @IsOptional() @IsUUID()`
  - `contexto?: @IsOptional() @IsEnum(AplicacionContexto)`
  - `receta_id?: @IsOptional() @IsUUID()`
  - `quimico_id?: @IsOptional() @IsUUID()`
  - `fecha_desde?: @IsOptional() @IsISO8601()`
  - `fecha_hasta?: @IsOptional() @IsISO8601()`
  - `sortBy?: @IsOptional() @IsString()`
  - `sortOrder?: @IsOptional() @IsIn(['ASC', 'DESC'])`

**Checkpoint**: All entities compile, DTOs compile. Run `npx tsc --noEmit` — zero errors before proceeding.

---

## Phase 2: US1 + US2 — Create Flows (Priority: P1) 🎯 MVP

**Goal**: POST /aplicaciones-quimicas works for BOTH nursery (bandejas) and invernadero (mesas) contexts with full atomic transaction, stock decrement, historial writes, and stock warnings.

**Independent Test**: POST with `contexto=invernadero`, valid mesa_ids and detalles → verify 201 response with `{ aplicacion, detalles, afectados: { mesa_ids }, warnings }`, stock decremented in `quimicos`, `historial_mesa` entries written per mesa. Then POST with `contexto=nursery`, valid bandeja_ids → same structure with `{ bandeja_ids }` and no historial entries.

### Service — createAplicacion

- [x] T008 [US1] [US2] Create `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts` as plain `@Injectable()` (NO BaseCrudTenantService) with:

  **Imports**: AplicacionQuimica, AplicacionQuimicaDetalle, AplicacionQuimicaBandeja, AplicacionQuimicaMesa entities; HistorialMesa + HistorialTipoEvento from `src/modules/mesas/entities/historial-mesa.entity`; DataSource, Repository, InjectRepository; TenancyService; EstablecimientosService; QuimicosService; BandejaService; MesasService; RecetasService; AuditService; PinoLogger; AppError; ErrorCodes; auditLogPayload; clampPagination

  **Export AUDIT constant**:
  ```typescript
  export const AUDIT = {
    NURSERY: 'aplicacion_quimica_nursery',
    INVERNADERO: 'aplicacion_quimica_invernadero',
  } as const;
  ```

  **Implement `createAplicacion(dto: CreateAplicacionDto, userId: string)`**:

  PRE-TRANSACTION VALIDATIONS (in order):
  1. `tenantId = this.tenancy.requireTenantId()`
  2. `await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true })`
  3. If `dto.contexto === AplicacionContexto.INVERNADERO && dto.receta_id` → throw `APLICACION_CONTEXTO_INVALIDO` status 422
  4. If `!dto.detalles?.length` → throw `APLICACION_DETALLES_VACIOS` status 422
  5. If `dto.contexto === AplicacionContexto.NURSERY && !dto.bandeja_ids?.length` → throw `APLICACION_TARGETS_VACIOS` status 422
  6. If `dto.contexto === AplicacionContexto.INVERNADERO && !dto.mesa_ids?.length` → throw `APLICACION_TARGETS_VACIOS` status 422
  7. Load quimicos: call `this.quimicosService.mustFindById(id, { strictTenant: true })` for each `dto.detalles[].quimico_id`; build `quimicoMap: Record<string, Quimico>`; validate each `quimico.establecimiento_id === dto.establecimiento_id` → throw `APLICACION_TARGET_INVALIDO` 422 if mismatch
  8. If nursery: call `this.bandejaService.getBandeja(id)` for each bandeja_id; validate `bandeja.estado === 'en_nursery'` and `bandeja.establecimiento_id === dto.establecimiento_id` → throw `APLICACION_TARGET_INVALIDO` 422 if fails
  9. If invernadero: call `this.mesasService.getMesaById(id, tenantId)` for each mesa_id; validate `mesa.estado === 'activa' || mesa.estado === 'en_cosecha'` and `mesa.establecimiento_id === dto.establecimiento_id` → throw `APLICACION_TARGET_INVALIDO` 422 if fails
  10. If `dto.receta_id`: `await this.recetasService.mustFindById(dto.receta_id, { strictTenant: true })`
  11. STOCK WARNINGS (before transaction): for each detalle, `projected = Number(quimico.stock_actual) - Number(detalle.cantidad)`; if `projected < 0` → push `{ quimico_id, nombre: quimico.nombre, projected_stock: projected }` to `warnings[]`

  QUERYRUNNER TRANSACTION:
  12. `const qr = this.dataSource.createQueryRunner(); await qr.connect(); await qr.startTransaction()`
  13. `try {`
  14. Create+save AplicacionQuimica: `{ tenant_id: tenantId, establecimiento_id: dto.establecimiento_id, contexto: dto.contexto, receta_id: dto.receta_id ?? null, observaciones: dto.observaciones ?? null, usuario_id: userId, fecha_hora: new Date() }`
  15. For each detalle: create+save AplicacionQuimicaDetalle `{ aplicacion_id: saved.id, quimico_id, cantidad, unidad_medida: quimicoMap[quimico_id].unidad_medida }`; then `await qr.query('UPDATE quimicos SET stock_actual = stock_actual - $1, updated_at = now() WHERE id = $2 AND tenant_id = $3', [cantidad, quimico_id, tenantId])`
  16. If nursery: for each bandeja_id → `await qr.manager.save(AplicacionQuimicaBandeja, { aplicacion_id: saved.id, bandeja_id })`
  17. If invernadero: for each mesa_id → save AplicacionQuimicaMesa `{ aplicacion_id: saved.id, mesa_id }`; then `await qr.manager.save(HistorialMesa, { mesa_id, tipo_evento: HistorialTipoEvento.APLICACION_QUIMICA, tenant_id: tenantId, usuario_id: userId, fecha_hora: new Date(), detalle: { aplicacion_id: saved.id, quimicos: savedDetalles.map(d => ({ quimico_id: d.quimico_id, cantidad: d.cantidad })) } })`
  18. `await qr.commitTransaction()`
  19. `} catch (err) { await qr.rollbackTransaction(); throw err; } finally { await qr.release(); }`

  After transaction: call `this.writeAudit(...)` with appropriate AUDIT key

  Return: `{ aplicacion: saved, detalles: savedDetalles, afectados: contexto === 'nursery' ? { bandeja_ids } : { mesa_ids }, warnings }`

  **Also implement private `writeAudit(...)` method** following the same pattern as MesasService.writeAudit()

### Controller — POST route

- [x] T009 [US1] [US2] Create `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.controller.ts` with class-level `@UseGuards(JwtAuthGuard, RolesGuard) @Controller()` (NO prefix).

  Declare local `AuthRequest` type (same pattern as MesasController).

  Implement `create()` handler:
  ```
  @Roles('operario', 'supervisor', 'admin_global')
  @Post('aplicaciones-quimicas')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAplicacionDto, @Req() req: AuthRequest)
  ```
  Extract `userId = req.user?.sub`. Call `this.svc.createAplicacion(dto, userId)`. Return `ok(result)`.

  NOTE: Only POST route in this task — GET routes added in later phases.

### Module + App wiring

- [x] T010 [US1] [US2] Create `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.module.ts`:
  ```typescript
  @Module({
    imports: [
      TypeOrmModule.forFeature([
        AplicacionQuimica, AplicacionQuimicaDetalle,
        AplicacionQuimicaBandeja, AplicacionQuimicaMesa,
      ]),
      TenancyModule, AuditModule, EstablecimientosModule,
      QuimicosModule, SiembraModule, MesasModule, RecetasModule,
    ],
    providers: [AplicacionesQuimicasService],
    controllers: [AplicacionesQuimicasController],
  })
  export class AplicacionesQuimicasModule {}
  ```
  NOTE: HistorialMesa is already registered in MesasModule — do NOT add it to forFeature here.

- [x] T011 [US1] [US2] Add `AplicacionesQuimicasModule` to `src/app.module.ts`: add import at top and add to imports array after `MesasModule`.

### Migration verify

- [x] T012 [US1] [US2] Verify `migrations/1771000000000-AplicacionesQuimicasInit.ts` exists and contains:
  - `CREATE TYPE aplicacion_contexto AS ENUM ('nursery', 'invernadero')`
  - Tables: `aplicaciones_quimicas`, `aplicaciones_quimicas_detalle`, `aplicacion_quimica_bandeja`, `aplicacion_quimica_mesa`
  - Indexes: 9 total (IDX_aq_tenant_id, IDX_aq_establecimiento_id, IDX_aq_contexto, IDX_aq_fecha_hora, IDX_aq_receta_id, IDX_aqd_aplicacion_id, IDX_aqd_quimico_id, IDX_aqb_bandeja_id, IDX_aqm_mesa_id)
  - DO NOT modify — verify only.

**✅ MVP CHECKPOINT — Run `npx tsc --noEmit`. Zero errors required.**

Test both create flows before continuing:
- POST /aplicaciones-quimicas with `contexto=invernadero` → verify 201, stock decremented, historial_mesa entries written
- POST /aplicaciones-quimicas with `contexto=nursery` → verify 201, stock decremented, no historial entries
- POST with `contexto=invernadero` + `receta_id` → verify 422 APLICACION_CONTEXTO_INVALIDO
- POST with empty detalles → verify 422 APLICACION_DETALLES_VACIOS
- POST with quimico where projected stock < 0 → verify 201 with warnings[] populated

---

## Phase 3: US3 + US4 — History Reverse Lookups (Priority: P2)

**Goal**: GET /mesas/:mesa_id/aplicaciones and GET /bandejas/:bandeja_id/aplicaciones return paginated lists of applications that affected a given entity.

**Independent Test**: Given a mesa with 2 past invernadero applications, GET /mesas/:mesa_id/aplicaciones returns both. Given a bandeja with 1 past nursery application, GET /bandejas/:bandeja_id/aplicaciones returns it. Both return 404 if entity not found.

### Service — reverse-lookup methods

- [x] T013 [P] [US3] Add `getAplicacionesByMesa(mesa_id: string, q: QueryAplicacionesDto, tenantId: string)` to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`:
  - Validate mesa exists: `await this.mesasService.getMesaById(mesa_id, tenantId)` (throws MESA_NOT_FOUND if not found)
  - Build QB on `aplicaciones_quimicas` repo with LEFT JOIN to `aplicacion_quimica_mesa` ON `aqm.aplicacion_id = a.id` WHERE `aqm.mesa_id = :mesa_id` AND `a.tenant_id = :tenantId`
  - Apply clampPagination, default sort `a.fecha_hora DESC`
  - Return `{ items, total }`

- [x] T014 [P] [US4] Add `getAplicacionesByBandeja(bandeja_id: string, q: QueryAplicacionesDto, tenantId: string)` to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`:
  - Validate bandeja exists: `await this.bandejaService.getBandeja(bandeja_id)` (throws BANDEJA_NOT_FOUND if not found)
  - Build QB on `aplicaciones_quimicas` repo with LEFT JOIN to `aplicacion_quimica_bandeja` ON `aqb.aplicacion_id = a.id` WHERE `aqb.bandeja_id = :bandeja_id` AND `a.tenant_id = :tenantId`
  - Apply clampPagination, default sort `a.fecha_hora DESC`
  - Return `{ items, total }`

### Controller — reverse-lookup routes

- [x] T015 [P] [US3] Add route to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.controller.ts`:
  ```typescript
  @Get('mesas/:mesa_id/aplicaciones')
  async getByMesa(
    @Param('mesa_id') mesa_id: string,
    @Query() q: QueryAplicacionesDto,
    @Req() req: AuthRequest,
  )
  ```
  Call `this.svc.getAplicacionesByMesa(mesa_id, q, req.tenantId ?? '')`. Use clampPagination + return `page(r.items, p, limit, r.total)`.

- [x] T016 [P] [US4] Add route to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.controller.ts`:
  ```typescript
  @Get('bandejas/:bandeja_id/aplicaciones')
  async getByBandeja(
    @Param('bandeja_id') bandeja_id: string,
    @Query() q: QueryAplicacionesDto,
    @Req() req: AuthRequest,
  )
  ```
  Call `this.svc.getAplicacionesByBandeja(bandeja_id, q, req.tenantId ?? '')`. Use clampPagination + return `page(r.items, p, limit, r.total)`.

**Checkpoint**: GET /mesas/:id/aplicaciones and GET /bandejas/:id/aplicaciones return correct paginated results.

---

## Phase 4: US5 — List + Detail (Priority: P3)

**Goal**: GET /aplicaciones-quimicas (paginated, filterable) and GET /aplicaciones-quimicas/:id (with nested detalles + bandeja_ids/mesa_ids).

**Independent Test**: GET /aplicaciones-quimicas?contexto=nursery returns only nursery applications. GET /aplicaciones-quimicas?quimico_id=X returns only applications that used that quimico. GET /aplicaciones-quimicas/:id returns the application with `detalles[]` and `bandeja_ids` or `mesa_ids` nested.

### Service — list + getById

- [x] T017 [US5] Add `listAplicaciones(q: QueryAplicacionesDto, tenantId: string)` to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`:
  - `const { skip, limit } = clampPagination(q.page, q.limit, 200)`
  - `const SORT_ALLOWED = ['fecha_hora', 'created_at']`
  - QB on `aplicaciones_quimicas` aliased `a`, WHERE `a.tenant_id = :tenantId`
  - If `q.establecimiento_id` → `a.establecimiento_id = :eid`
  - If `q.contexto` → `a.contexto = :contexto`
  - If `q.receta_id` → `a.receta_id = :receta_id`
  - If `q.fecha_desde` → `a.fecha_hora >= :fecha_desde`
  - If `q.fecha_hasta` → `a.fecha_hora <= :fecha_hasta`
  - **If `q.quimico_id`**: `qb.leftJoin('aplicaciones_quimicas_detalle', 'aqd', 'aqd.aplicacion_id = a.id').andWhere('aqd.quimico_id = :quimico_id', { quimico_id: q.quimico_id })`
  - Sort + skip + take; return `{ items, total }`

- [x] T018 [US5] Add `getAplicacionById(id: string, tenantId: string)` to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`:
  - Load aplicacion: `this.aplicacionRepo.findOne({ where: { id, tenant_id: tenantId } })` → throw `APLICACION_NOT_FOUND` 404 if null
  - Load detalles: `this.detalleRepo.find({ where: { aplicacion_id: id } })`
  - If `contexto === 'nursery'`: load `this.bandejaRepo.find({ where: { aplicacion_id: id } })` → extract `bandeja_ids`
  - If `contexto === 'invernadero'`: load `this.mesaRepo.find({ where: { aplicacion_id: id } })` → extract `mesa_ids`
  - Return `{ aplicacion, detalles, bandeja_ids?, mesa_ids? }`
  - NOTE: inject `@InjectRepository(AplicacionQuimicaBandeja)` and `@InjectRepository(AplicacionQuimicaMesa)` in constructor

### Controller — list + getById routes

- [x] T019 [US5] Add routes to `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.controller.ts`:

  ```typescript
  @Get('aplicaciones-quimicas')
  async list(@Query() q: QueryAplicacionesDto, @Req() req: AuthRequest)
  // → this.svc.listAplicaciones(q, req.tenantId ?? ''); return page(r.items, p, limit, r.total)

  @Get('aplicaciones-quimicas/:id')
  async getOne(@Param('id') id: string, @Req() req: AuthRequest)
  // → this.svc.getAplicacionById(id, req.tenantId ?? ''); return ok(result)
  ```

  CRITICAL route order: declare `'aplicaciones-quimicas'` GET BEFORE `'aplicaciones-quimicas/:id'` GET to avoid routing conflicts.

**Checkpoint**: All 5 endpoints functional. Complete end-to-end smoke test.

---

## Phase 5: Verification

**Purpose**: TypeScript compile check and final validation.

- [x] T020 Run `npx tsc --noEmit` from project root — zero errors required. Fix any type errors before completing.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: Start immediately — T001 must complete first; T002–T005 [P] can run together; T006–T007 [P] can run in parallel with entities
- **Phase 2 (US1+US2)**: Requires Phase 1 complete. T008 (service) → T009 (controller) → T010 (module) → T011 (app.module) → T012 (verify migration)
- **Phase 3 (US3+US4)**: Requires Phase 2 complete. T013+T014 [P] parallel; T015+T016 [P] parallel
- **Phase 4 (US5)**: Requires Phase 2 complete. T017 → T018 (both in service, sequential); T019 (controller, after T017+T018)
- **Phase 5 (Verify)**: Requires all prior phases complete

### User Story Dependencies

- **US1 + US2** (P1): Share the same `createAplicacion()` service method and POST controller route — implemented together in Phase 2
- **US3** (P2): Depends on Phase 2 complete; can run parallel with US4
- **US4** (P2): Depends on Phase 2 complete; can run parallel with US3
- **US5** (P3): Depends on Phase 2 complete (needs `aplicacionRepo`); can run parallel with US3+US4

### Parallel Opportunities

```
Phase 1: T001 (must finish first)
         T002 [P] + T003 [P] + T004 [P] + T005 [P] (all 4 entities simultaneously)
         T006 [P] + T007 [P] (both DTOs simultaneously)

Phase 2: T008 → T009 → T010 → T011 → T012 (sequential dependency chain)

Phase 3: T013 [P] + T014 [P] (service methods simultaneously)
         T015 [P] + T016 [P] (controller routes simultaneously)

Phase 4: T017 → T018 (service, sequential) → T019 (controller)

Phase 5: T020
```

---

## Implementation Strategy

### MVP First (US1 + US2 — Both Create Flows)

1. Complete Phase 1 (Foundational) — T001 → T002–T007
2. Complete Phase 2 (US1+US2 create) — T008–T012
3. **STOP AND VALIDATE**: Test POST for both nursery and invernadero contexts
4. Verify stock decrements, historial entries, stock warnings in response

### Incremental Delivery

1. Phase 1 → Phase 2 → **MVP checkpoint** (POST working)
2. Phase 3 → US3+US4 history reverse lookups
3. Phase 4 → US5 list + getById
4. Phase 5 → Final tsc verification

---

## Notes

- [P] tasks = different files, no shared dependencies — safe to run simultaneously
- AplicacionesQuimicasService is plain `@Injectable()` — do NOT extend BaseCrudTenantService
- AplicacionesQuimicasController uses `@Controller()` with NO prefix — all route paths are explicit full strings
- HistorialMesa writes inside QueryRunner use `qr.manager.save(HistorialMesa, {...})` — NEVER `HistorialMesaService.writeEvent()`
- fecha_hora, unidad_medida, usuario_id are NEVER accepted from request body
- Stock decrement uses atomic SQL: `UPDATE quimicos SET stock_actual = stock_actual - $1`
- Migration already exists — T012 is verify-only, never modify
- No update or delete endpoints for this module — immutable records
