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

- [X] T006 [US2] Verificación funcional contra dev según quickstart.md pasos 1–8: descuento exacto, 400 sin cantidad / cantidad inválida, 422 stock insuficiente con rollback, dosis obligatoria, historial con `cantidad`, lectura idéntica con `quantity` = cantidad enviada, adicionales sin cambios

---

## Phase 4: Polish

- [X] T007 [P] Actualizar `docs/aplicaciones-quimicas-frontend.md` (sección 4: body con `cantidad`, regla de stock nueva, nota de breaking change) referenciando `specs/017-cantidad-primario-explicita/contracts/create-aplicacion.md`
- [X] T008 [P] Actualizar el body del POST en `postman/aplicaciones-quimicas.postman_collection.json` con el campo `cantidad`

---

## Verificación en entorno de desarrollo (2026-07-29)

Entorno: `https://agrisano-backend-production.up.railway.app` (deploy con el cambio ya publicado).
Auth: JWT de `admin@agrisano.com` + header `x-tenant-id: 00000000-0000-0000-0000-000000000001`.
Lote primario usado: `620713b6-2eae-4db1-bcd1-bf021277e456` (`NoWithholding-1`).

| # | Caso (quickstart) | Resultado | Estado |
|---|---|---|---|
| 1 | Stock inicial del lote primario | `292.180` | baseline |
| 2 | POST sin `cantidad` | 400 `"cantidad must be a positive number..."`; stock intacto | ✅ |
| 2b | `cantidad: 0` y `cantidad: -1` | 400 en ambos; stock `292.180` | ✅ |
| 3 | POST sin `dosis` | 400 (dosis sigue obligatoria) | ✅ |
| 4 | Nursery `cantidad: 0.05`, `dosis: 0.1`, 2 bandejas (app `2dae0f41…`) | detalle primario `cantidad=0.05, dosis=0.1, dosis_unidad=mL/L`; **stock `292.180 → 292.130` (−0.05, no −0.2)** | ✅ FR-002 |
| 5 | `cantidad: 999999` | 422 `LOTE_QUIMICO_STOCK_INSUFICIENTE`; stock sigue `292.130` (rollback total) | ✅ FR-007 |
| 6 | Greenhouse `cantidad: 0.07`, 1 mesa (app `017553f5…`) | stock `292.130 → 292.060`; evento de historial `aplicacion_quimica` → `{"batch":"NoWithholding-1","dosis":0.1,"cantidad":0.07,…}` | ✅ FR-006 |
| 7 | Lectura sin cambios | `GET /aplicaciones-quimicas/:id`: shape idéntico (`aplicacion` + `usuario`, `detalles[].cantidad` = 0.05 / 0.07, `targets` enriquecidos). `GET /aplicaciones-quimicas`: `chemical_lines[0].quantity` = 0.05 y 0.07, `dose` = 0.1 | ✅ FR-005 |
| 8 | Adicionales sin cambios | App `898b5a3a…` con primario `cantidad: 0.03` + `detalles[]` `cantidad: 0.02`: primario `292.060 → 292.030` (−0.030), adicional `496.200 → 496.180` (−0.020); lista muestra 2 `chemical_lines` con `quantity` 0.03 y 0.02 | ✅ FR-003/SC-004 |

Conclusión: el descuento del lote primario es exactamente la `cantidad` del body en los dos contextos; `dosis`/`dosis_unidad`/`batch`/carencia se siguen guardando como snapshot informativo; la lectura enriquecida de la feature 016 no cambió de forma; los lotes adicionales, el guard atómico de stock y el rollback transaccional siguen intactos.

---

## Dependencies & Execution Order

T001 → T002 → T003 → T004 → T005 → T006; T007 ∥ T008 al final.

## Implementation Strategy

**MVP** = Phase 1 + 2. Total: **8 tareas**.
