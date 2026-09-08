---
description: "Task list for 023-descarte-bandejas"
---

# Tasks: Descarte de bandejas (registro de pérdida)

**Input**: Design documents from `specs/023-descarte-bandejas/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/bandejas-descarte-api.md](./contracts/bandejas-descarte-api.md)

**Tests**: sin tests automatizados. El repo verifica con `npm run build` y colecciones Postman; cada fase termina con su verificación funcional.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede hacerse en paralelo (archivo distinto, sin dependencias)
- **[Story]**: user story a la que pertenece (US1…US5)

---

## Phase 0: Rama prerrequisito — guardas de estado

**Rama**: `023-fix-guardas-estado` → merge a `main` **antes** de arrancar la Fase 1.

**Purpose**: cerrar el TOCTOU que ya existe hoy en producción. Sin esto, FR-005 no se cumple: una bandeja descartada puede trasplantarse igual.

**⚠️ Bloqueante**: ninguna tarea de la Fase 2 en adelante tiene sentido sin esto mergeado.

- [x] T001 Agregar `AND estado = 'en_nursery'` al `UPDATE bandejas` dentro de la transacción en `src/modules/trasplante/trasplante.service.ts`, y lanzar `TRASPLANTE_BANDEJA_INVALIDA` (422) con el `bandeja_id` en `details` cuando no se afecte ninguna fila
- [x] T002 [P] Revalidar dentro de la transacción en `src/modules/aplicaciones-quimicas/aplicaciones-quimicas.service.ts`, fallando con `APLICACION_TARGET_INVALIDO` cuando alguna bandeja dejó de estar en `en_nursery`
- [x] T003 `npm run build` (verde) y `npm test` (5 suites, 69 tests, verde)
- [x] T004 Verificar la carrera: dos operaciones concurrentes sobre la misma bandeja; la perdedora no escribe
- [x] T005 Anotar en `docs/handoff-frontend-guardas-estado-bandeja.md` el cambio de comportamiento observable: un doble trasplante que hoy "funciona" en silencio pasa a devolver 422

**Checkpoint**: mergeado a `main`. Recién ahí se crea la rama `023-descarte-bandejas`.

### Notas de implementación

**T001 — `RETURNING id`, y hay que destructurar la tupla.** `qr.query()` no devuelve un `UpdateResult`, así que `.affected` no existe; la guarda se lee con `RETURNING id`. Pero **para un `UPDATE` o un `DELETE` el resultado no son las filas sino la tupla `[filas, rowCount]`** (`PostgresQueryRunner`: `result.raw = [raw.rows, raw.rowCount]` para esos dos comandos, `raw.rows` para todo el resto). El primer intento leía `rows.length === 0` sobre la tupla, cuyo largo es siempre 2, y la guarda quedaba en código muerto — ver la nota de T004. La forma correcta:

```ts
const [actualizadas] = (await qr.query(
  `UPDATE bandejas SET … WHERE … AND estado = $4 RETURNING id`,
  [...],
)) as [Array<{ id: string }>, number];
if (actualizadas.length === 0) { /* perdió la carrera */ }
```

En `aplicaciones-quimicas` la revalidación es un `SELECT … FOR UPDATE`, que sí devuelve las filas directamente: **no** lleva destructuring. Barrido del resto del repo: los `qr.query()` de `mesas.service.ts:92`, `tareas.service.ts:138` y `trasplante.service.ts:119` son `SELECT MAX(...)` y están bien.

**T002 — la guarda no podía ir en un `UPDATE`.** El plan asumía agregarle `AND estado = 'en_nursery'` al `UPDATE bandejas` del módulo, pero ese `UPDATE` sólo corre `if (hasCarencia && carenciaHastaStr)`: un químico sin período de carencia no produce ninguna escritura sobre `bandejas`, y la guarda nunca se ejecutaría. Se resolvió con un `SELECT … FOR UPDATE` al principio del bloque nursery, que cubre tanto el link como la carencia.

**T003 — la base local se recreó de cero.** Estaba 22 migraciones atrasada y la primera pendiente (`QuimicosLotesRefactor1771900000000`) fallaba porque `quimicos.batch` no existía en el esquema local aunque `AddChemicalFields1771500000000` figuraba como aplicada: drift preexistente por una columna borrada a mano, ajeno a este cambio. Con autorización explícita se dropeó y recreó `db_agrisano` (44/44 migraciones, 33 tablas, admin sembrado). **La base de Railway no se tocó.**

Las colecciones Postman no son auto-contenidas — piden `mesaId`, `tunelId`, `bandejaId`, `loteQuimicoId` precargados a mano —, así que se recorrieron sus casos con un script que arma el escenario vía API y dispara las mismas requests con los mismos bodies y las mismas aserciones de sus `event.test`. **16/16 en verde**, incluidos los cuatro casos de `trasplante` y los ocho de `aplicaciones-quimicas`.

Dos detalles preexistentes que aparecieron en el camino, ninguno provocado por este cambio: la colección de aplicaciones trae un caso negativo con `contexto: "invernadero"` y `receta_id`/`quimico_id`, campos que ya no existen en `CreateAplicacionDto`; y un `GET /aplicaciones-quimicas/:id` con un id que no es UUID devuelve 500 en vez de 400.

**T004 — verificado por HTTP, y ahí apareció un bug en la propia guarda.** El test end-to-end dispara dos `POST /trasplante` concurrentes sobre la misma bandeja con `Promise.all`. La primera corrida dio **200 y 200**, con dos eventos en `historial_mesa`: la guarda corría pero no cortaba nada, porque leía mal el resultado del `UPDATE` (ver T001). `mesa_bandeja` mostraba una sola fila y disimulaba el problema — su PK compuesta `(mesa_id, bandeja_id)` hace que el segundo `save()` sea un upsert.

Con el resultado destructurado, la corrida queda en **8/8**:

| Aserción | Resultado |
|---|---|
| exactamente un 200 y un 422 | ✅ |
| el 422 trae `TRASPLANTE_BANDEJA_INVALIDA` y `details.bandeja_ids` | ✅ |
| una sola fila en `mesa_bandeja` | ✅ |
| la bandeja queda `trasplantada` apuntando a la mesa correcta | ✅ |
| un solo evento `trasplante` en `historial_mesa` | ✅ |
| la mesa avanza una sola posición | ✅ |

`POST /trasplante` responde **200**, no 201: el controller tiene `@HttpCode(200)` y la colección Postman ya asertaba 200.

La carrera de `aplicaciones-quimicas` no se puede provocar por HTTP — hace falta que el chequeo previo del perdedor pase *antes* de que el ganador commitee, y desde afuera no hay forma de intercalarlos. Se verificó con dos conexiones concurrentes ejecutando las mismas sentencias que el service, confirmando contra `pg_stat_activity` que la transacción perdedora quedaba esperando el lock de fila:

| Escenario | Código viejo | Código nuevo |
|---|---|---|
| Dos trasplantes de la misma bandeja | ambos afectan 1 fila → doble registro | 1 y 0 filas → la perdedora da 422 |
| Aplicación nursery sobre bandeja recién trasplantada | el chequeo previo la ve vigente y escribe igual | `FOR UPDATE` bloquea, re-evalúa y devuelve 0 filas → 422 |

Los dos escenarios "código viejo" reproducen el bug, así que la prueba discrimina. Lo que sí se verificó por HTTP del lado de aplicaciones es el caso secuencial: aplicación nursery sobre una bandeja ya trasplantada → 422 `APLICACION_TARGET_INVALIDO`, sin dejar registro.

**Moraleja para las fases que siguen**: la prueba SQL valida la semántica de Postgres, no el TypeScript que lee el resultado. Toda guarda nueva de este tipo necesita además la vuelta por HTTP.

---

## Phase 1: Base de datos y modelo

**Purpose**: el esquema y los tipos sobre los que se apoya todo lo demás.

**⚠️ Bloqueante**: ninguna user story puede empezar antes de terminar esta fase.

- [x] T006 Crear `migrations/1774800000000-BandejaEstadoDescartada.ts` con **únicamente** `ALTER TYPE "bandeja_estado" ADD VALUE 'descartada'`, replicando el comentario explicativo de `1772200000000-BandejaCoolingPeriod.ts` (Postgres no permite usar un valor de enum recién agregado en la misma transacción)
- [x] T007 Crear `migrations/1774800000001-BandejaDescartesInit.ts`: tipo `bandeja_descarte_motivo`, tabla `bandeja_descartes` con PK sobre `bandeja_id`, las dos FKs sin `ON DELETE CASCADE`, y los 3 índices (`tenant_id`, `motivo`, `fecha_descarte`) según [data-model.md](./data-model.md)
- [x] T008 [P] Agregar `DESCARTADA = 'descartada'` al enum `BandejaEstado` en `src/modules/siembra/entities/bandeja.entity.ts`
- [x] T009 [P] Agregar `BANDEJA_DESCARTADA = 'bandeja_descartada'` al enum `HistorialTipoEvento` en `src/modules/mesas/entities/historial-mesa.entity.ts`
- [x] T010 [P] Agregar los 4 códigos a `src/common/errors/error-codes.ts`: `BANDEJA_YA_DESCARTADA`, `BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES`, `BANDEJA_DESCARTE_FECHA_INVALIDA`, `SIEMBRA_HAS_DESCARTADAS`
- [x] T011 Crear `src/modules/siembra/entities/bandeja-descarte.entity.ts` con el enum `BandejaDescarteMotivo` y la entidad; **no extiende `BaseEntity`** (sin `id` propio, sin `updated_at`, sin `deleted_at`), siguiendo el criterio de `mesa-bandeja.entity.ts`
- [x] T012 Registrar `BandejaDescarte` en `TypeOrmModule.forFeature` y agregar `AuditModule` a `src/modules/siembra/siembra.module.ts`
- [x] T013 `npm run migration:run` contra la base de desarrollo y `npm run build`

**Checkpoint**: el esquema existe y el proyecto compila. Ninguna conducta nueva todavía.

### Notas de implementación

**T006/T009 — `historial_tipo_evento` también es un enum de Postgres.** La tarea pedía "**únicamente** `ALTER TYPE "bandeja_estado"`", pero `HistorialMesa.tipo_evento` está declarado con `enumName: 'historial_tipo_evento'`: agregar el valor al enum de TypeScript (T009) sin su `ALTER TYPE` habría roto el primer `INSERT` en `historial_mesa` — y recién en la Fase 2, lejos de acá. Los dos `ALTER TYPE` van juntos en `1774800000000` porque lo que Postgres prohíbe es *usar* un valor recién agregado dentro de la transacción que lo agregó, no agregar dos. Ninguno se usa en esa migración; `1774800000001` sí usa `bandeja_estado` (en `estado_anterior`) y queda en otra transacción gracias a `migrationsTransactionMode: 'each'`.

**T012 — `AuditModule` ya estaba importado** en `siembra.module.ts`. La tarea se redujo a sumar `BandejaDescarte` al `forFeature`.

**T013 — qué se verificó.** Las dos migraciones corrieron contra la base local; `npm run build` verde; `npx jest` 5 suites / 69 tests verde; la API arranca limpia (`Nest application successfully started`, sin migraciones pendientes ni warnings de metadata, que es lo que confirma que la entidad nueva mapea contra el tipo `bandeja_descarte_motivo` real). El esquema entregado se contrastó por SQL contra [data-model.md](./data-model.md): las 11 columnas, PK sobre `bandeja_id`, los 3 índices, las 2 FKs `ON DELETE NO ACTION`, y los 3 enums con sus valores.

---

## Phase 2: Operación de descarte (US1 + US3) 🎯 MVP

**Goal**: un operario registra la pérdida de una o varias bandejas, con motivo, observaciones y fecha retroactiva opcional.

**Independent Test**: descartar una bandeja de cada estado de origen, verificar que queda `descartada`, que el registro es consultable, y que un segundo descarte de la misma bandeja devuelve 409.

- [x] T014 [P] [US3] Crear `src/common/utils/fecha-dia.util.ts` extrayendo `hoyISO`, la validación de fecha calendario y el resolver de fecha a mediodía UTC que hoy son privados en `siembra.service.ts` (Principio I)
- [x] T015 [US3] Reemplazar los helpers privados de `src/modules/siembra/siembra.service.ts` por los del util nuevo, sin cambiar el comportamiento de `fecha_entrada_nursery`
- [x] T016 [P] [US1] Crear `src/modules/siembra/dto/descartar-bandejas.dto.ts` con `bandeja_ids` (`@ArrayNotEmpty`, `@ArrayMaxSize(200)`, `@IsUUID('4', { each: true })`), `motivo` (`@IsEnum`), `observaciones` (`@IsOptional`, `@MaxLength(500)`) y `fecha_descarte` (`@Matches` de `YYYY-MM-DD`)
- [x] T017 [US1] Implementar `BandejaService.descartarBandejas`: deduplicar ids, abrir `QueryRunner`, y ejecutar las 3 sentencias por conjunto de [data-model.md](./data-model.md) (`SELECT … FOR UPDATE` con join a `siembras`, `INSERT … SELECT`, `UPDATE` con guarda)
- [x] T018 [US1] Validar elegibilidad sobre el resultado del `SELECT` bloqueado: ids faltantes → `BANDEJA_NOT_FOUND` 404 con `details.ids`; ya descartadas → `BANDEJA_YA_DESCARTADA` 409 con `details.ids`. All-or-nothing
- [x] T019 [US1] Validar `motivo = 'otro'` sin observaciones → `BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES` 422
- [x] T020 [US3] Validar la fecha: futura o inexistente → `BANDEJA_DESCARTE_FECHA_INVALIDA` 422; anterior al último hecho conocido de la bandeja (`fecha_trasplante ?? fecha_entrada_nursery ?? siembra.fecha`) → mismo código con `details.ids`. Sin fecha o fecha de hoy → `now()`; fecha anterior → mediodía UTC
- [x] T021 [US1] Resolver el snapshot del usuario con `fetchUsuarioSnapshot` y persistirlo en las 3 columnas de snapshot
- [x] T022 [US1] Insertar por conjunto los eventos `bandeja_descartada` en `historial_mesa` para las bandejas cuyo `estado_anterior` era `trasplantada`, con `detalle` = `{ bandeja_id, motivo, observaciones, fecha_descarte }`
- [x] T023 [US1] Agregar `@Post('descartar')` a `src/modules/siembra/bandeja.controller.ts` con `@Roles('operario','supervisor','admin_global')`, **declarado antes de `@Get(':id')`**, devolviendo `ok()` con el shape del contrato
- [x] T024 [US1] Escribir la auditoría desde el controller con el `req` real (no un objeto sintético): acción `bandeja_descartada`, con ids alcanzados y motivo
- [x] T025 `npm run build` y verificación funcional: descarte desde `cooling_period`, `en_nursery` y `trasplantada`; doble descarte → 409; `motivo=otro` sin observaciones → 422; fecha futura → 422; fecha anterior al trasplante → 422; bandeja de otro tenant → 404
- [x] T026 [US1] Verificar que el descarte **no** modificó `mesa_bandeja`, `carencia_hasta`, `mesa_id`, `fecha_trasplante` ni las aplicaciones químicas de la bandeja

**Checkpoint**: US1 y US3 entregadas y usables por sí solas.

### Notas de implementación

**T014/T015 — el util devuelve `null`, no un `now()`.** `resolveFechaDia()` devuelve `null` para "usar el momento actual" en vez de resolverlo, porque *now()* no se escribe igual en los dos llamadores: en el `save()` de TypeORM de `fecha_entrada_nursery` es la función `() => 'now()'` que el ORM interpreta como SQL crudo, y en el SQL parametrizado del descarte es un `COALESCE($5::timestamptz, now())`. Un util que devolviera una `Date` de JS habría metido el reloj del proceso Node donde antes estaba el de la base. `siembra.service.ts` conserva su comportamiento exacto detrás de `resolveFechaEntradaNursery()`; las 69 pruebas siguen en verde.

**T017 — tres sentencias, costo independiente de la cantidad de bandejas.** El `SELECT … FOR UPDATE OF b` bloquea sólo `bandejas`: el join a `siembras` está para leer su fecha, no hay razón para bloquear la siembra entera. El `INSERT … SELECT` toma `estado_anterior` de la fila ya bloqueada y nunca del request, así que no hay ventana entre leer el estado y guardarlo. El `UPDATE` final lleva `AND estado <> 'descartada'` como defensa en profundidad y **se lee destructurando la tupla**, aplicando la moraleja de T001:

```ts
const [actualizadas] = (await qr.query(`UPDATE … RETURNING id`, …)) as [Array<{ id: string }>, number];
```

Los tres `SELECT`/`INSERT` sí devuelven las filas directamente y no llevan destructuring.

**T020 — los días calendario salen de la base como texto.** `to_char(COALESCE(fecha_trasplante, fecha_entrada_nursery) AT TIME ZONE 'UTC', 'YYYY-MM-DD')` en vez de dejar que el driver parsee `timestamptz` y comparar `Date`s: así la comparación es entre strings `'YYYY-MM-DD'` —en ISO 8601 el orden lexicográfico coincide con el cronológico— y no depende de cómo el driver mapea cada tipo ni de la zona horaria del proceso. El `RETURNING fecha_descarte` del `INSERT` existe para que la respuesta y el evento de historial lleven el instante realmente persistido cuando lo resolvió `now()`.

**T022 — `fecha_hora` lleva la fecha del incidente, no la de la carga.** El spec no lo definía. Se eligió la fecha del descarte porque la línea de tiempo de la mesa tiene que mostrar *cuándo se perdió* la bandeja; cuándo se cargó el registro queda en `created_at`. Con un descarte retroactivo los dos valores difieren, que es justamente el caso que importa.

**T024 — apareció un bug preexistente que descarta todos los `extra` de auditoría.** `auditLogPayload()` desparrama `extra` en la raíz del objeto (`...(extra ?? {})`), pero `redactPayload()` del módulo de audit conserva únicamente una lista blanca de 8 claves, entre ellas un **`extra` anidado**. El resultado es que *ningún* `extra` del repo llega a `audit_logs`: cada fila guarda `"extra": null`. Se verificó contra filas ya existentes de `siembra_created` y `siembra_ingreso_nursery`, ambas sin su `siembraId`. Son ~30 call sites en `admin`, `establecimientos`, `lotes`, `lotes-quimicos`, `marcas`, `siembra` y demás.

Como T024 pide explícitamente que la auditoría lleve los ids y el motivo, el controller del descarte pasa el `extra` anidado además del que arma el util:

```ts
payload: { ...payload, extra: detalle },
```

**El arreglo de fondo es una línea en `auditLogPayload()`** (anidar `extra` en vez de desparramarlo), pero cambia la forma de los registros de auditoría de todo el repo y de las líneas de log `admin_audit`, así que no se hizo dentro de esta feature: queda anotado para decidirlo aparte.

**T025 — 94 aserciones, todas en verde.** Escenario armado por API contra la base local: una siembra con fecha `2026-09-01` para poder probar el retroactivo válido, más las bandejas ya existentes en `en_nursery` y `trasplantada`.

| Caso | Resultado |
|---|---|
| Descarte desde `cooling_period`, `en_nursery` y `trasplantada` | 201, con el `estado_anterior` correcto en cada uno |
| Fecha retroactiva `2026-09-03` | persistida como `2026-09-03T12:00:00.000Z` |
| Sin fecha | resuelta con el `now()` de la base |
| Doble descarte | 409 `BANDEJA_YA_DESCARTADA` con `details.ids` |
| `motivo=otro` sin observaciones (y con observaciones en blanco) | 422 |
| Fecha futura / inexistente (`2026-02-30`) / anterior al ingreso a nursery | 422 `BANDEJA_DESCARTE_FECHA_INVALIDA` |
| Bandeja de otro tenant | 404 `BANDEJA_NOT_FOUND`, nunca 403 |
| Lote mixto con una ya descartada | 409, y la bandeja sana quedó intacta y sin constancia |
| Ids repetidos | 201 con `descartadas: 1` |
| 7 casos de `class-validator` | 400 |
| Consistencia final | 8 descartadas / 8 constancias, 0 huérfanas, 0 sin snapshot, 3 eventos de historial para 3 descartes de trasplantadas |

Dos correcciones al armado de las pruebas, no al código: la primera corrida asumía que se podía llegar a otro tenant mandando otro `x-tenant-id`, pero `jwt.strategy.ts:48` rechaza antes con 401 `Tenant mismatch` si el header no coincide con el token —el filtro de tenant del service se probó moviendo la fila de tenant y restaurándola—; y la tabla de auditoría es `audit_logs`, no `audit_admin`.

**T026 — comparación foto contra foto.** Antes y después del descarte de la bandeja trasplantada se compararon `mesa_id`, `fecha_trasplante`, `carencia_hasta`, `fecha_entrada_nursery`, `lote_semilla_id`, `lote_sustrato_id`, `siembra_id` y `codigo`, más las filas completas de `mesa_bandeja` y de `aplicacion_quimica_bandeja`. Idénticas. El único cambio aguas afuera es el evento nuevo en `historial_mesa`, que es el esperado.


---

## Phase 3: Lecturas (US2 + US4)

**Goal**: llegar a la bandeja desde la mesa o la siembra, y analizar las mermas.

**Independent Test**: listar las bandejas de una mesa, elegir una y descartarla; después filtrar las pérdidas por motivo y por rango de fechas.

- [x] T027 [US2] Agregar `mesa_id` (`@IsOptional`, `@IsUUID`) a `src/modules/siembra/dto/query-bandejas.dto.ts` y `'mesa_id'` a `filterAllowed` en `bandeja.service.ts`
- [x] T028 [US2] **Commit propio**: quitar el default `estado ?? BandejaEstado.EN_NURSERY` de `listBandejas`. Sin filtro devuelve todo menos `descartada`; `estado=descartada` las devuelve. Ver decisión 4 de [plan.md](./plan.md)
- [x] T029 [US2] Agregar `id` como desempate en el orden de `listBandejas` (`sortFallback` y orden secundario), para que la paginación deje de ser inestable cuando varias filas comparten `created_at`
- [x] T030 [US2] Documentar el cambio de default en `docs/`: los consumidores que hoy no mandan `estado` deben pasar `estado=en_nursery` explícito. Actualizar también `postman/siembra.postman_collection.json`
- [x] T031 [P] [US2] Agregar `descarte` (objeto reducido o `null`) al listado y a `getBandeja` con LEFT JOIN a `bandeja_descartes`
- [x] T032 [P] [US4] Crear `src/modules/siembra/dto/query-descartes.dto.ts` extendiendo `PageQueryDto`: `establecimiento_id`, `siembra_id`, `motivo`, `estado_anterior`, `fecha_desde`, `fecha_hasta`, `sortBy`, `sortOrder`
- [x] T033 [US4] Implementar `BandejaService.listDescartes` con `page()`, scope de tenant, `fecha_hasta` inclusive hasta el final del día, y `bandeja_id` como desempate del orden
- [x] T034 [US4] Agregar `@Get('descartes')` a `bandeja.controller.ts`, **declarado antes de `@Get(':id')`**, resolviendo el usuario con `buildUsuariosMap` / `resolveUsuarioResumen`
- [x] T035 `npm run build` y verificación funcional: `GET /bandejas?mesa_id=…` devuelve las bandejas de la mesa; `?estado=descartada` devuelve solo las perdidas; sin filtro no aparecen descartadas; los 4 filtros de `/bandejas/descartes` acotan bien; paginación estable entre páginas

**Checkpoint**: US2 y US4 entregadas.

### Notas de implementación

**T029 — el desempate no podía ir en `customizeQb`.** `applySort()` de `query-utils.ts` llama a `qb.orderBy(...)`, que **resetea** todo el ORDER BY acumulado; `customizeQb` corre antes, así que cualquier `addOrderBy` puesto ahí se perdía. Se agregó una opción `sortTiebreak` a `CrudListOptions` que `BaseCrudTenantService.list()` aplica como `addOrderBy` justo después de `applySort`. Sin la opción el comportamiento no cambia, así que los otros módulos quedan intactos.

El caso vale la pena: las bandejas de una siembra se crean en el mismo `INSERT` y comparten `created_at` —el orden por default— al microsegundo. En la base local hay 6 grupos de bandejas empatadas dentro de `en_nursery`, o sea que la paginación del caso más común era justamente la inestable.

**T030 — es un breaking change y se documentó como tal.** `GET /bandejas` sin `estado` devolvía sólo `en_nursery`; ahora devuelve todo menos `descartada`. `docs/siembra-frontend.md` lleva una sección `BREAKING` con la tabla de migración (quien quiera el comportamiento viejo manda `estado=en_nursery` explícito). Los dos handoffs históricos —`handoff-frontend-lote-vermiculita.md` y `handoff-frontend-tenant-pruebas.md`— no se reescribieron: llevan una nota 🕐 arriba del párrafo que quedó viejo, para que sigan sirviendo como registro de lo que se dijo en su momento.

**T031 — consulta en lote, no el LEFT JOIN que pedía la tarea.** `BaseCrudTenantService.list()` termina en `getManyAndCount()`, que descarta las columnas crudas de un join a una tabla sin relación declarada: el `descarte` nunca habría llegado a la respuesta. Se resolvió con una segunda consulta en lote sobre los ids de la página, **filtrando primero por `estado === 'descartada'`**. Como el listado por default excluye las descartadas, el caso normal no paga ninguna consulta extra: el array de ids queda vacío y la función corta antes de tocar la base.

El detalle (`GET /bandejas/:id`) sí trae el objeto completo con `observaciones` y `usuario`; el listado trae sólo `motivo`, `fecha_descarte` y `estado_anterior`. Una lista de bandejas no necesita el texto libre ni resolver un usuario por fila.

**T033 — el rango de fechas se compara como texto, igual que en la Fase 2.** `to_char(d.fecha_descarte AT TIME ZONE 'UTC', 'YYYY-MM-DD')` contra los strings del request. Con esto `fecha_hasta` es inclusivo hasta el final del día sin sumar intervalos, y el resultado no depende de la zona horaria de la sesión. `fecha_desde=2026-09-03&fecha_hasta=2026-09-03` devuelve el día entero, que era el caso a cuidar.

El join a `bandejas` es por nombre de tabla (`.innerJoin('bandejas', 'b', 'b.id = d.bandeja_id')`) porque `BandejaDescarte` no declara la relación. **A propósito no filtra `b.deleted_at`**: una bandeja borrada lógicamente no debería desaparecer del reporte de mermas, que es justamente el registro de lo que se perdió.

En el DTO, `estado_anterior` acepta los tres estados vivos y **rechaza `descartada`**: no existe ni puede existir una constancia con ese valor. Las fechas se validan sólo de formato (`@Matches(/^\d{4}-\d{2}-\d{2}$/)`), sin verificar que el día exista: un borde de reporte mal escrito acota de más y no persiste nada, a diferencia de la fecha de un descarte, que sí valida el calendario.

**T034 — el usuario se resuelve en el service, no en el controller.** La tarea decía controller, pero los 18 llamadores de `buildUsuariosMap` del repo (aplicaciones-químicas, cosecha, mesas, packing, siembra, tareas, trasplante) lo hacen en el service, sin excepción. Se siguió la convención existente. El controller sólo pagina.

El orden de rutas se verificó en el log de arranque, no por razonamiento: `{/bandejas, GET}` → `{/bandejas/descartes, GET}` → `{/bandejas/descartar, POST}` → `{/bandejas/:id, GET}`.

**T035 — 121 aserciones, todas en verde.** Escenario armado por API: una siembra nueva con 6 bandejas trasplantadas a una mesa propia, sobre las 26 bandejas y 8 descartes que ya había en la base local.

| Caso | Resultado |
|---|---|
| `?mesa_id=M` | las 6 de la mesa, ninguna ajena; mesa inexistente → 0; no-uuid → 400 |
| Sin filtro de estado | 24 de 32, ninguna `descartada`, varios estados vivos |
| `?estado=descartada` | las 8 perdidas, todas con su `descarte` |
| Las dos vistas | suman el universo sin solaparse |
| `?estado=en_nursery` explícito | sigue dando lo que daba el default viejo |
| Shape del `descarte` | 3 campos en el listado, 5 (con `observaciones` y `usuario`) en el detalle |
| Paginación de bandejas y de descartes | `limit=3` de punta a punta: sin repetidos, sin faltantes, dos corridas idénticas |
| Los 6 filtros de `/bandejas/descartes` | cada uno contrastado contra la misma pregunta hecha en SQL |
| Rango de un solo día | `desde=hasta=2026-09-03` devuelve ese día completo |
| Orden | default `fecha_descarte DESC` + `bandeja_id ASC`; `sortOrder=ASC` invierte; `sortBy=created_at` acepta |
| 9 rechazos de `class-validator` | 400 (incluidos `estado_anterior=descartada`, `sortBy=motivo`, `limit=999`) |
| Aislamiento de tenant | el descarte movido de tenant desaparece del reporte y vuelve al restaurarlo |
| Escenario final | perdidas 2 de las 6 de la mesa: `?mesa_id=M` → 4, `?mesa_id=M&estado=descartada` → 2, el reporte creció en 2 con la mesa correcta, 2 eventos nuevos de historial, y volver a descartarlas da 409 |

Las expectativas se calculan leyendo la base, no hardcodeadas: el escenario comparte establecimiento con descartes previos, así que cualquier número fijo habría sido frágil.

Un empujón al armado que no es un bug del código: `POST /mesas` asigna `posicion_actual` sola, y `trasplante.service.ts:71-73` exige `en_cosecha` o (`activa` con `posicion_actual` en `NULL`). Se puso `posicion_actual = NULL` a la mesa del escenario directamente en la base. Es un estado normal en producción; simplemente no se llega a él por API sin pasar por el módulo de cosecha.


---

## Phase 4: Integridad aguas abajo (US5)

**Goal**: que la pérdida no borre historia ni rompa la trazabilidad ya emitida.

**Independent Test**: trasplantar, cosechar, descartar una bandeja de ese ciclo y comparar la trazabilidad antes y después: mismas bandejas, con el campo `descarte` como única diferencia.

- [x] T036 [US5] Agregar `descarte` (objeto reducido o `null`) a cada elemento de `bandejas_ciclo` en `src/modules/trazabilidad/trazabilidad.service.ts`, con LEFT JOIN a `bandeja_descartes`, sin tocar la reconstrucción del ciclo desde `mesa_bandeja`
- [x] T037 [US5] Extender el `count` de bloqueo de `deleteSiembra` en `siembra.service.ts` para contar también `descartada` y lanzar `SIEMBRA_HAS_DESCARTADAS` 409; sumar el filtro `tenant_id` que falta (Principio II, ver "Deuda técnica anotada" en [plan.md](./plan.md))
- [x] T038 `npm run build` y verificación funcional: guardar la respuesta de trazabilidad de una cosecha, descartar una bandeja de ese ciclo, y comparar: mismas bandejas, `descarte` como única diferencia
- [x] T039 [US5] Verificar que `DELETE /lotes/:id` sigue bloqueado por una bandeja descartada (`LOTE_REFERENCED_BY_BANDEJA`, sin cambios de código) y que `DELETE /siembras/:id` devuelve 409

**Checkpoint**: US5 entregada. Las 5 user stories completas.

### Notas de implementación

**T036 — acá el LEFT JOIN sí era viable.** Al revés que en T031: la consulta del ciclo es SQL crudo (`dataSource.query`), no pasa por `getManyAndCount()`, así que las columnas del join llegan enteras. Se sumaron tres columnas y un `LEFT JOIN bandeja_descartes bd ON bd.bandeja_id = b.id AND bd.tenant_id = $3`. **`bandeja_id` es la PK de `bandeja_descartes`**, así que el join no puede multiplicar las filas del ciclo — que era el único riesgo real de tocar esa consulta.

`DescarteResumen` se declaró local al archivo en vez de importarlo de `bandeja.service.ts`. Es la convención del módulo: `UsuarioResumen`, `ProductoResumen` y compañía también están duplicados ahí. La forma es idéntica a la de `GET /bandejas`, que es lo que importa para el consumidor.

`getTrazabilidadByMesa` no se tocó: devuelve cosechas, no `bandejas_ciclo`.

**T037 — el `tenant_id` que faltaba es defensa en profundidad, no una fuga.** La siembra ya se validó contra el tenant veinte líneas antes, así que sus bandejas no pueden ser de otro. Se agregó igual, con el porqué escrito al lado: un `count` que decide si se borra o no no debería depender de esa cadena de razonamiento (Principio II).

Lo que sí es un agujero real es lo otro: sin la guarda nueva, borrar una siembra le ponía `deleted_at` a sus bandejas descartadas y dejaba las constancias de merma apuntando a filas borradas. Como `listDescartes` a propósito no filtra `deleted_at`, el reporte habría seguido mostrando pérdidas cuya bandeja ya no existía.

Las dos cuentas van en un `Promise.all`, y **`SIEMBRA_HAS_TRASPLANTADAS` se evalúa primero**: una siembra que tiene las dos cosas sigue devolviendo el mismo error que antes de esta feature.

**T038/T039 — 41 aserciones, todas en verde.** El ciclo entero se armó por API sin ningún empujón a la base: la mesa quedó `activa` con `posicion_actual = 2` después del trasplante de T035, que es justo lo que `POST /cosecha` exige.

| Caso | Resultado |
|---|---|
| Trazabilidad antes del descarte | las 6 bandejas del ciclo, 2 con `descarte` y 4 en `null`, contrastadas contra la base |
| Shape de `descarte` | idéntico al de `GET /bandejas` |
| Después de descartar una del ciclo | las mismas 6 bandejas, ninguna desapareció |
| Diff fila por fila | la única fila que cambió es la descartada |
| Diff campo por campo | sólo cambiaron `estado` y `descarte` |
| Linaje de la bandeja perdida | `fecha_trasplante`, `siembra_id`, los tres lotes, `carencia_hasta` y el objeto `siembra` entero: idénticos |
| Resto de la respuesta | cosecha, mesa, packing, aplicaciones y `alerta_carencia_incumplida`: idénticos |
| `DELETE /siembras/:id` con descartadas y sin trasplantadas | 409 `SIEMBRA_HAS_DESCARTADAS`, y ninguna bandeja quedó con `deleted_at` |
| `DELETE /siembras/:id` con las dos cosas | 409 `SIEMBRA_HAS_TRASPLANTADAS` (precedencia previa intacta) |
| `DELETE /siembras/:id` sin bandejas bloqueantes | se borra: la guarda no bloquea de más |
| `DELETE /lotes/:id` de una bandeja perdida | 409 `LOTE_REFERENCED_BY_BANDEJA`, sin cambios de código |

El caso de control —la siembra que **sí** se borra— es el que hace que los tres 409 signifiquen algo: sin él, una guarda que rechazara todo habría pasado igual.

Dos correcciones al armado, ninguna al código: la ruta es `POST /cosecha` en singular, y la respuesta anida la entidad en `data.cosecha`. Las expectativas del script se calculan leyendo la base y la cosecha se reutiliza si ya existe, porque cosechar deja la mesa en `en_cosecha` sin posición y un segundo `POST` fallaría.


---

## Phase 5: Entregables de soporte

- [x] T040 [P] Escribir `docs/bandejas-descarte-frontend.md` siguiendo el formato de `docs/tareas-frontend.md`: endpoints, shapes, tabla de errores, el cambio de default de `estado`, y el flujo de pantalla para elegir la bandeja desde la mesa
- [x] T041 [P] Crear `postman/bandejas-descarte.postman_collection.json` con el camino feliz y los 6 rechazos: doble descarte, fecha futura, fecha anterior al último hecho, `motivo=otro` sin observaciones, tenant ajeno, y trasplante de una bandeja descartada
- [x] T042 Repasar el spec: confirmar FR-001…FR-023 y SC-001…SC-008 uno por uno contra el comportamiento real

### Notas de implementación

**T040/T041 — el handoff se escribió con los contratos ya quietos.** `docs/bandejas-descarte-frontend.md` sigue el formato de `docs/tareas-frontend.md`, y la colección de Postman cubre el camino feliz más los seis rechazos. El único punto que hubo que documentar con letra grande es el cambio de default de `estado` en `GET /bandejas`: una pantalla que hoy lista bandejas empieza a ver una fila menos por cada pérdida y no se entera, salvo que pida `estado=descartada` a propósito.

**T042 — 88 verificaciones, todas en verde, y ninguna corrección al código.** El repaso no se hizo leyendo: se armó un recorrido que levanta sus propios datos (siembras, mesas, trasplantes y un lote de 200 bandejas) y le entrega a cada verificación bandejas nuevas. Sin eso, la mitad de las aserciones habría dado verde porque la bandeja ya estaba descartada, no porque el código funcione. Corrió dos veces seguidas con el mismo resultado.

Hicieron falta datos que la base local no tenía: la matriz de roles (FR-001, FR-023) y el aislamiento entre clientes (FR-020, SC-007) son inverificables con el único admin local, que es `admin` **y** `admin_global` a la vez y por lo tanto siempre pasa. Se crearon un usuario por rol, un `admin` a secas como control negativo —tiene que recibir 403— y un cliente B completo con su propia cadena de establecimiento, lotes y siembra, para probar el aislamiento en las dos direcciones.

**Todas las discrepancias que aparecieron eran del script, no de la API.** Vale anotar las que el frontend se va a comer igual:

| Trampa | Qué pasa de verdad |
|---|---|
| `meta` de paginación | viaja **al lado** de `data`, no adentro: `{ ok, data: [...], meta: {...} }` |
| Dos formas de listado | `/bandejas` y `/bandejas/descartes` paginan; `/lotes`, `/tuneles` y `/establecimientos` devuelven `data` como arreglo pelado |
| `POST /cosecha` | devuelve `{ cosecha, mesa_id, tunel_id, posicion_recalculada }`, no la cosecha pelada |
| UUID inexistente | tiene que ser **v4 bien formado** para llegar al 404; uno mal formado lo corta `@IsUUID('4')` con un 400 genérico |
| `historial_mesa` | la columna es `detalle` (jsonb), no `payload` |

**La guarda de la mesa tapa a la de la bandeja.** SC-002 pide probar que una bandeja descartada no se puede trasplantar, pero una mesa que ya recibió bandejas deja de ser trasplantable: reusar la mesa del fixture devuelve `TRASPLANTE_MESA_ESTADO_INVALIDO` sin haber mirado nunca la bandeja. Cada intento necesita una mesa recién creada —y creada, dada de baja y reactivada, porque una mesa nace con posición en el túnel y tampoco es trasplantable así.

**SC-006 no se puede medir con `pg_stat_user_tables`.** El criterio pide que la cantidad de *consultas* no dependa de la cantidad de bandejas, y los contadores de scans no responden esa pregunta: el chequeo de clave foránea de cada fila insertada cuenta como un index scan, así que el contador crece con las filas aunque la app haya mandado una sola consulta. Medido: **5 accesos para 1 bandeja y 223 para 199**, que parece un fracaso y no lo es. (De paso: esos contadores tardan ~3 s en publicarse; muestreados al instante dan 0 y el check pasa por vacío.)

La medición que sí sirve es contar sentencias: `log_statement = 'all'` con `pg_reload_conf()`, marcas en el log alrededor de cada operación, y `pg_read_binary_file` para leer el tramo. El resultado es el que el criterio pide:

| Operación | Sentencias |
|---|---|
| Descartar 1 bandeja | 10 |
| Descartar 199 bandejas | 10 |

Son las mismas nueve más la marca: `START TRANSACTION`, el `SELECT` del usuario, el `SELECT` de las bandejas, el `INSERT` a `bandeja_descartes`, el `UPDATE` de `bandejas`, `COMMIT`, y después la transacción propia de la auditoría. 199 bandejas se resuelven en 51 ms.

Las dos anotaciones que quedaron no son fallas: el desglose por motivo y etapa del período (que muestra que SC-008 se puede agrupar sin volver a pedir) y el tiempo del lote de 199.

---

## Dependencias

```
Phase 0 (rama aparte, merge a main)
   └─> Phase 1 (esquema)
         ├─> Phase 2 (US1+US3)  ── MVP entregable
         │     └─> Phase 3 (US2+US4)   [T031 necesita bandeja_descartes con datos]
         │           └─> Phase 4 (US5)
         └─────────────────────────────> Phase 5 (docs y Postman, al final)
```

- **T014/T015** (util de fechas) puede hacerse durante la Fase 1 si conviene: no depende del esquema.
- **T027/T028/T029** (filtros y default de `listBandejas`) no dependen del descarte y podrían adelantarse; se dejan en la Fase 3 para que el commit del cambio de default viaje junto a su documentación.
- Las tareas marcadas **[P]** dentro de una misma fase tocan archivos distintos.

## Orden sugerido de entrega

1. **Phase 0** → merge a `main`. Arregla un bug vivo hoy, entra en el próximo deploy sin esperar al descarte.
2. **Phase 1 + 2** → MVP. Ya se puede registrar la pérdida de una bandeja, que es el pedido original.
3. **Phase 3** → hace el MVP usable en el campo (llegar a la bandeja desde la mesa).
4. **Phase 4 + 5** → cierra la integridad y deja el handoff al frontend.
