---

description: "Task list for feature implementation"
---

# Tasks: Lotes de vermiculita con grado

**Input**: Design documents from `/specs/020-lote-vermiculita/`

**Prerequisites**: spec.md, research.md, data-model.md, plan.md — presentes. `quickstart.md` y `contracts/` pendientes (no bloquean el arranque; `quickstart.md` es prerequisito de T027).

**Tests**: En alcance, siguiendo la práctica establecida en la feature 019 — unitarios con repositorio mockeado (Jest + `@nestjs/testing`), sin DB real. Dos archivos existentes a ampliar (`src/modules/lotes/lotes.service.spec.ts`, `src/modules/siembra/siembra.service.spec.ts`) y uno nuevo (`src/modules/trazabilidad/trazabilidad.service.spec.ts`).

**Organization**: Tareas agrupadas por historia de usuario (spec.md). US1 y US2 son P1; US3 es P2; US4 es P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US4)

## Path Conventions

Proyecto único NestJS: `src/modules/lotes/*`, `src/modules/siembra/*`, `src/modules/trazabilidad/*`, `src/modules/aplicaciones-quimicas/*`, `src/common/errors/*`, `migrations/*` (ver plan.md § Project Structure).

---

## Phase 1: Setup

**Purpose**: Confirmar baseline verde antes de tocar código

- [X] T001 Correr `npx tsc --noEmit` y `npx jest --silent` en la raíz del repo para confirmar que el build y la suite actual están en verde antes de empezar

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, entidades y código de error que TODAS las historias necesitan

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esta fase completa

- [X] T002 [P] Crear `migrations/1774500000000-LoteTipoVermiculita.ts` con **una sola sentencia**: `ALTER TYPE "lote_tipo" ADD VALUE 'vermiculita'`. El `down()` queda vacío con el comentario que explica que Postgres no soporta `DROP VALUE` (copiar el formato de `1772200000000-BandejaCoolingPeriod.ts`). **No agregar nada más a este archivo** — ver data-model.md § Migraciones
- [X] T003 [P] Crear `migrations/1774500000001-LoteVermiculita.ts` con `ALTER TABLE lotes ADD grado smallint`, `CHK_lotes_grado` (CHECK bicondicional), `ALTER TABLE bandejas ADD lote_vermiculita_id uuid`, `FK_bandejas_lote_vermiculita` y `CREATE INDEX IDX_bandejas_lote_vermiculita_id`, más el `down()` completo en orden inverso (DDL exacto en data-model.md § Migraciones)
- [X] T004 [P] Agregar `VERMICULITA = 'vermiculita'` al enum `LoteTipo` y la columna `@Column({ type: 'smallint', nullable: true }) grado!: number | null` en `src/modules/lotes/entities/lote.entity.ts`
- [X] T005 [P] Agregar `@Column({ type: 'uuid', nullable: true }) lote_vermiculita_id!: string | null` en `src/modules/siembra/entities/bandeja.entity.ts` (nullable — ver research.md D5)
- [X] T006 [P] Agregar `LOTE_GRADO_NO_PERMITIDO: 'LOTE_GRADO_NO_PERMITIDO'` bajo el bloque `// lotes` en `src/common/errors/error-codes.ts`

**Checkpoint**: Esquema, entidades y error listos — cualquier historia puede empezar.

> **Nota de orden**: T002 y T003 son archivos distintos y se escriben en paralelo, pero su **ejecución** es estrictamente secuencial y el orden lo garantizan los timestamps. Verificar que `1774500000001` es efectivamente el timestamp más alto del directorio antes de correr las migraciones.

---

## Phase 3: User Story 1 - Registrar lotes de vermiculita con su grado (Priority: P1) 🎯 MVP

**Goal**: El catálogo de lotes admite el tipo vermiculita con su grado obligatorio 1–3, con el mismo ciclo de vida completo que sustrato.

**Independent Test**: Registrar un lote de vermiculita indicando su grado, consultarlo en el listado general y verificar que aparece con el grado cargado, sin que los lotes de semilla y sustrato existentes hayan cambiado en nada.

### Tests for User Story 1 ⚠️

- [ ] T007 [US1] Ampliar `src/modules/lotes/lotes.service.spec.ts` con: alta de vermiculita con `grado` válido; **422 `LOTE_GRADO_NO_PERMITIDO`** al mandar `grado` en un lote de semilla y en uno de sustrato; **422 `LOTE_PRODUCTO_NO_PERMITIDO`** y **422 `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO`** al mandar `producto_id`/`variedad_id`/`proveedor_semilla_id` en un lote de **vermiculita** (los tres casos de la guarda invertida — hoy pasarían silenciosamente); `PATCH { grado }` sobre un lote de vermiculita OK y sobre uno de sustrato 422; **409 `LOTE_REFERENCED_BY_BANDEJA`** al borrar un lote de vermiculita referenciado; y un test de regresión que confirme que semilla y sustrato siguen dando exactamente los mismos códigos que antes. Deben fallar antes de T011–T014

### Implementation for User Story 1

- [ ] T008 [US1] [P] Agregar `grado?: number` a `src/modules/lotes/dto/create-lote.dto.ts` con `@ValidateIf((o) => o.tipo === LoteTipo.VERMICULITA) @IsNotEmpty() @IsInt() @IsIn([1,2,3])`, siguiendo el patrón que ya usan los campos exclusivos de semilla
- [ ] T009 [US1] [P] Agregar `grado?: number` a `src/modules/lotes/dto/update-lote.dto.ts` con `@IsOptional() @IsInt() @IsIn([1,2,3])`
- [ ] T010 [US1] [P] Agregar `grado?: number` a `src/modules/lotes/dto/query-lotes.dto.ts` con `@IsOptional() @IsInt() @IsIn([1,2,3])` (FR-010; el filtro por `tipo` ya funciona sin cambios)
- [ ] T011 [US1] En `createLote` de `src/modules/lotes/lotes.service.ts`: invertir la guarda de línea ~99 (`dto.tipo === LoteTipo.SUSTRATO` → `dto.tipo !== LoteTipo.SEMILLA`) sin tocar su cuerpo, y agregar el rechazo 422 `LOTE_GRADO_NO_PERMITIDO` cuando `dto.tipo !== VERMICULITA && dto.grado !== undefined`. **No** ampliar la guarda a `batch` ni a `marca_id` (research.md D10) — depende de T004, T006, T008
- [ ] T012 [US1] En `updateLote` de `lotes.service.ts`: agregar `dto.grado !== undefined ||` a la condición externa de línea ~151 (**sin esto `current` no se carga y el `PATCH` de solo-grado esquiva la validación**), invertir las dos guardas de líneas ~160 y ~173 a `current.tipo !== LoteTipo.SEMILLA`, y agregar el rechazo 422 cuando `dto.grado !== undefined && current.tipo !== VERMICULITA` — depende de T011
- [ ] T013 [US1] [P] Agregar `'grado'` a `filterAllowed` en `listLotes` de `lotes.service.ts` (línea ~67) — depende de T010
- [ ] T014 [US1] Agregar `OR lote_vermiculita_id = $1` a la SQL cruda de `deleteLote` en `lotes.service.ts` (línea ~216), dejando el resto de la consulta sin cambios (FR-017; research.md D8) — depende de T003, T005

**Checkpoint**: US1 funcional de forma independiente — se pueden dar de alta, editar, filtrar, consumir, rehabilitar y borrar lotes de vermiculita, y los campos exclusivos de cada tipo se rechazan correctamente en los tres tipos.

---

## Phase 4: User Story 2 - Usar un lote de vermiculita al registrar una siembra (Priority: P1)

**Goal**: Cada grupo de bandejas de una siembra puede informar opcionalmente un lote de vermiculita, validado con las mismas cuatro reglas que semilla y sustrato, y queda asentado por bandeja.

**Independent Test**: Registrar una siembra indicando un lote de vermiculita, consultar el detalle y verificar que cada bandeja quedó asociada a ese lote; luego registrar otra siembra sin indicarlo y verificar que también se acepta.

### Tests for User Story 2 ⚠️

- [ ] T015 [US2] Ampliar `src/modules/siembra/siembra.service.spec.ts` con: siembra con vermiculita → todas las bandejas quedan con `lote_vermiculita_id`; siembra **sin** vermiculita → se acepta y las bandejas quedan en `null` (FR-013, SC-008); **422 `LOTE_TIPO_INCORRECTO`** al pasar un lote de semilla en el slot de vermiculita; **422 `LOTE_CONSUMIDO`**, **422 `LOTE_INACTIVO`** y **422 `LOTE_ESTABLECIMIENTO_MISMATCH`** identificando específicamente el lote de vermiculita (FR-015); y el caso de orden — con semilla y vermiculita ambas inválidas, el error reportado sigue siendo el de semilla (no cambia el comportamiento actual). Deben fallar antes de T017

### Implementation for User Story 2

- [ ] T016 [US2] [P] Agregar `lote_vermiculita_id?: string` con `@IsOptional() @IsUUID()` a `BandejaGroupDto` en `src/modules/siembra/dto/create-siembra.dto.ts` (el `@IsOptional()` es lo que garantiza SC-008)
- [ ] T017 [US2] En `createSiembra` de `src/modules/siembra/siembra.service.ts`: agregar el bloque de validación de vermiculita **al final** del `for (const group of dto.bandejas)`, envuelto en `if (group.lote_vermiculita_id) { ... }`, con los cuatro chequeos (tipo, establecimiento, consumido, activo) y los mismos códigos de error que semilla/sustrato. Debe ir después del bloque de sustrato para no alterar qué error se reporta primero en las siembras actuales — depende de T004, T016
- [ ] T018 [US2] Agregar `lote_vermiculita_id: group.lote_vermiculita_id ?? null` al `qr.manager.create(Bandeja, {...})` dentro de la transacción existente de `createSiembra` — depende de T005, T017
- [ ] T019 [US2] En `getSiembraWithBandejas` de `siembra.service.ts`: agregar `leftJoinAndMapOne('b.lote_vermiculita', 'lotes', 'lv', 'lv.id = b.lote_vermiculita_id')`, las columnas `b.lote_vermiculita_id`, `lv.id`, `lv.numero_lote`, `lv.tipo`, `lv.grado` al `select`, el tipo `LoteVermiculitaRef = LoteRef & { grado: number }` y `lote_vermiculita?: LoteVermiculitaRef` en `BandejaWithRefs`. **No** agregar `grado` a `LoteRef` (research.md D7). Cubre también FR-018 y el escenario 3 de US3 — depende de T018

**Checkpoint**: US1 + US2 — el lote de vermiculita se elige al sembrar, se valida igual que los otros dos, queda asentado por bandeja y se ve de vuelta en el detalle de la siembra.

---

## Phase 5: User Story 3 - Ver la vermiculita y su grado en los reportes de trazabilidad (Priority: P2)

**Goal**: El reporte de trazabilidad de cosecha y el listado enriquecido de aplicaciones químicas informan el lote de vermiculita con su grado, o su ausencia explícita.

**Independent Test**: Registrar una siembra con vermiculita, avanzar el ciclo hasta una cosecha, pedir la trazabilidad y verificar que el lote aparece con su grado; repetir con una siembra sin vermiculita y verificar que se indica la ausencia sin que el reporte falle.

### Tests for User Story 3 ⚠️

- [ ] T020 [US3] Crear `src/modules/trazabilidad/trazabilidad.service.spec.ts` mockeando `dataSource.query` para devolver filas crudas: una fila **con** vermiculita → `lote_vermiculita` mapeado con `grado`; una fila **sin** vermiculita (`lote_vermiculita_id: null`, resto de columnas `null`) → `lote_vermiculita: null`, **sin** que la bandeja se omita ni el mapeo produzca `numero_lote: undefined` (SC-007, el riesgo de copiar la aserción `!` de las líneas vecinas). Debe fallar antes de T021

### Implementation for User Story 3

- [ ] T021 [US3] [P] En `src/modules/trazabilidad/trazabilidad.service.ts`: agregar `LEFT JOIN lotes lv ON lv.id = b.lote_vermiculita_id` y las columnas `lv.numero_lote`/`lv.tipo`/`lv.grado` a la SQL cruda (línea ~480), los campos correspondientes a las tres interfaces (`BandejaCicloRaw`, `SiembraInfo` con `lote_vermiculita` **nullable**, `BandejaCicloRow`) y el mapeo **condicional** (`r.lote_vermiculita_id ? {...} : null`) — sin aserción de no-nulo sobre el id. Depende de T003, T005
- [ ] T022 [US3] [P] En `src/modules/aplicaciones-quimicas/types/aplicacion-enriched.types.ts`: agregar `LoteVermiculitaRef` (`LoteRef & { grado: number }`), el campo `vermiculite_lot: LoteVermiculitaRef | null` en `NurserySeedingGroup` (junto a `seed_lot`/`substrate_lot`, respetando la convención en inglés del archivo) y las columnas crudas `lote_vermiculita_id`/`lote_vermiculita_numero`/`lote_vermiculita_grado`
- [ ] T023 [US3] En `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`: agregar el `LEFT JOIN` y los `addSelect` de las tres columnas, un helper `loteVermiculitaRefOrNull(id, numero_lote, grado)` análogo a `loteRefOrNull`, y **volver genérico `homogeneousLote`** (`<T extends { id: string }>(values: (T | null)[]): T | null`) — si no, devuelve `LoteRef` y descarta `grado` sin error de compilación. Depende de T022

**Checkpoint**: Las tres superficies de lectura informan la vermiculita; los ciclos anteriores al cambio se responden sin errores indicando la ausencia.

---

## Phase 6: User Story 4 - Rastrear todas las bandejas que usaron una partida de vermiculita (Priority: P3)

**Goal**: `GET /bandejas` acepta filtrar por lote de vermiculita.

**Independent Test**: Registrar dos siembras con lotes de vermiculita distintos, filtrar el listado de bandejas por uno de ellos y verificar que devuelve únicamente las bandejas de la siembra correspondiente; filtrar por un lote nunca usado devuelve vacío sin error.

- [ ] T024 [US4] Agregar `'lote_vermiculita_id'` a `filterAllowed` en `src/modules/siembra/bandeja.service.ts` (línea 31). Agregar en el mismo movimiento `'lote_sustrato_id'`, que falta hoy — **adición no cubierta por ningún FR**, ver research.md D9; si se prefiere alcance estricto, omitirla. Depende de T005

**Checkpoint**: Las cuatro historias funcionan de forma independiente y en conjunto.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Correr `npx tsc --noEmit` y `npx eslint` con scope acotado a los archivos tocados (módulos `lotes`, `siembra`, `trazabilidad`, `aplicaciones-quimicas`, `error-codes.ts` y las dos migraciones) — no lint de repo completo
- [ ] T026 Correr `npx jest src/modules/lotes/lotes.service.spec.ts src/modules/siembra/siembra.service.spec.ts src/modules/trazabilidad/trazabilidad.service.spec.ts` y confirmar verde
- [ ] T027 Ejecutar la batería de verificación funcional de `quickstart.md` contra el entorno dev en Railway, y registrar la evidencia paso a paso en este archivo (formato de la sección "Evidencia" de `specs/019-lote-estado-consumido/tasks.md`) — requiere escribir `quickstart.md` primero
- [ ] T028 [P] Escribir `docs/handoff-frontend-lote-vermiculita.md`: el tercer valor de `tipo` en `GET /lotes` (**y la advertencia de que cualquier ternario de dos ramas etiquetará mal la vermiculita**), `grado` en alta/edición/filtro, `lote_vermiculita_id` opcional en `POST /siembras`, los nuevos campos nullable en las tres superficies de lectura, y el código `LOTE_GRADO_NO_PERMITIDO`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias
- **US1 (Phase 3)**: depende solo de Foundational
- **US2 (Phase 4)**: depende solo de Foundational — independiente de US1 en el código (usa el enum y la columna, no las validaciones de alta), aunque en la práctica se prueba con lotes que US1 permite crear
- **US3 (Phase 5)**: depende de Foundational; para verificarla de punta a punta necesita datos que produce US2
- **US4 (Phase 6)**: depende solo de Foundational
- **Polish (Phase 7)**: depende de las historias que se quieran incluir en el release

### Notas de archivo compartido

`src/modules/lotes/lotes.service.ts` concentra T011, T012, T013 y T014 — secuenciales entre sí aunque T013/T014 toquen métodos distintos. `src/modules/siembra/siembra.service.ts` concentra T017, T018 y T019, también secuenciales. Los DTOs (T008, T009, T010, T016) y las entidades (T004, T005) son archivos exclusivos y sí paralelizables.

### Parallel Opportunities

- T002–T006 (Foundational) — cinco archivos distintos, todos en paralelo
- T008, T009, T010 (DTOs de lote) en paralelo entre sí y con T007 (tests)
- T016 (DTO de siembra) en paralelo con cualquier tarea de US1
- T021 (trazabilidad) y T022 (tipos de aplicaciones químicas) en paralelo entre sí
- T028 (handoff) en paralelo con todo el resto una vez cerrado el diseño

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Setup (T001) + Foundational (T002–T006)
2. US1 (T007–T014) — ya se pueden administrar lotes de vermiculita con su grado
3. US2 (T015–T019) — y ya se pueden usar al sembrar, con el dato visible de vuelta en el detalle
4. **STOP y VALIDAR**: con US1 + US2 el pedido original está resuelto de punta a punta (registrar la partida + dejar asentado con qué se sembró)
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → esquema listo, sistema intacto
2. US1 → catálogo completo de vermiculita → validar
3. US2 → vínculo con la siembra → validar
4. US3 → el dato aparece en trazabilidad y aplicaciones químicas → validar
5. US4 → rastreo inverso por lote → validar
6. Polish (T025–T028) → lint, tests, verificación en dev, handoff al frontend

Cada historia agrega valor sin romper las anteriores.

---

## Notes

- [P] = archivos distintos sin dependencias pendientes
- Tests escritos ANTES de la implementación de cada historia (TDD), deben fallar primero
- T007 es el test más importante de la feature: cubre las tres guardas invertidas, que hoy fallarían **en silencio** sin lanzar ningún error
- Commit sugerido al cierre de cada historia (checkpoint), no tarea por tarea
- `quickstart.md` y `contracts/` todavía no están escritos; solo T027 los necesita
