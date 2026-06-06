# Feature Specification: M09 — Aplicaciones Químicas (Chemical Applications)

**Feature Branch**: `010-aplicaciones-quimicas`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Module M09 — Aplicaciones Químicas — records chemical application events in nursery (on trays/bandejas) or greenhouse (on tables/mesas), atomically decrementing stock for all chemicals used."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register Greenhouse Chemical Application (Priority: P1)

A field supervisor applies a chemical product to a set of greenhouse tables (mesas). They record which chemical formulas were used and at what quantities, and the system immediately deducts those quantities from inventory. Each affected table gets a history entry.

**Why this priority**: Core business flow — chemical consumption tracking is legally and agronomically required. All other queries depend on applications existing.

**Independent Test**: POST /aplicaciones-quimicas with contexto=invernadero, a list of mesa_ids, and a list of quimico/cantidad pairs. Verify the application record is saved, stock is decremented for each chemical, and a HistorialMesa entry of tipo APLICACION_QUIMICA exists for each mesa.

**Acceptance Scenarios**:

1. **Given** authenticated user (operario/supervisor/admin_global) with valid mesas (activa or en_cosecha) and quimicos with sufficient stock, **When** POST /aplicaciones-quimicas with contexto=invernadero, **Then** application is created, stock decremented, historial entries written, response includes aplicacion + detalles + mesa_ids + empty warnings[].
2. **Given** a quimico whose stock_actual < cantidad requested, **When** POST with that quimico, **Then** transaction still commits but response includes a warning for that quimico indicating projected negative stock.
3. **Given** a mesa in estado=baja, **When** POST includes that mesa_id, **Then** 422 error — mesa must be activa or en_cosecha.
4. **Given** a mesa belonging to a different establecimiento_id than the payload's establecimiento_id, **When** POST, **Then** 422 error — cross-establishment targeting not allowed.

---

### User Story 2 - Register Nursery Chemical Application (Priority: P1)

A nursery worker applies a chemical treatment to trays (bandejas) in the nursery. They may optionally reference a recipe (receta) that prescribes the chemicals and doses. The system records which trays were treated and decrements stock.

**Why this priority**: Equally important as greenhouse flow — nursery operations run in parallel and represent the other half of the application lifecycle.

**Independent Test**: POST /aplicaciones-quimicas with contexto=nursery, a list of bandeja_ids, and detalles. Verify application saved, stock decremented, bandejas linked. No historial_mesa entries should be written.

**Acceptance Scenarios**:

1. **Given** authenticated user with valid bandejas (estado=en_nursery) and quimicos, **When** POST /aplicaciones-quimicas with contexto=nursery, **Then** application created, stock decremented, response includes aplicacion + detalles + bandeja_ids + warnings[].
2. **Given** contexto=nursery with a receta_id provided, **When** POST, **Then** receta_id is stored and application is linked to the recipe.
3. **Given** contexto=invernadero with a receta_id in the payload, **When** POST, **Then** 422 error — recetas are not applicable to greenhouse applications.
4. **Given** a bandeja with estado != en_nursery, **When** POST includes that bandeja_id, **Then** 422 error.

---

### User Story 3 - View Application History for a Mesa (Priority: P2)

A supervisor wants to see all chemical applications that have been made to a specific greenhouse table over time, to evaluate treatment frequency and chemical exposure.

**Why this priority**: Key traceability query — required for agronomic reporting and compliance audits.

**Independent Test**: GET /mesas/:id/aplicaciones returns paginated list of applications that included the given mesa, ordered by fecha_hora DESC.

**Acceptance Scenarios**:

1. **Given** a mesa with 3 past applications, **When** GET /mesas/:id/aplicaciones, **Then** returns all 3 applications with detalles.
2. **Given** a mesa with no applications, **When** GET, **Then** returns empty page with total=0.
3. **Given** a mesa belonging to a different tenant, **When** GET, **Then** 404 error.

---

### User Story 4 - View Application History for a Bandeja (Priority: P2)

A nursery manager wants to see all chemical applications made to a specific tray, to track treatment history before transplanting.

**Why this priority**: Mirrors mesa history query — required for nursery traceability.

**Independent Test**: GET /bandejas/:id/aplicaciones returns paginated list of applications that included the given bandeja.

**Acceptance Scenarios**:

1. **Given** a bandeja with 2 past applications, **When** GET /bandejas/:id/aplicaciones, **Then** returns both with detalles nested.
2. **Given** a bandeja with no applications, **When** GET, **Then** empty page.

---

### User Story 5 - List and Filter Applications (Priority: P3)

An admin wants to review all chemical applications across their establishment, filtered by date range, context type, or specific chemical used.

**Why this priority**: Reporting and oversight — lower priority than creation flows but important for operations management.

**Independent Test**: GET /aplicaciones-quimicas with various query params returns correctly filtered paginated results.

**Acceptance Scenarios**:

1. **Given** multiple applications with different contextos, **When** GET /aplicaciones-quimicas?contexto=nursery, **Then** only nursery applications returned.
2. **Given** applications on different dates, **When** GET with fecha_desde/fecha_hasta, **Then** only applications in that range returned.
3. **Given** applications using different quimicos, **When** GET with quimico_id filter, **Then** only applications that used that quimico returned.

---

### Edge Cases

- What happens when the detalles array is empty? → 422 error — at least one chemical product must be specified.
- What happens when mesa_ids is empty for invernadero context? → 422 error — at least one mesa required.
- What happens when bandeja_ids is empty for nursery context? → 422 error — at least one bandeja required.
- What if the same quimico appears twice in detalles? → Treat as separate entries; total consumed = sum of both amounts.
- What if a quimico_id does not exist or belongs to another tenant? → 404 error before transaction begins.
- What if the transaction fails mid-way (e.g., DB error)? → Full rollback — no stock consumed, no application record, no historial entries.
- What if stock goes to exactly 0? → No warning; warning only when result would be negative.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow authenticated users (operario, supervisor, admin_global) to create chemical application events.
- **FR-002**: System MUST support two application contexts: nursery (targeting bandejas) and greenhouse/invernadero (targeting mesas).
- **FR-003**: System MUST atomically execute the full creation in a single database transaction: create application record, create all detalle records, link all bandejas/mesas, decrement stock for each chemical, and write HistorialMesa entries for each mesa (invernadero only). HistorialMesa records MUST be inserted via direct transaction manager (inside the QueryRunner), never via a service method that uses its own repository outside the transaction.
- **FR-004**: System MUST roll back the entire transaction if any step fails.
- **FR-005**: System MUST calculate projected stock for each chemical BEFORE opening the transaction (projected_stock = stock_actual - cantidad). If any projected_stock < 0, that chemical is added to a warnings[] list. The transaction then opens and commits regardless. Warnings are returned in the POST response alongside the application data.
- **FR-006**: System MUST reject applications that target mesas not in estado activa or en_cosecha.
- **FR-007**: System MUST reject applications that target bandejas not in estado en_nursery.
- **FR-008**: System MUST reject applications where mesas or bandejas do not belong to the same tenant and establecimiento_id as the application.
- **FR-009**: System MUST reject applications with contexto=invernadero that include a receta_id.
- **FR-010**: System MUST copy unidad_medida from the quimico record at the time of application — it must NOT be accepted from the request body.
- **FR-011**: System MUST always derive usuario_id from the authenticated user's JWT token — never from the request body.
- **FR-012**: System MUST NOT allow update or delete operations on applications — they are immutable once created.
- **FR-013**: System MUST provide paginated list of applications with filters: establecimiento_id, contexto, receta_id, fecha_hora range (desde/hasta), quimico_id. Filtering by quimico_id requires joining to the detalle records — an application matches if any of its chemical detalles references the given quimico.
- **FR-014**: System MUST provide a detailed view of a single application including nested detalles and the list of affected bandeja_ids or mesa_ids.
- **FR-015**: System MUST provide a paginated list of applications that affected a specific mesa (GET /mesas/:id/aplicaciones). This endpoint MUST be implemented in the AplicacionesQuimicasController using an explicit full-path route — not in the existing MesasController.
- **FR-016**: System MUST provide a paginated list of applications that affected a specific bandeja (GET /bandejas/:id/aplicaciones). This endpoint MUST be implemented in the AplicacionesQuimicasController using an explicit full-path route — not in any existing Siembra or Bandeja controller.
- **FR-017**: System MUST write audit records for each created application (diferentiated by contexto: nursery vs. invernadero).
- **FR-018**: System MUST validate that at least one chemical detalle is provided in each application.
- **FR-019**: System MUST validate that at least one target (mesa or bandeja) is provided, matching the declared contexto.

### Key Entities

- **AplicacionQuimica**: The application event — who applied what chemicals, when, where (establishment), and in what context (nursery/greenhouse). Immutable after creation. Plain entity (no BaseEntity inheritance): has its own uuid id, explicit tenant_id uuid, created_at, updated_at columns. No deleted_at — records cannot be soft-deleted.
- **AplicacionQuimicaDetalle**: One chemical product used in an application, with quantity and unit of measure copied from the product catalog at time of application. Plain entity (no BaseEntity): has uuid id PK + FK columns aplicacion_id and quimico_id.
- **AplicacionQuimicaBandeja**: Join record linking an application to a nursery tray. Only for nursery context. Plain entity with composite PK (aplicacion_id, bandeja_id). No timestamps or soft-delete.
- **AplicacionQuimicaMesa**: Join record linking an application to a greenhouse table. Only for invernadero context. Plain entity with composite PK (aplicacion_id, mesa_id). No timestamps or soft-delete.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An application event covering 50 tables and 3 chemicals (104 DB writes) completes and is confirmed to the user within 5 seconds under normal load.
- **SC-002**: Stock balances for all chemicals are always consistent with the total cantidad consumed across all applications — zero double-counting or missed decrements.
- **SC-003**: 100% of chemical applications that targeted a mesa appear in that mesa's history view (GET /mesas/:id/aplicaciones).
- **SC-004**: 100% of transactions involving stock decrements either succeed fully or roll back fully — no partial state persisted after a failure.
- **SC-005**: Stock warnings are included in the response whenever a chemical's projected post-application stock would drop below zero, with zero false positives or false negatives.
- **SC-006**: All read endpoints return results in under 2 seconds for datasets up to 10,000 application records.

## Clarifications

### Session 2026-06-05

- Q: HistorialMesa entries for invernadero applications — inserted inside QueryRunner or via HistorialMesaService.writeEvent()? → A: Inserted directly via qr.manager.save(HistorialMesa, {...}) inside the QueryRunner transaction. HistorialMesaService.writeEvent() uses its own repository outside the transaction context and must NOT be used here. This guarantees full atomicity.
- Q: Does AplicacionQuimica extend BaseEntity? → A: No. It is a plain entity with its own PrimaryGeneratedColumn(uuid) id, explicit tenant_id uuid column, CreateDateColumn created_at, UpdateDateColumn updated_at. No deleted_at column — immutable once created.
- Q: Does stock warning evaluation happen before or inside the transaction? → A: Before opening the transaction. For each quimico in detalles, calculate projected_stock = stock_actual - cantidad. If projected_stock < 0, add to warnings[]. The transaction then opens and commits regardless. Warnings are returned in the POST response.
- Q: Are AplicacionQuimicaDetalle, AplicacionQuimicaBandeja, AplicacionQuimicaMesa plain entities? → A: Yes. All three are plain entities with no BaseEntity, no deleted_at. AplicacionQuimicaDetalle has PrimaryGeneratedColumn uuid id + FK columns. AplicacionQuimicaBandeja and AplicacionQuimicaMesa use composite PKs (aplicacion_id + bandeja_id / aplicacion_id + mesa_id).
- Q: Does the quimico_id filter on GET /aplicaciones-quimicas require a join? → A: Yes. Filtering by quimico_id requires a LEFT JOIN to aplicaciones_quimicas_detalle WHERE detalle.quimico_id = :qid. This join-based filter is the correct implementation.
- Q: Where are GET /mesas/:id/aplicaciones and GET /bandejas/:id/aplicaciones implemented? → A: In AplicacionesQuimicasController using explicit full-path routes — NOT in MesasController or BandejasController. Same pattern as M06 and M08. This avoids modifying existing modules.
- Q: Is fecha_hora on AplicacionQuimica set server-side? → A: Yes. fecha_hora is set to new Date() at transaction time on the server — never accepted from the request body.

## Assumptions

- The `quimico.stock_actual` field used by QuimicosService is the authoritative stock value; no caching layer exists that could cause stale reads before the pre-transaction check.
- `unidad_medida` is a stable attribute on the quimico record and can be safely snapshotted into the detalle at creation time.
- Bandejas and mesas are assumed to have a single `establecimiento_id` field that can be directly compared; cross-establishment joins are rejected by business rule, not by schema constraints.
- HistorialMesa entries for invernadero applications are written via direct qr.manager.save(HistorialMesa, {...}) inside the QueryRunner — HistorialMesaService.writeEvent() is NOT used here because it operates on its own repository outside the transaction.
- fecha_hora is set server-side to new Date() at transaction time; the client cannot override it — the field is never accepted from the request body.
- Pagination default: page=1, limit=20, max=200.
- Applications are scoped to a single tenant; cross-tenant queries are never possible.
- GET /mesas/:id/aplicaciones and GET /bandejas/:id/aplicaciones are open to all authenticated users (no role restriction beyond JWT).
