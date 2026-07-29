# Tasks: Fecha de entrada a nursery retroactiva

**Input**: Design documents from `/specs/018-fecha-entrada-nursery-retroactiva/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ingresar-nursery.md](contracts/ingresar-nursery.md), [quickstart.md](quickstart.md)

**Tests**: no se generan tareas de test automatizado. El proyecto no tiene suite de tests y la especificación no los pidió; la verificación es `tsc --noEmit` + eslint del módulo + la batería funcional de `quickstart.md` contra el entorno de desarrollo (mismo criterio que las features 016 y 017).

**Organization**: las tareas se agrupan por historia de usuario. Ojo con una particularidad de esta feature: **US1, US2 y US3 conviven en el mismo método** (`ingresarNursery`), así que dentro de las fases de historia las tareas son secuenciales y casi no hay paralelismo. El paralelismo real está en las fases de Setup y de Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1, US2, US3
- Todas las rutas son relativas a la raíz del repo

## Path Conventions

Proyecto único NestJS: código en `src/`, docs en `docs/`, colecciones en `postman/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: piezas nuevas que no dependen de nada y que todas las historias necesitan.

- [X] T001 [P] Agregar la constante `SIEMBRA_FECHA_ENTRADA_INVALIDA: 'SIEMBRA_FECHA_ENTRADA_INVALIDA'` al objeto `ErrorCodes` en `src/common/errors/error-codes.ts`, junto a las demás claves `SIEMBRA_*` (líneas 38-41)
- [X] T002 [P] Crear el DTO `IngresarNurseryDto` en `src/modules/siembra/dto/ingresar-nursery.dto.ts` con un único campo `fecha_entrada?: string` decorado con `@IsOptional()` y `@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha_entrada debe tener formato YYYY-MM-DD (solo día, sin hora)' })`, importando los decoradores de `class-validator` (ver research D3: **no** usar `@IsDateString()`)

**Checkpoint**: el código de error y el DTO existen; `npx tsc --noEmit` compila (el DTO todavía no está referenciado).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: cablear el DTO desde el controller hasta el service sin cambiar todavía ningún comportamiento. Al terminar esta fase el endpoint acepta el body pero lo ignora, y sigue funcionando exactamente igual que hoy.

**⚠️ CRITICAL**: ninguna historia puede implementarse hasta terminar esta fase.

- [X] T003 Cambiar la firma de `ingresarNursery` en `src/modules/siembra/siembra.service.ts:241` a `async ingresarNursery(id: string, dto?: IngresarNurseryDto): Promise<SiembraWithBandejas>` e importar el DTO. No usar todavía `dto` (el cuerpo del método queda intacto)
- [X] T004 Agregar `@Body() dto: IngresarNurseryDto` al handler `ingresarNursery` en `src/modules/siembra/siembra.controller.ts:95` y pasarlo como segundo argumento a `this.svc.ingresarNursery(id, dto)`, importando `Body` de `@nestjs/common` y el DTO (depende de T002, T003)

**Checkpoint**: `POST /siembras/:id/ingresar-nursery` acepta `{}` y `{ "fecha_entrada": "..." }` sin romper, rechaza con 400 un formato inválido o un campo desconocido, y el comportamiento persistido sigue siendo `now()` en todos los casos. Verificable con los pasos 1, 2, 9 y 10 de `quickstart.md`.

---

## Phase 3: User Story 1 - Registrar un ingreso a nursery que ocurrió días atrás (Priority: P1) 🎯 MVP

**Goal**: que una fecha pasada informada se persista en todas las bandejas movidas, preservando el día calendario, y que el camino sin fecha no cambie.

**Independent Test**: mover una siembra de cooling a nursery informando una fecha pasada válida y verificar que todas sus bandejas quedan con esa fecha (`T12:00:00.000Z`), no con el instante de la carga. Pasos 1-5 de `quickstart.md`.

### Implementation for User Story 1

- [X] T005 [US1] En `src/modules/siembra/siembra.service.ts`, agregar un helper privado `private resolveFechaEntradaNursery(fecha: string | undefined): Date | (() => string)` que devuelva `() => 'now()'` cuando `fecha` es `undefined` o igual al día actual UTC (`new Date().toISOString().split('T')[0]`), y `new Date(\`${fecha}T12:00:00.000Z\`)` en cualquier otro caso. Tipado explícito, sin `any` (research D1 y D2)
- [X] T006 [US1] En `ingresarNursery` de `src/modules/siembra/siembra.service.ts`, calcular el valor con el helper de T005 antes de abrir la transacción y usarlo en `.set({ estado: BandejaEstado.EN_NURSERY, fecha_entrada_nursery: <valor> })` (línea 262), reemplazando el `() => 'now()'` hardcodeado (depende de T005)
- [X] T007 [US1] En `src/modules/siembra/siembra.controller.ts`, incluir la fecha informada en la auditoría existente: cambiar `extra: { siembraId: id }` (línea 104) por `extra: { siembraId: id, fechaEntrada: dto.fecha_entrada ?? null }` (FR-012)

**Checkpoint**: US1 completa y verificable de punta a punta. Sin fecha y con la fecha de hoy → instante real; con fecha pasada → mediodía UTC de ese día, idéntico en todas las bandejas de la siembra. **Todavía sin validaciones**: una fecha futura o anterior a la siembra se aceptaría — eso es US2.

---

## Phase 4: User Story 2 - El sistema rechaza fechas imposibles (Priority: P1)

**Goal**: cerrar la puerta a fechas futuras, anteriores a la siembra e inexistentes, con un código de error propio y sin tocar ninguna bandeja.

**Independent Test**: intentar el movimiento con una fecha futura, con una anterior a la siembra y con `2026-02-31`; los tres son rechazados con 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` y la siembra queda intacta. Pasos 6-8 de `quickstart.md`.

**Dependencia real**: se apoya en T003/T004 (el dto llega al service) y en T005 (el helper que consume la fecha ya validada). US1 y US2 se entregan juntas porque el spec marca ambas como P1.

### Implementation for User Story 2

- [X] T008 [US2] En `src/modules/siembra/siembra.service.ts`, agregar un helper privado `private assertFechaEntradaValida(fecha: string, fechaSiembra: string): void` que lance `AppError` con `code: ErrorCodes.SIEMBRA_FECHA_ENTRADA_INVALIDA` y `status: 422` en tres casos: (a) la fecha no existe en el calendario, detectado por round-trip — `new Date(\`${fecha}T12:00:00.000Z\`).toISOString().split('T')[0] !== fecha` (research D3: JS hace roll-over silencioso, `2026-02-31` → `2026-03-03`); (b) `fecha > hoyUTC`; (c) `fecha < fechaSiembra`. Comparaciones de strings `YYYY-MM-DD` directas, sin objetos `Date` (research D4). Mensajes distintos por caso para que el cliente entienda el rechazo (depende de T001)
- [X] T009 [US2] En `ingresarNursery` de `src/modules/siembra/siembra.service.ts`, invocar `this.assertFechaEntradaValida(dto.fecha_entrada, siembra.fecha)` cuando `dto?.fecha_entrada` esté presente, ubicándola **después** del `findOne` que valida la siembra (línea 244-253) y **antes** de `this.dataSource.createQueryRunner()` (línea 255), de modo que un rechazo no abra transacción ni toque la base (FR-014) (depende de T008)
- [X] T010 [US2] Verificar que `siembra.fecha` llega como string `'YYYY-MM-DD'` desde TypeORM (columna `date` en `src/modules/siembra/entities/siembra.entity.ts`) y que el tipo de la entidad lo refleja; ajustar el tipado si TypeORM lo declara como `Date`, para que la comparación de T008 sea string contra string y no falle en tiempo de compilación

**Checkpoint**: US1 + US2 funcionando. Las fechas válidas se persisten con el día correcto y las imposibles son rechazadas sin efecto. Esto es el alcance funcional completo del pedido.

---

## Phase 5: User Story 3 - Las bandejas ya movidas no se pueden re-fechar (Priority: P2)

**Goal**: garantizar que el movimiento sigue alcanzando solo a bandejas en `cooling_period`, del tenant correcto y no eliminadas.

**Independent Test**: ejecutar el movimiento dos veces sobre la misma siembra con fechas distintas; el segundo intento devuelve 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING` y las fechas del primero quedan intactas. Paso 11 de `quickstart.md`.

**Nota**: el comportamiento central de esta historia (el filtro `estado = 'cooling_period'`) **ya existe** y se conserva; lo que agrega esta fase es el hardening de la query aprovechando que se está editando (research D5).

### Implementation for User Story 3

- [X] T011 [US3] En el `UpdateQueryBuilder` de `ingresarNursery` en `src/modules/siembra/siembra.service.ts:263-264`, agregar `.andWhere('tenant_id = :tenantId', { tenantId })` y `.andWhere('deleted_at IS NULL')` conservando intactos los filtros existentes `siembra_id = :id` y `estado = :estado` (FR-015, research D5). La variable `tenantId` ya está disponible en el scope (línea 242)
- [X] T012 [US3] Confirmar que el bloque `if (!result.affected)` (líneas 267-273) sigue lanzando 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING` sin cambios, y que el `catch` hace rollback antes de re-lanzar, de modo que un rechazo tardío tampoco deje bandejas modificadas (FR-010, FR-014)

**Checkpoint**: las tres historias funcionan. El movimiento es todo-o-nada, irreversible y acotado al tenant.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: contrato documentado, herramientas actualizadas y verificación completa.

- [X] T013 [P] Documentar el contrato nuevo en `docs/siembra-frontend.md`, sección del endpoint `POST /siembras/:id/ingresar-nursery`: body opcional `fecha_entrada`, semántica del valor persistido (sin fecha / hoy → instante real; pasada → `T12:00:00.000Z`), los dos límites de validación, la tabla de errores con `SIEMBRA_FECHA_ENTRADA_INVALIDA`, y la advertencia de no usar `toISOString()` en el front para derivar el día (ver `contracts/ingresar-nursery.md`)
- [X] T014 [P] Actualizar el request `POST /siembras/:id/ingresar-nursery` en `postman/siembra.postman_collection.json` con un body de ejemplo `{ "fecha_entrada": "2026-07-20" }`, dejando claro en la descripción que el body es opcional
- [X] T015 Ejecutar `npx tsc --noEmit` y `npx eslint "src/modules/siembra/**/*.ts"` y corregir lo que aparezca. **No** correr el lint del repo completo ni `eslint --fix` global: hay errores preexistentes en `src/common/*` ajenos a esta feature y el fix masivo reformatea archivos no relacionados
- [ ] T016 Ejecutar la batería funcional completa de `quickstart.md` (13 pasos + 4 de regresión) contra el entorno de desarrollo y registrar la evidencia en una sección "Verificación en entorno de desarrollo" al final de este archivo, con la fecha y el `id` de las siembras usadas (mismo formato que `specs/017-cantidad-primario-explicita/tasks.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T001 y T002 en paralelo
- **Foundational (Phase 2)**: depende de T002. **Bloquea todas las historias**
- **US1 (Phase 3)**: depende de Phase 2
- **US2 (Phase 4)**: depende de Phase 2 y de T001; T009 se ubica en el mismo método que T006
- **US3 (Phase 5)**: depende de Phase 2; toca la misma query que T006
- **Polish (Phase 6)**: T013 y T014 pueden hacerse en cualquier momento después de Phase 2 (son docs); T015 y T016 al final

### Cadena crítica

```text
T001 ─┐
T002 ─┴─▶ T003 ─▶ T004 ─▶ T005 ─▶ T006 ─▶ T007 ─▶ T008 ─▶ T009 ─▶ T010 ─▶ T011 ─▶ T012 ─▶ T015 ─▶ T016
                                                                        (T013, T014 en paralelo)
```

### Parallel Opportunities

- **T001 + T002**: archivos distintos (`error-codes.ts` y el DTO nuevo), sin relación entre sí
- **T013 + T014**: doc y colección Postman, independientes entre sí y del código
- **Todo lo demás es secuencial**: T003, T005, T006, T008, T009, T011 y T012 editan el mismo archivo (`siembra.service.ts`), y varias de ellas el mismo método. Intentar paralelizarlas produce conflictos

---

## Parallel Example: Phase 1

```text
Task: "Agregar SIEMBRA_FECHA_ENTRADA_INVALIDA en src/common/errors/error-codes.ts"
Task: "Crear IngresarNurseryDto en src/modules/siembra/dto/ingresar-nursery.dto.ts"
```

---

## Implementation Strategy

### MVP

Por el tamaño de la feature, el MVP entregable es **Phase 1 + 2 + 3 + 4** (US1 y US2, ambas P1). US1 sola dejaría el endpoint aceptando fechas futuras o anteriores a la siembra, así que no es desplegable por separado: son un único incremento.

### Orden recomendado

1. Phase 1 + Phase 2 → el endpoint acepta el body sin cambiar comportamiento. **Verificar pasos 1, 2, 9 y 10** de quickstart: cero regresión
2. Phase 3 (US1) → la fecha pasada se persiste. **Verificar pasos 3, 4, 5**
3. Phase 4 (US2) → las fechas imposibles se rechazan. **Verificar pasos 6, 7, 8**
4. Phase 5 (US3) → hardening. **Verificar paso 11** y el conteo de bandejas movidas
5. Phase 6 → docs, Postman, compilación y batería completa

### Riesgo a vigilar durante la implementación

El punto más fácil de equivocar es T005/T008: si el helper de T005 se aplica **antes** de validar, o si T008 compara objetos `Date` en lugar de strings, reaparece el corrimiento de un día que toda la feature busca evitar. El paso 4 de quickstart (esperar exactamente `2026-07-20T12:00:00.000Z`) es el que lo detecta.

---

## Notes

- Tareas `[P]` = archivos distintos, sin dependencias
- Toda validación de negocio va **antes** de `createQueryRunner()`: un rechazo no debe abrir transacción
- Sin migración: `bandejas.fecha_entrada_nursery` ya es `timestamptz NULL`
- Las respuestas de lectura no cambian (FR-013): si algún cambio toca `getSiembraWithBandejas`, está fuera de alcance
- Commit por fase, no por tarea: las fases 1-2 y 3-4 son incrementos coherentes
