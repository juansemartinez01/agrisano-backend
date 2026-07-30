---

description: "Task list template for feature implementation"
---

# Tasks: Estado de consumido para lotes de semilla y sustrato

**Input**: Design documents from `/specs/019-lote-estado-consumido/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — todos presentes

**Tests**: En alcance (confirmado explícitamente por el solicitante). Unitarios con repositorio mockeado (Jest + `@nestjs/testing`), sin DB real — dos archivos: `src/modules/lotes/lotes.service.spec.ts` (nuevo) y `src/modules/siembra/siembra.service.spec.ts` (nuevo).

**Organization**: Tareas agrupadas por historia de usuario (spec.md). US1 y US3 son P1; US2 y US4 son P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US4)

## Path Conventions

Proyecto único NestJS: `src/modules/lotes/*`, `src/modules/siembra/*`, `src/common/errors/*`, `migrations/*` (ver plan.md § Project Structure).

---

## Phase 1: Setup

**Purpose**: Confirmar baseline verde antes de tocar código

- [X] T001 Correr `npx tsc --noEmit` y `npx jest --silent` en la raíz del repo para confirmar que el build y la suite actual (solo el scaffold de Nest) están en verde antes de empezar

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Columnas de base de datos, entidad y códigos de error que TODAS las historias necesitan

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esta fase completa

- [X] T002 [P] Crear migración `migrations/1774400000000-LoteEstadoConsumido.ts` — `CREATE TYPE lotes_estado_enum AS ENUM ('habilitado','consumido')` + `ALTER TABLE lotes ADD COLUMN estado ... DEFAULT 'habilitado'`, `fecha_consumido`, `usuario_consumido_id`, `usuario_consumido_email_snapshot`, `usuario_consumido_nombre_snapshot`, `usuario_consumido_apellido_snapshot`, `observaciones_consumo` (ver data-model.md § Migración, incluye `down()`)
- [X] T003 [P] Agregar `export enum LoteEstado { HABILITADO = 'habilitado', CONSUMIDO = 'consumido' }` y las 6 columnas nuevas (`estado`, `fecha_consumido`, `usuario_consumido_id`, 3 snapshots, `observaciones_consumo`) a `src/modules/lotes/entities/lote.entity.ts`
- [X] T004 [P] Agregar `LOTE_CONSUMIDO`, `LOTE_INACTIVO`, `LOTE_YA_CONSUMIDO`, `LOTE_NO_CONSUMIDO` bajo el bloque `// lotes` en `src/common/errors/error-codes.ts`

**Checkpoint**: Migración, entidad y errores listos — cualquier historia puede empezar.

---

## Phase 3: User Story 1 - El operario marca un lote como consumido (Priority: P1) 🎯 MVP

**Goal**: `POST /lotes/:id/consumir` transiciona un lote `habilitado` → `consumido`, con nota opcional y registro de quién/cuándo.

**Independent Test**: Marcar un lote habilitado como consumido y verificar que `GET /lotes?disponible=true` ya no lo incluye, mientras `GET /lotes` (sin filtros) sigue mostrándolo.

### Tests for User Story 1 ⚠️

- [X] T005 [US1] Escribir tests unitarios para `LotesService.consumirLote` en `src/modules/lotes/lotes.service.spec.ts` (nuevo archivo): transición exitosa habilitado→consumido con snapshot de usuario y `observaciones_consumo` guardada; 409 `LOTE_YA_CONSUMIDO` sobre un lote ya consumido sin alterar sus datos originales; 404 sobre id inexistente/otro tenant (código genérico `NOT_FOUND`, consistente con `mustFindById`). Deben fallar antes de implementar T007.

### Implementation for User Story 1

- [X] T006 [US1] [P] Crear `src/modules/lotes/dto/consumir-lote.dto.ts` con `ConsumirLoteDto { observaciones_consumo?: string }` (`@IsOptional() @IsString() @MaxLength(2000)`)
- [X] T007 [US1] Implementar `consumirLote(id, userId, dto)` en `src/modules/lotes/lotes.service.ts`: UPDATE condicional atómico (`WHERE id AND tenant_id AND estado = 'habilitado'`, patrón `ajustarLote` de `lotes-quimicos.service.ts:155-181`), remapeo manual de `fetchUsuarioSnapshot()` a las columnas `usuario_consumido_*`, 409 `LOTE_YA_CONSUMIDO` si `affected === 0` (depende de T003, T004, T006)
- [X] T008 [US1] Agregar `AUDIT.CONSUMIDO = 'lote_consumido'` en `lotes.service.ts` e implementar `POST /lotes/:id/consumir` en `src/modules/lotes/lotes.controller.ts` con `@Roles('operario','supervisor','admin_global')`, `auditLogPayload` + `logger.info` + `audit.write('admin', ...)` (depende de T007)

**Checkpoint**: US1 funcional de forma independiente — un operario puede consumir un lote, no puede duplicar la operación, y el lote sigue visible en el listado general.

---

## Phase 4: User Story 2 - Un responsable revierte una marca de consumido hecha por error (Priority: P2)

**Goal**: `POST /lotes/:id/rehabilitar` transiciona `consumido` → `habilitado`, limpia la metadata de consumo, y está restringido a `supervisor`/`admin_global`.

**Independent Test**: Marcar un lote como consumido, revertirlo con un usuario `supervisor`, y verificar que vuelve a `GET /lotes?disponible=true`; con un `operario` la reversión debe rechazarse con 403.

### Tests for User Story 2 ⚠️

- [X] T009 [US2] Agregar tests unitarios para `LotesService.rehabilitarLote` en `src/modules/lotes/lotes.service.spec.ts` (mismo archivo que T005): transición exitosa consumido→habilitado que limpia `fecha_consumido`/`usuario_consumido_id`/snapshots/`observaciones_consumo` a `null`; 409 `LOTE_NO_CONSUMIDO` sobre un lote ya habilitado; 404 sobre id inexistente. Deben fallar antes de implementar T010.

### Implementation for User Story 2

- [X] T010 [US2] Implementar `rehabilitarLote(id)` en `src/modules/lotes/lotes.service.ts`: UPDATE condicional atómico (`WHERE id AND tenant_id AND estado = 'consumido'`), limpia los 5 campos de metadata a `null`, 409 `LOTE_NO_CONSUMIDO` si `affected === 0` (depende de T003, T004)
- [X] T011 [US2] Agregar `AUDIT.REHABILITADO = 'lote_rehabilitado'` e implementar `POST /lotes/:id/rehabilitar` en `lotes.controller.ts` con `@Roles('supervisor','admin_global')` (excluye `operario` deliberadamente) + auditoría (depende de T010)

**Checkpoint**: US1 + US2 juntas — ciclo completo consumir/rehabilitar con enforcement de roles verificado.

---

## Phase 5: User Story 3 - El sistema impide crear siembras con lotes no disponibles (Priority: P1)

**Goal**: `createSiembra` rechaza (422) cualquier lote de semilla o sustrato que esté `consumido` o `activo = false`, identificando cuál lote y por qué motivo.

**Independent Test**: Intentar crear una siembra con un lote de semilla consumido → rechazada sin crear bandejas; repetir con sustrato consumido y con un lote dado de baja administrativamente (sin estar consumido); un caso mixto debe identificar específicamente cuál de los dos lotes falla.

### Tests for User Story 3 ⚠️

- [X] T012 [US3] [P] Escribir tests unitarios para los guards nuevos de `createSiembra` en `src/modules/siembra/siembra.service.spec.ts` (nuevo archivo): 422 `LOTE_CONSUMIDO` identificando `lote_semilla_id`; 422 `LOTE_CONSUMIDO` identificando `lote_sustrato_id`; 422 `LOTE_INACTIVO` para lote `activo=false` no consumido; caso mixto (semilla disponible + sustrato no disponible) identifica el sustrato; caso feliz (ambos habilitados y activos) sigue el flujo normal sin lanzar error de guard. Deben fallar antes de implementar T013.

### Implementation for User Story 3

- [X] T013 [US3] Agregar los 4 guards (`semilla.estado === CONSUMIDO` → `LOTE_CONSUMIDO`, `!semilla.activo` → `LOTE_INACTIVO`, mismos dos para `sustrato`) dentro del loop `for (const group of dto.bandejas)` de `createSiembra` en `src/modules/siembra/siembra.service.ts`, inmediatamente después de cada chequeo de `establecimiento_id` existente (depende de T003, T004; import de `LoteEstado` agregado junto a `LoteTipo` en el mismo archivo)

**Checkpoint**: US3 funcional de forma independiente — `createSiembra` ya no acepta lotes no disponibles, con o sin las historias 1/2 implementadas (usa el campo `estado` que ya existe desde la fase Foundational).

---

## Phase 6: User Story 4 - Filtrar el listado de lotes por disponibilidad (Priority: P2)

**Goal**: `GET /lotes` gana `estado` y `disponible` como filtros opcionales, sin alterar el comportamiento sin filtros.

**Independent Test**: Con una mezcla de lotes habilitados/consumidos/inactivos, `GET /lotes` sin filtros sigue mostrando todos; `GET /lotes?disponible=true` excluye consumidos e inactivos; `GET /lotes?estado=consumido` muestra solo los consumidos.

### Tests for User Story 4 ⚠️

- [X] T014 [US4] Agregar tests unitarios para el filtrado de `LotesService.listLotes` en `src/modules/lotes/lotes.service.spec.ts` (mismo archivo que T005/T009): sin filtros devuelve todo; `estado=consumido` filtra por ese valor exacto; `disponible=true` excluye tanto consumidos como inactivos. Deben fallar antes de implementar T016.

### Implementation for User Story 4

- [X] T015 [US4] [P] Agregar `estado?: LoteEstado` (`@IsEnum`) y `disponible?: boolean` (mismo patrón `@Transform` que `activo`) a `src/modules/lotes/dto/query-lotes.dto.ts`
- [X] T016 [US4] En `LotesService.listLotes` (`lotes.service.ts`): agregar `'estado'` a `filterAllowed`, y ampliar `customizeQb` para que, cuando `q.disponible === true`, agregue `andWhere(\`${alias}.estado = :estadoDisponible AND ${alias}.activo = true\`)` sin romper el `customizeQb` existente de `q.q` (depende de T015)

**Checkpoint**: Las 4 historias funcionan de forma independiente y en conjunto.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T017 [P] Correr `npx tsc --noEmit` y `npx eslint "src/modules/lotes/**/*.ts" "src/modules/siembra/**/*.ts" "src/common/errors/error-codes.ts" "migrations/1774400000000-LoteEstadoConsumido.ts"` (scope acotado, ver quickstart.md — no lint de repo completo)
- [X] T018 Correr `npx jest src/modules/lotes/lotes.service.spec.ts src/modules/siembra/siembra.service.spec.ts` y confirmar verde
- [X] T019 Ejecutar la batería de verificación funcional de `quickstart.md` (15 pasos) contra el entorno dev en Railway

### Evidencia T019 (2026-07-30, dev Railway, admin@agrisano.com)

Deploy: merge de `019-lote-estado-consumido` a `main` (commit `380a391`), push a origin, `migrationsRun: true` aplicó la migración `1774400000000-LoteEstadoConsumido` en boot. Confirmado por el usuario que el deploy y la migración ya habían corrido antes de arrancar la verificación.

1. ✅ `GET /lotes` sin filtros: baseline de 2 items, cada uno con `"estado": "habilitado"` por defecto.
2. ✅ `POST /lotes` (sustrato, lote de prueba nuevo) → `estado: "habilitado"`, `fecha_consumido: null`, `usuario_consumido_id: null`.
3. ✅ `POST /lotes/:id/consumir` con `observaciones_consumo: "prueba"` sobre el lote de prueba → 200, `estado: "consumido"`, `fecha_consumido` seteada, observación guardada.
4. ⏭️ **Omitido** por decisión del usuario: no había credenciales de un usuario `operario` real (distinto de `admin_global`) en dev para probar el 403 de `rehabilitar` en vivo. El enforcement de roles usa el mismo `RolesGuard`/`@Roles(...)` que todos los demás endpoints protegidos del proyecto; no se re-verifica aisladamente aquí.
5. ✅ `POST /lotes/:id/rehabilitar` (admin, rol `supervisor`/`admin_global` calificando) → `estado: "habilitado"`, los 5 campos de metadata (`fecha_consumido`, `usuario_consumido_id`, 3 snapshots, `observaciones_consumo`) vueltos a `null`.
6. ✅ Doble `consumir` → segunda llamada 409 `LOTE_YA_CONSUMIDO`; `fecha_consumido` del primer registro no cambió.
7. ✅ Doble `rehabilitar` sobre lote ya habilitado → 409 `LOTE_NO_CONSUMIDO`.
8. ✅ `disponible=true` excluye el lote recién consumido; `GET /lotes` sin filtros lo sigue mostrando.
9. ✅ Lote rehabilitado + `PATCH activo:false` (estado sigue `habilitado`) → tampoco aparece en `disponible=true`.
10. ✅ `estado=consumido` devuelve únicamente lotes en ese estado (1 resultado, el de prueba).
11. ✅ `createSiembra` con lote semilla fixture (`14e715e1-...`) consumido → 422 `LOTE_CONSUMIDO` identificando `lote_semilla_id`. Rehabilitado al terminar.
12. ✅ Mismo test con lote sustrato fixture (`622a5b3f-...`) consumido → 422 `LOTE_CONSUMIDO` identificando `lote_sustrato_id`. Rehabilitado al terminar.
13. ✅ Lote semilla fixture con `activo:false` (sin consumir) → 422 `LOTE_INACTIVO`. Reactivado al terminar.
14. ✅ `GET /bandejas?lote_semilla_id=...` antes y después de consumir/rehabilitar el lote fixture → resultados idénticos (JSON comparado byte a byte).
15. ✅ `PATCH /lotes/:id` con `{"estado": "consumido"}` en el body → 400 `BAD_REQUEST` ("property estado should not exist"), whitelist de NestJS rechaza el campo.

Limpieza: lote de prueba creado en el paso 2 fue soft-deleted al finalizar; fixtures `14e715e1-...` y `622a5b3f-...` quedaron en `estado: habilitado`, `activo: true`, idéntico a su estado previo a la verificación.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias
- **US1 (Phase 3)**: depende solo de Foundational
- **US2 (Phase 4)**: depende solo de Foundational (no de US1 — usa el mismo campo `estado` pero es la transición inversa, implementable y testeable de forma independiente aunque en la práctica conviene hacerla después de US1 porque comparte archivo)
- **US3 (Phase 5)**: depende solo de Foundational — completamente independiente de US1/US2 (usa `estado`/`activo` de lectura, no las transiciones)
- **US4 (Phase 6)**: depende solo de Foundational
- **Polish (Phase 7)**: depende de las historias que se quieran incluir en el release

### Notas de archivo compartido

`src/modules/lotes/lotes.service.ts` y `src/modules/lotes/lotes.service.spec.ts` son tocados por US1, US2 y US4 — esas tareas son secuenciales entre sí (T007→T010→T016 y T005→T009→T014), no paralelas, aunque las historias sean conceptualmente independientes. `src/modules/siembra/siembra.service.ts` (US3) y los DTOs nuevos (T006, T015) son archivos exclusivos de su tarea y sí paralelizables frente al resto.

### Parallel Opportunities

- T002, T003, T004 (Foundational) — archivos distintos, en paralelo
- T006 (DTO US1) en paralelo con T005 (tests US1, archivo distinto)
- T012 (tests US3, archivo nuevo) en paralelo con cualquier tarea de US1/US2/US4
- T015 (DTO US4) en paralelo con T014 si se prioriza, aunque T016 depende de T015
- T017 en paralelo con T018 (comandos independientes)

---

## Parallel Example: Foundational

```bash
Task: "Crear migración 1774400000000-LoteEstadoConsumido.ts"
Task: "Agregar LoteEstado enum + columnas a lote.entity.ts"
Task: "Agregar 4 códigos de error a error-codes.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 3)

1. Setup (T001) + Foundational (T002-T004)
2. US1 (T005-T008) — el operario ya puede consumir lotes
3. US3 (T012-T013) — y ese estado ya tiene consecuencia real en `createSiembra`
4. **STOP y VALIDAR**: con solo US1+US3, el pedido original ya está resuelto de punta a punta (marcar consumido + que tenga efecto)
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → operario puede consumir (aún sin efecto en `createSiembra`) → validar independientemente
3. US3 → `createSiembra` ya rechaza no disponibles (funciona incluso sin US1, usando lotes preexistentes con `activo=false`) → validar
4. US2 → reversión para supervisores → validar
5. US4 → filtros de listado, comodidad de cliente → validar
6. Polish (T017-T019) → lint, tests, verificación funcional completa

Cada historia agrega valor sin romper las anteriores.

---

## Notes

- [P] = archivos distintos sin dependencias pendientes
- Tests escritos ANTES de la implementación de cada historia (TDD), deben fallar primero
- T005/T009/T014 comparten archivo (`lotes.service.spec.ts`) — ejecutar en el orden de las historias, no en paralelo entre sí
- Commit sugerido al cierre de cada historia (checkpoint), no tarea por tarea
