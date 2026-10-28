---

description: "Tareas de implementación: tiempo de ejecución de la aplicación química"
---

# Tasks: Tiempo de ejecución de la aplicación química

**Input**: `/specs/027-tiempo-aplicacion-quimica/` (spec.md, plan.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md)

**Prerequisites**: plan.md y spec.md aprobados por el usuario. **No implementar antes de la aprobación.**

**Tests**: se incluyen specs unitarios Jest (`npm test`) para la lógica pura (validador, helper, util de carencia, DTOs) porque el servicio de aplicaciones no tiene tests hoy; los escenarios de servicio se verifican con el [quickstart.md](./quickstart.md) sobre la base local descartable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1..US5 según la spec

---

## Phase 1: Setup (base de datos y errores)

**Purpose**: esquema y códigos de error compartidos por todas las historias

- [x] T001 Crear `migrations/1775200000000-AplicacionQuimicaInicioFin.ts`: `ADD fecha_hora_inicio timestamptz`, `ADD fecha_hora_fin timestamptz`, CHECKs `CHK_aplicacion_fin_eq_fecha_hora`, `CHK_aplicacion_inicio_fin_par`, `CHK_aplicacion_inicio_lte_fin` (según data-model.md); `down` revierte en orden inverso
- [x] T002 [P] Agregar `fecha_hora_inicio` y `fecha_hora_fin` (`timestamptz`, nullable) a `src/modules/aplicaciones-quimicas/entities/aplicacion-quimica.entity.ts`, con comentario de que `fecha_hora` siempre = `fecha_hora_fin`
- [x] T003 [P] Agregar `APLICACION_HORARIO_INVALIDO` y `APLICACION_DURACION_EXCESIVA` a `src/common/errors/error-codes.ts` (sección aplicaciones-quimicas)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: piezas puras y testeadas que usan los 4 puntos de escritura y las lecturas

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase

- [x] T004 [P] Crear `src/common/validators/fecha-hora-con-zona.validator.ts` con `@IsFechaHoraConZona()` (ISO-8601 con fecha+hora+`Z`/offset, fecha real; patrón `IsDosis`) y su `fecha-hora-con-zona.validator.spec.ts` (acepta `Z`, `-03:00`, milisegundos; rechaza fecha sola, hora sin zona, `2026-02-30T…`, texto, número)
- [x] T005 [P] Crear `src/common/utils/carencia.util.ts` con `calcularCarenciaHasta(fin: Date, dias: number): string` (UTC, `YYYY-MM-DD`) y `carencia.util.spec.ts` (incluye fin a las 23:30 UTC y cruce de mes/año)
- [x] T006 Crear `src/modules/aplicaciones-quimicas/utils/tiempo-aplicacion.util.ts`: constantes `TOLERANCIA_FUTURO_MS` y `DURACION_MAXIMA_MS`, `resolverTiempoAplicacion({ inicio, fin, ahora, actual })` (reglas V3–V7 de data-model.md, lanza `AppError` 422) y `duracionSegundos(inicio, fin)`; JSDoc en ambos
- [x] T007 Crear `src/modules/aplicaciones-quimicas/utils/tiempo-aplicacion.util.spec.ts`: alta con/sin fin; inicio==fin; fin<inicio; fin +3 min ok / +10 min error; 24 h ok / 24 h + 1 s error; PATCH solo inicio / solo fin contra guardado; fila vieja con un solo extremo → error; fila vieja con ambos → ok; `duracionSegundos` con nulls (depende de T006)

**Checkpoint**: `npm test` verde; helper, validador y util listos

---

## Phase 3: User Story 1 - El operario registra inicio y fin (Priority: P1) 🎯 MVP

**Goal**: toda aplicación nueva (nursery y greenhouse) guarda inicio y fin, con `fecha_hora = fin`.

**Independent Test**: quickstart §1.

- [x] T008 [US1] En `dto/create-aplicacion.dto.ts` agregar `fecha_hora_inicio` (obligatorio, `@IsFechaHoraConZona()`) y `fecha_hora_fin` (`@IsOptional()` + `@IsFechaHoraConZona()`), con comentarios sobre el default y los chunks de `operation_group_id`
- [x] T009 [US1] En `aplicaciones-quimicas.service.ts#createAplicacion`: resolver el par con `resolverTiempoAplicacion` **antes de abrir la transacción** (un rechazo no toca la base) y persistir `fecha_hora = fin`, `fecha_hora_inicio`, `fecha_hora_fin` en el insert (hoy `fecha_hora: new Date()`)
- [x] T010 [US1] En el mismo método, usar `fin` como fecha de los eventos de historial (`aplicacionDate`) y agregar `fecha_hora_inicio`/`fecha_hora_fin` al `detalle` de los eventos `aplicacion_quimica`; incluir ambos en el before/after de auditoría
- [x] T011 [P] [US1] Crear `dto/tiempo-aplicacion.dto.spec.ts` (patrón de `dosis-precision.dto.spec.ts`): el DTO de alta exige inicio, acepta fin opcional y rechaza formatos sin hora/zona

**Checkpoint**: se pueden registrar aplicaciones nuevas con horarios en ambos contextos y con chunks de grupo (mismo inicio/fin)

---

## Phase 4: User Story 2 - Rechazo de horarios imposibles (Priority: P1)

**Goal**: ningún horario inválido produce efectos (stock, carencia, historial).

**Independent Test**: quickstart §2.

- [x] T012 [US2] Verificar en `createAplicacion` que el orden de ejecución deja el rechazo de horarios antes del descuento de stock y de la transacción (revisar que no queden efectos previos como lecturas con lock); ajustar si hace falta
- [x] T013 [US2] Ejecutar quickstart §2 (tabla de casos) en la base local y registrar resultados en la descripción del PR; confirmar que stock, filas y carencia no cambian en cada rechazo

**Checkpoint**: las validaciones están cubiertas por unit tests (T007) y por la verificación end-to-end local

---

## Phase 5: User Story 3 - El supervisor corrige inicio y fin (Priority: P2)

**Goal**: PATCH de fila y de grupo corrigen inicio/fin con las mismas reglas y recalculan carencia.

**Independent Test**: quickstart §3.

- [x] T014 [P] [US3] En `dto/update-aplicacion.dto.ts` reemplazar `fecha_hora` por `fecha_hora_inicio` y `fecha_hora_fin` (opcionales, `@IsFechaHoraConZona()`)
- [x] T015 [P] [US3] En `dto/update-operation-group.dto.ts` reemplazar `fecha_hora` por `fecha_hora_inicio` y `fecha_hora_fin` de nivel grupo
- [x] T016 [US3] En `aplicaciones-quimicas.controller.ts` actualizar los conjuntos `ALLOWED` de PATCH fila (líneas ~86-92) y PATCH grupo (~121) y sus mensajes de error: fuera `fecha_hora`, dentro `fecha_hora_inicio`/`fecha_hora_fin`
- [x] T017 [US3] En `service#updateAplicacion` (bloque de `fecha_hora`, ~821-863): resolver el par contra los horarios guardados (V3–V6), escribir `fecha_hora`, `fecha_hora_inicio` y `fecha_hora_fin` juntos en el UPDATE crudo, y marcar `tocaCarencia` ante cualquier cambio de inicio o fin; actualizar el `detalle` de los eventos `en_carencia`
- [x] T018 [US3] En `service#updateOperationGroup` (items `update`, ~1241-1272): aplicar el par resuelto a nivel grupo a toda fila actualizada, validándolo una sola vez antes de la transacción
- [x] T019 [US3] En `service#updateOperationGroup` (items `create`, ~1313-1332): usar el par de nivel grupo; si falta, heredar de la primera fila del grupo con horarios (`ORDER BY created_at, id`, con `tenant_id`); si el grupo no tiene ninguna → `APLICACION_HORARIO_INVALIDO`; reemplazar `dto.fecha_hora ?? new Date()`
- [x] T020 [US3] Actualizar `detalle` de los eventos de historial y el before/after de auditoría en `updateOperationGroup` (~1361-1441) con inicio/fin

**Checkpoint**: corregir horarios de una fila o de un pedido agrupado funciona y deja carencia coherente

---

## Phase 6: User Story 4 - Carencia desde el fin (Priority: P2)

**Goal**: carencia = fin + días, calculada igual en aplicaciones y trazabilidad (UTC).

**Independent Test**: quickstart §4.

- [x] T021 [US4] En `service#recomputeCarenciaHastaBatch` (~324-334) reemplazar el cálculo local (`setDate`) por `calcularCarenciaHasta` de `src/common/utils/carencia.util.ts`
- [x] T022 [US4] En `src/modules/trazabilidad/trazabilidad.service.ts` reemplazar `computeCarenciaHasta` (~342-350) por el util común, sin cambiar su resultado, y confirmar que la alerta `alerta_carencia_incumplida` (~621-628) sigue usando `fecha_hora` (= fin)
- [x] T023 [US4] Verificar que `tocaCarencia` también se dispara en los ítems `update` de grupo con cambio de horarios (cubre T017/T018) y ejecutar quickstart §4, incluyendo `SHOW timezone` y offset del proceso

**Checkpoint**: la carencia ya no depende de la zona horaria del proceso

---

## Phase 7: User Story 5 - Consulta de inicio, fin y duración (Priority: P2)

**Goal**: todas las vistas devuelven los tres campos; orden por inicio disponible.

**Independent Test**: quickstart §5.

- [x] T024 [P] [US5] Extender `types/aplicacion-enriched.types.ts` con `fecha_hora_inicio`, `fecha_hora_fin` y `duracion_segundos`
- [x] T025 [US5] En `service#listAplicaciones`, `getAplicacionById`, `getAplicacionesByMesa` y `getAplicacionesByBandeja`: mapear los tres campos usando `duracionSegundos` (null-safe para filas antiguas)
- [x] T026 [US5] En `dto/query-aplicaciones.dto.ts` y `SORT_ALLOWED` del servicio (~1493) permitir `sortBy=fecha_hora_inicio` con `NULLS LAST`; el orden por defecto y los filtros `fecha_desde/hasta` quedan sobre `fecha_hora`
- [x] T027 [US5] En `trazabilidad.service.ts` extender `AplicacionRawRow`/`AplicacionRow`, `APLICACION_SELECT` y `mapAplicacionRow` (~139-183, 292, 376-403) con los tres campos
- [x] T028 [P] [US5] Ajustar/ampliar `src/modules/trazabilidad/trazabilidad.service.spec.ts` para cubrir aplicación nueva (con horarios) y antigua (nulls)

**Checkpoint**: las cinco vistas son coherentes entre sí

---

## Phase 8: Polish y entrega

- [x] T029 [P] Actualizar `docs/aplicaciones-quimicas-frontend.md` con el contrato nuevo (campos, errores, sort)
- [x] T030 [P] Crear `docs/handoff-frontend-tiempo-aplicacion.md`: breaking changes (inicio obligatorio, `fecha_hora` fuera de PATCH), formato con zona, chunks con mismo inicio/fin, grupos con filas antiguas, ejemplos y orden de deploy
- [x] T031 Buscar usos de `fecha_hora` de aplicaciones fuera del módulo (`lotes-quimicos.service.ts`, scripts en `scripts/sql/`) y confirmar que ninguno depende de algo que cambió
- [x] T032 Correr `npm run lint`, `npm run build` y `npm test`; corregir lo que aparezca
- [x] T033 Ejecutar el [quickstart.md](./quickstart.md) completo (§0–§6) en la base local descartable
- [ ] T034 Preparar el cierre: checklist de constitución en la descripción del PR (tenant, errores, auditoría, roles, transacciones, respuestas, tipado) y pasos de deploy (backup con `scripts/backup-data.js`, deploy coordinado con el front, verificación de solo lectura en `migrations`)

---

## Dependencies & Execution Order

- Phase 1 y Phase 2 bloquean todo. Dentro de Phase 2: T004 y T005 en paralelo; T006 → T007.
- US1 (Phase 3) es el MVP; US2 es verificación y depende de US1 + Phase 2.
- US3 depende de Phase 2 y comparte archivo de servicio con US1 (T009 antes de T017–T020).
- US4 (T021) puede hacerse en paralelo con US3 salvo el archivo de servicio (secuenciar ediciones del mismo archivo).
- US5 depende de T002 (entidad) y es independiente de US3/US4 salvo el servicio.
- Phase 8 al final.

### Orden sugerido (un solo desarrollador)

T001–T003 → T004–T007 → T008–T011 → T012–T013 → T014–T020 → T021–T023 → T024–T028 → T029–T034.

### Fuera de alcance (confirmado)

Backfill de filas antiguas, índices nuevos, reportes agregados por operario/túnel, cambios en la app móvil.
