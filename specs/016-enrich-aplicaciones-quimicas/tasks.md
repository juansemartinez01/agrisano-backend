# Tasks: Enriquecimiento de lectura de Aplicaciones Químicas

**Input**: Design documents from `/specs/016-enrich-aplicaciones-quimicas/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/aplicaciones-quimicas-read.md

**Tests**: No se solicitaron tests automatizados; la verificación es `npx tsc --noEmit` + quickstart.md (Postman/curl). No se generan tareas de test unitario.

**Organization**: Tareas agrupadas por user story para que cada una sea implementable y verificable de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos/métodos distintos, sin dependencia de tareas incompletas)
- **[Story]**: US1 (listado), US2 (detalle), US3 (resiliencia)

## Path Conventions

Proyecto único NestJS: todo el trabajo vive en `src/modules/aplicaciones-quimicas/`.

---

## Phase 1: Setup

**Purpose**: baseline verificable antes de tocar código.

- [X] T001 Verificar rama `016-enrich-aplicaciones-quimicas` activa y compilación baseline limpia con `npx tsc --noEmit`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tipos compartidos y helpers que usan ambos endpoints. Bloquea US1 y US2.

- [X] T002 Crear `src/modules/aplicaciones-quimicas/types/aplicacion-enriched.types.ts` con las interfaces de data-model.md: `UsuarioResumen`, `ChemicalLine`, `TunnelSummary`, `SeedingSummary`, `TargetSummary`, `AplicacionListItem`, `GreenhouseTargets`, `NurseryTargets`, `AplicacionDetalleEnriquecida`, más los tipos de filas crudas de las queries batch (raw row types tipados, sin `any`)
- [X] T003 Agregar helper privado `toNumberOrNull(value: string | number | null | undefined): number | null` en `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts` (numeric de Postgres llega como string; jamás convertir faltantes a 0)

**Checkpoint**: `npx tsc --noEmit` limpio — US1 y US2 pueden arrancar.

---

## Phase 3: User Story 1 — Historial de aplicaciones en una sola carga (P1) 🎯 MVP

**Goal**: `GET /aplicaciones-quimicas` devuelve items con `usuario`, `target_count`, `target_summary` y `chemical_lines`, con número de queries constante por página.

**Independent Test**: `GET /aplicaciones-quimicas?page=1&limit=10&sortOrder=DESC` pinta tarjetas completas sin ningún request adicional; campos previos intactos; queries ≤ 6 en logs SQL.

- [X] T004 [P] [US1] Implementar método privado `buildUsuariosMap(userIds: string[], tenantId: string): Promise<Map<string, UsuarioResumen>>` en `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts` — query batch a `users` con `WHERE id IN (:ids) AND tenant_id = :tenantId` y select explícito `id, nombre, apellido, email` (nunca `password_hash`); array vacío ⇒ Map vacío sin query
- [X] T005 [P] [US1] Implementar método privado `buildChemicalLinesMap(aplicaciones: AplicacionQuimica[]): Promise<Map<string, ChemicalLine[]>>` en `aplicaciones-quimicas.service.ts` — una query: `aplicaciones_quimicas_detalle` `WHERE aplicacion_id IN (:ids)` + `LEFT JOIN lotes_quimicos` + `LEFT JOIN quimicos` + `LEFT JOIN marcas` + `LEFT JOIN proveedores`; en memoria marcar la línea principal (primera fila cuyo `lote_quimico_id === aplicacion.lote_quimico_id`) con `dose`/`dose_unit`/`withholding_period_days` desde el snapshot de la aplicación; resto `null`; `brand`/`supplier` `null` si no resuelven
- [X] T006 [P] [US1] Implementar método privado `buildGreenhouseSummaryMap(aplicacionIds: string[]): Promise<Map<string, TunnelSummary[]>>` en `aplicaciones-quimicas.service.ts` — una query: `aplicacion_quimica_mesa` `WHERE aplicacion_id IN (:ids)` + `LEFT JOIN mesas` + `LEFT JOIN tuneles`, `GROUP BY aplicacion_id, tunel_id, tunel.nombre` con `COUNT(*) AS table_count`; mesas sin fila en `mesas` van al bucket túnel `null`
- [X] T007 [P] [US1] Implementar método privado `buildNurserySummaryMap(aplicacionIds: string[]): Promise<Map<string, SeedingSummary[]>>` en `aplicaciones-quimicas.service.ts` — una query: `aplicacion_quimica_bandeja` `WHERE aplicacion_id IN (:ids)` + `LEFT JOIN bandejas` + `LEFT JOIN siembras` + `LEFT JOIN lotes (semilla)` + `LEFT JOIN productos` + `LEFT JOIN variedades`, `GROUP BY aplicacion_id, siembra_id, siembra.created_at, producto, variedad` con `COUNT(*) AS tray_count`; colapsar en memoria filas duplicadas de la misma siembra (heterogeneidad ⇒ sumar `tray_count`, `product`/`variety` ⇒ `null`)
- [X] T008 [US1] Modificar `listAplicaciones` en `aplicaciones-quimicas.service.ts`: tras la query paginada actual (intacta), separar IDs por contexto, ejecutar T004–T007 con `Promise.all` (solo las que apliquen), y ensamblar `AplicacionListItem[]` con `usuario`, `target_count` (Σ table_count / Σ tray_count; sin vínculos ⇒ 0), `target_summary` (`tunnels`/`seedings`, el otro array vacío) y `chemical_lines`; cambiar tipo de retorno a `{ items: AplicacionListItem[]; total: number }`
- [X] T009 [US1] Verificar `list()` en `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.controller.ts` compila sin cambios de ruta ni envelope (`page(r.items, p, limit, r.total)`); ajustar solo tipado si hace falta
- [ ] T010 [US1] Verificación funcional del listado según quickstart.md: item greenhouse (túneles + table_count), item nursery (seedings + tray_count + product/variety), chemical_lines sin duplicar principal, campos previos intactos, `meta` correcto

**Checkpoint**: US1 completa y demostrable por sí sola (MVP).

---

## Phase 4: User Story 2 — Detalle completo bajo demanda (P2)

**Goal**: `GET /aplicaciones-quimicas/:id` agrega `usuario` en `aplicacion` y bloque `targets` agrupado, conservando `detalles` y `mesa_ids`/`bandeja_ids`.

**Independent Test**: consultar el detalle de una aplicación greenhouse y una nursery; verificar `targets.total === mesa_ids.length`/`bandeja_ids.length` y agrupamiento correcto.

- [X] T011 [P] [US2] Implementar método privado `buildGreenhouseTargets(aplicacionId: string): Promise<{ targets: GreenhouseTargets; mesaIds: string[] }>` en `aplicaciones-quimicas.service.ts` — una query por filas (sin GROUP BY): `aplicacion_quimica_mesa WHERE aplicacion_id = :id` + `LEFT JOIN mesas` + `LEFT JOIN tuneles`; agrupar por túnel en memoria; mesas con `id`, `nombre`, `posicion_actual`, `estado`; mesa no resuelta ⇒ entrada con enriquecimiento `null` bajo túnel `null`; `total` = filas de vínculo
- [X] T012 [P] [US2] Implementar método privado `buildNurseryTargets(aplicacionId: string): Promise<{ targets: NurseryTargets; bandejaIds: string[] }>` en `aplicaciones-quimicas.service.ts` — una query por filas: `aplicacion_quimica_bandeja WHERE aplicacion_id = :id` + `LEFT JOIN bandejas` + `LEFT JOIN siembras` + `LEFT JOIN lotes semilla` + `LEFT JOIN lotes sustrato` + `LEFT JOIN productos` + `LEFT JOIN variedades`; agrupar por `siembra_id` en memoria con `tray_count`, `trays[]` (`id`, `codigo`, `estado` actual — puede ser `trasplantada`), y `product`/`variety`/`seed_lot`/`substrate_lot` homogéneos ⇒ valor, heterogéneos o no resueltos ⇒ `null`
- [X] T013 [US2] Modificar `getAplicacionById` en `aplicaciones-quimicas.service.ts`: mantener `aplicacion`, `detalles`, `mesa_ids`/`bandeja_ids` (ahora derivados de las mismas filas de T011/T012, sin query extra), agregar `usuario` (reutilizar T004 con un solo ID) y `targets`; tipo de retorno `AplicacionDetalleEnriquecida`; verificar `getOne()` del controller compila sin cambios
- [ ] T014 [US2] Verificación funcional del detalle según quickstart.md: greenhouse (mesas por túnel, nombre/posición/estado), nursery (seedings con lotes y trays), invariante `targets.total === mesa_ids/bandeja_ids.length`

**Checkpoint**: US2 completa — pantalla `/chemicals` end-to-end.

---

## Phase 5: User Story 3 — Resiliencia ante datos faltantes (P3)

**Goal**: ningún recurso relacionado faltante produce 500 ni excluye aplicaciones; degradación a `null` verificada.

**Independent Test**: respuestas 200 con `usuario: null`, `brand/supplier: null`, seeding heterogéneo ⇒ `product/variety/seed_lot/substrate_lot: null`, aplicación sin vínculos ⇒ `target_count: 0`.

- [X] T015 [US3] Auditar en `aplicaciones-quimicas.service.ts` que todos los joins de enriquecimiento de T004–T013 sean `LEFT JOIN` sin filtro `deleted_at` (snapshot de soft-deleted permitido), que ningún faltante lance excepción ni se convierta a 0, y que aplicaciones sin vínculos devuelvan `target_count: 0` con `target_summary` de arrays vacíos
- [ ] T016 [US3] Verificación funcional de degradación según quickstart.md: usuario eliminado ⇒ `usuario: null` (listado y detalle), químico sin marca / lote sin proveedor ⇒ `brand`/`supplier: null`, siembra heterogénea ⇒ campos `null`, todo con status 200

**Checkpoint**: las tres user stories verificadas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 Compilación estricta final `npx tsc --noEmit` y lint (`npm run lint` si aplica) sin errores ni `any` nuevos
- [X] T018 [P] Actualizar `docs/aplicaciones-quimicas-frontend.md` con el contrato enriquecido (referenciando `specs/016-enrich-aplicaciones-quimicas/contracts/aplicaciones-quimicas-read.md`)
- [ ] T019 Verificación de performance según quickstart.md: con logging SQL, una página de 10 aplicaciones ejecuta ≤ 6 queries y el detalle ≤ 5, sin queries por mesa/bandeja individual (SC-002)

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T001 antes de todo; T002 bloquea T003–T013 (tipos).
- **US1 (Phase 3)**: T004–T007 en paralelo tras T002/T003 → T008 (ensamblado) → T009 → T010.
- **US2 (Phase 4)**: independiente de US1 salvo reutilización de T004 (usuario); T011–T012 en paralelo → T013 → T014. Puede implementarse después de Phase 2 si se prioriza distinto, implementando la parte de usuario de T004 primero.
- **US3 (Phase 5)**: revisión transversal — requiere US1 y US2 terminadas.
- **Phase 6**: al final; T018 puede hacerse en paralelo con T019.

### Parallel Examples

- Tras T003: `T004 ∥ T005 ∥ T006 ∥ T007` (métodos privados distintos, mismo archivo pero secciones independientes — coordinarlas en una sola sesión de edición si las hace un solo agente).
- Tras T008: `T011 ∥ T012`.
- Polish: `T018 ∥ T019`.

## Implementation Strategy

**MVP**: Phase 1 + 2 + 3 (US1) — el listado enriquecido es el valor principal del ticket y es demostrable solo. Luego US2 (detalle), US3 (resiliencia) y Polish como incrementos independientes. Total: **19 tareas** (US1: 7, US2: 4, US3: 2, setup/foundational: 3, polish: 3).
