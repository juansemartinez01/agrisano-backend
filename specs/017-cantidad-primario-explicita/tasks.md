# Tasks: Cantidad explícita del lote primario

**Input**: Design documents from `/specs/017-cantidad-primario-explicita/`

**Prerequisites**: plan.md, spec.md, contracts/create-aplicacion.md

**Tests**: sin tests automatizados solicitados; verificación = tsc + eslint + quickstart.md contra dev (Railway).

**Organization**: cambio chico — una sola user story de implementación (US1) más la garantía de datos informativos (US2, verificación).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Proyecto único NestJS: `src/modules/aplicaciones-quimicas/`.

---

## Phase 1: Setup

- [X] T001 Verificar rama `017-cantidad-primario-explicita` activa y baseline limpio con `npx tsc --noEmit`

---

## Phase 2: User Story 1 — El operario controla exactamente cuánto se descuenta (P1) 🎯 MVP

**Goal**: el lote primario descuenta la `cantidad` explícita del body; sin el campo → 400.

**Independent Test**: quickstart.md pasos 1–4.

- [X] T002 [US1] Agregar campo `cantidad` (`@IsNumber() @IsPositive()`, requerido) a `CreateAplicacionDto` en `src/modules/aplicaciones-quimicas/dto/create-aplicacion.dto.ts`, con comentario de que es el descuento literal del lote primario (por chunk cuando hay `operation_group_id`)
- [X] T003 [US1] En `createAplicacion` de `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`: eliminar el cálculo `primaryTotalDosis` (y `targetCount` si queda sin uso), descontar `dto.cantidad` en el `decrementarLote` del primario y persistir `cantidad: dto.cantidad` en el detalle primario — `dosis`/`dosis_unidad` intactas
- [X] T004 [US1] En el mismo método, agregar `cantidad: dto.cantidad` al JSON `detalle` del evento `aplicacion_quimica` de historial de mesa (greenhouse), junto a `dosis`
- [X] T005 [US1] Compilación y lint del módulo: `npx tsc --noEmit` + `npx eslint "src/modules/aplicaciones-quimicas/**/*.ts"` limpios

**Checkpoint**: código completo; contrato nuevo activo.

---

## Phase 3: User Story 2 — La dosis sigue siendo el dato informativo de siempre (P2)

**Goal**: garantizar que dosis/snapshots/lectura no cambiaron.

- [ ] T006 [US2] Verificación funcional contra dev según quickstart.md pasos 1–8: descuento exacto, 400 sin cantidad / cantidad inválida, 422 stock insuficiente con rollback, dosis obligatoria, historial con `cantidad`, lectura idéntica con `quantity` = cantidad enviada, adicionales sin cambios

---

## Phase 4: Polish

- [X] T007 [P] Actualizar `docs/aplicaciones-quimicas-frontend.md` (sección 4: body con `cantidad`, regla de stock nueva, nota de breaking change) referenciando `specs/017-cantidad-primario-explicita/contracts/create-aplicacion.md`
- [X] T008 [P] Actualizar el body del POST en `postman/aplicaciones-quimicas.postman_collection.json` con el campo `cantidad`

---

## Dependencies & Execution Order

T001 → T002 → T003 → T004 → T005 → T006; T007 ∥ T008 al final.

## Implementation Strategy

**MVP** = Phase 1 + 2. Total: **8 tareas**.
