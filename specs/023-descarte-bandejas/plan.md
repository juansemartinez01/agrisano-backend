# Implementation Plan: Descarte de bandejas (registro de pérdida)

**Branch**: `023-descarte-bandejas` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-descarte-bandejas/spec.md`

## Summary

Se agrega un estado terminal `descartada` a la bandeja y una tabla append-only `bandeja_descartes` con una fila como máximo por bandeja (PK = `bandeja_id`), que guarda motivo, observaciones, fecha del incidente, usuario responsable y el estado previo de la bandeja.

La operación de descarte es transaccional, masiva y basada en conjuntos: bloquea las bandejas con `SELECT ... FOR UPDATE`, inserta los descartes con un `INSERT ... SELECT` que toma `estado_anterior` de la propia fila bloqueada, y transiciona con un único `UPDATE ... WHERE id = ANY($1) AND estado <> 'descartada'`. Tres sentencias, sin importar si se descarta una bandeja o doscientas.

El descarte **no borra ni modifica historia**: no toca `mesa_bandeja`, ni las aplicaciones químicas, ni las cosechas, ni `carencia_hasta`. La trazabilidad de un ciclo sigue devolviendo la bandeja, ahora anotada como descartada. La constancia se logra agregando un hecho, nunca quitando uno.

## Prerrequisito: rama aparte con el fix de guardas de estado

Trasplante y aplicaciones químicas validan `estado === 'en_nursery'` **fuera** de la transacción y después escriben con `WHERE id AND tenant_id`, sin guarda de estado. Sin corregirlo, una bandeja recién descartada puede trasplantarse igual y FR-005 no se cumple.

Ese fix **no forma parte de esta feature**. Es un bug de corrupción de datos que ya está en producción hoy (dos trasplantes concurrentes de la misma bandeja pisan la misma fila y crean dos filas en `mesa_bandeja`), es independiente del descarte, y se verifica con las colecciones Postman de trasplante y aplicaciones que ya existen.

Va en una rama chica propia, mergeada a `main` **antes** de arrancar `023-descarte-bandejas`, para que no quede de rehén si el descarte se demora o se replantea.

- Alcance: `AND estado = 'en_nursery'` en el `WHERE` del `UPDATE` de ambos servicios, más el chequeo de `affected` para fallar con el código de error correspondiente. Mismo patrón que ya usa `ingresarNursery`.
- Efecto observable: un doble trasplante que hoy "funciona" en silencio pasa a devolver 422. Es el comportamiento correcto, pero es un cambio de comportamiento.

Esta feature **asume ese fix ya mergeado**.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, sin `any`), Node 20
**Primary Dependencies**: NestJS 11, TypeORM 0.3.28, class-validator, nestjs-pino
**Storage**: PostgreSQL (Railway), migraciones manuales numeradas
**Testing**: verificación funcional manual vía colección Postman + `npm run build`
**Target Platform**: API REST desplegada en Railway
**Project Type**: backend monolítico modular (NestJS)
**Performance Goals**: descarte de 200 bandejas en una operación, con cantidad de consultas constante (3) e independiente de la cantidad de bandejas
**Constraints**: multi-tenant estricto por `AsyncLocalStorage`; soft delete; sin dependencias entre módulos de feature; transición terminal garantizada por la base, no por lógica de aplicación
**Scale/Scope**: 2 endpoints nuevos, 2 migraciones, 1 entidad, 3 DTOs, 3 servicios tocados, 4 códigos de error nuevos (más una rama prerrequisito de 2 archivos)

## Constitution Check

| Principio | Cumplimiento |
|---|---|
| **I. Template First** | Se reutiliza `BaseCrudTenantService`, `BaseEntity`, `ok()`/`page()`, `AppError`/`ErrorCodes`, `AuditService`, y el patrón de snapshots de usuario (`fetchUsuarioSnapshot`, `resolveUsuarioResumen`). Los helpers de fecha-día hoy privados en `siembra.service.ts` se extraen a `src/common/utils/fecha-dia.util.ts` y los usan ambos servicios, en lugar de duplicarlos. |
| **II. Multi-Tenancy** | `bandeja_descartes` lleva `tenant_id` con índice. Toda lectura y escritura filtra por `tenant_id` obtenido de `requireTenantId()`. El listado de descartes usa `BaseCrudTenantService` con `strictTenant: true`. |
| **III. Error Handling** | 4 códigos nuevos en `ErrorCodes`; ningún `throw new Error()`. Los rechazos por conjunto informan los ids conflictivos en `details`. |
| **IV. Audit** | `AuditService.write('admin', {...})` desde el controller, con el `req` real (no un objeto sintético como hace `aplicaciones-quimicas`), acción `bandeja_descartada`, con ids alcanzados y motivo. |
| **V. Roles** | `@Roles('operario','supervisor','admin_global')` para registrar; lectura con los roles ya vigentes en `bandeja.controller.ts`. |
| **VI. Transactions** | Todo el descarte corre en un `QueryRunner` con `FOR UPDATE` sobre las bandejas afectadas. All-or-nothing. |
| **VII. API Responses** | `ok()` para el descarte y el detalle, `page()` para los listados. |
| **VIII. Code Quality** | Sin `any`; SQL parametrizado; sentencias por conjunto en lugar de bucles. |
| **IX. Modules** | Todo lo nuevo vive en `src/modules/siembra` (dueño de `Bandeja`). Los cambios en trazabilidad y en el enum de historial de mesas son locales a su propio módulo, sin importar servicios ajenos. |
| **X. Small Steps** | Ver "Fases" abajo: cada fase compila y es verificable por separado. |

Sin desvíos que registrar en Complexity Tracking.

## Decisiones de diseño

### 1. Tabla aparte en lugar de columnas en `bandejas`

`bandejas` es la tabla caliente del sistema: se lee en trasplante, aplicaciones químicas, trazabilidad y listados. Agregarle 7 columnas mutables que solo aplican a una minoría de filas repetiría el error de `carencia_hasta`.

Con `bandeja_descartes` y **PK sobre `bandeja_id`**, la irreversibilidad deja de ser una regla de aplicación y pasa a ser una garantía de la base: un segundo descarte de la misma bandeja es imposible aunque dos requests concurrentes atraviesen la validación a la vez. `bandejas.estado = 'descartada'` queda como dato derivado, para que los filtros y guardas existentes sigan funcionando sin joins.

### 2. `estado_anterior` se toma de la fila bloqueada, no del request

El `INSERT ... SELECT b.estado FROM bandejas b` lee el estado dentro de la misma transacción que ya tiene la fila bloqueada. No hay ventana entre leer el estado y guardarlo.

### 3. La migración del valor de enum va sola

Postgres no permite usar un valor de enum recién agregado dentro de la misma transacción que lo agregó, y TypeORM corre todas las migraciones pendientes en una sola transacción. Precedente en el repo: `1772200000000-BandejaCoolingPeriod.ts` agrega el valor y `1772200000001` lo usa. Se replica: `1774800000000` solo hace `ALTER TYPE "bandeja_estado" ADD VALUE 'descartada'`, y `1774800000001` crea el tipo de motivo y la tabla.

### 4. Filtro `mesa_id` y estado opcional en el listado de bandejas

Requisito directo de la User Story 2: el operario llega a la bandeja desde la mesa. Hoy `QueryBandejasDto` no tiene `mesa_id` y `filterAllowed` tampoco lo incluye.

Además `listBandejas` fuerza `estado ?? EN_NURSERY`. Eso hay que sacarlo, y no solo por el descarte: **con ese default, `GET /bandejas?mesa_id=X` devolvería 0 filas siempre**, porque las bandejas de una mesa están en `trasplantada`. El filtro nuevo sería inútil el día que se agrega.

El default tampoco tiene defensores. Ya generó dos advertencias en la documentación existente —`docs/handoff-frontend-tenant-pruebas.md` tiene una sección titulada "GET /bandejas sin filtro devuelve 0", y `docs/handoff-frontend-lote-vermiculita.md` un ⚠️ explícito— y todos los flujos documentados en `docs/siembra-frontend.md` mandan `estado` explícito. No se está rompiendo un contrato: se está sacando una trampa.

Pasa a filtro opcional real. Sin filtro se devuelve todo **menos** `descartada` (FR-017), y `estado=descartada` es la vía explícita para verlas. La asimetría es deliberada: ocultar un estado terminal por defecto es la misma convención que `deleted_at IS NULL` y no sorprende a nadie; filtrar a un solo estado *vivo* por defecto sí.

Va en su propio commit, anotado en `docs/`, para que quede rastreable como "se sacó el default de `estado`" y no como daño colateral del descarte.

Se aprovecha para agregar `id` como desempate en el orden, porque hoy la paginación es inestable cuando varias filas comparten `created_at`.

### 5. Fecha retroactiva

Mismo patrón que `fecha_entrada_nursery`: string `YYYY-MM-DD` validado con `@Matches`, rechazo de fechas inexistentes en el calendario y de fechas futuras, y almacenamiento al mediodía UTC para que el día calendario no se corra por zona horaria. Si no se envía fecha, o si es la de hoy, se usa `now()`.

Regla adicional propia del descarte: la fecha no puede ser anterior al último hecho conocido de la bandeja (`fecha_trasplante ?? fecha_entrada_nursery ?? siembra.fecha`). Se valida por conjunto dentro de la transacción y se informan los ids conflictivos.

## Project Structure

### Documentation

```
specs/023-descarte-bandejas/
├── spec.md
├── plan.md
├── data-model.md
└── contracts/
    └── bandejas-descarte-api.md
```

### Source Code

```
migrations/
├── 1774800000000-BandejaEstadoDescartada.ts          # NUEVO  ALTER TYPE ... ADD VALUE (sola)
└── 1774800000001-BandejaDescartesInit.ts             # NUEVO  tipo motivo + tabla + índices

src/common/
├── errors/error-codes.ts                             # + 4 códigos
└── utils/fecha-dia.util.ts                           # NUEVO  helpers extraídos de siembra.service

src/modules/siembra/
├── entities/bandeja.entity.ts                        # + BandejaEstado.DESCARTADA
├── entities/bandeja-descarte.entity.ts               # NUEVO
├── dto/descartar-bandejas.dto.ts                     # NUEVO
├── dto/query-descartes.dto.ts                        # NUEVO
├── dto/query-bandejas.dto.ts                         # + mesa_id
├── bandeja.service.ts                                # + descartarBandejas, listDescartes, descarte en getBandeja
├── bandeja.controller.ts                             # + POST /bandejas/descartar, GET /bandejas/descartes
├── siembra.service.ts                                # usa fecha-dia.util; deleteSiembra bloquea descartadas
└── siembra.module.ts                                 # + AuditModule, + repo BandejaDescarte

src/modules/trazabilidad/
└── trazabilidad.service.ts                           # + descarte en bandejas_ciclo

src/modules/mesas/
└── entities/historial-mesa.entity.ts                 # + BANDEJA_DESCARTADA

docs/bandejas-descarte-frontend.md                    # NUEVO
postman/bandejas-descarte.postman_collection.json     # NUEVO
```

**Structure Decision**: la feature vive en el módulo `siembra`, dueño de la entidad `Bandeja`. Nada de lo nuevo cruza fronteras de módulo (Principio IX); los dos archivos tocados fuera (trazabilidad, historial de mesas) son cambios acotados dentro de su propio módulo. Los archivos de trasplante y aplicaciones químicas ya no figuran acá: se corrigen en la rama prerrequisito.

## Fases

Cada fase deja el repo compilando. La rama prerrequisito con las guardas de estado ya está mergeada antes de la Fase 1.

**Fase 1 — Base de datos y modelo**
`1774800000000`, `1774800000001`, `BandejaEstado.DESCARTADA`, `bandeja-descarte.entity.ts`, `HistorialTipoEvento.BANDEJA_DESCARTADA`, 4 códigos de error. Verificable con `npm run migration:run` y `npm run build`.

**Fase 2 — Operación de descarte**
`fecha-dia.util.ts`, `descartar-bandejas.dto.ts`, `BandejaService.descartarBandejas`, `POST /bandejas/descartar`, auditoría, evento de historial de mesa. Entrega las User Stories 1 y 3 completas.

**Fase 3 — Lecturas**
`mesa_id` y estado opcional en `QueryBandejasDto`/`listBandejas` con desempate por `id` (commit propio, ver decisión 4), `descarte` en `getBandeja`, `query-descartes.dto.ts` y `GET /bandejas/descartes`. Entrega las User Stories 2 y 4.

**Fase 4 — Integridad aguas abajo**
`descarte` en `bandejas_ciclo` de trazabilidad y bloqueo de `deleteSiembra` con descartadas. Entrega la User Story 5.

**Fase 5 — Entregables de soporte**
`docs/bandejas-descarte-frontend.md` y colección Postman con los casos de rechazo (doble descarte, fecha futura, fecha anterior al último hecho, motivo `otro` sin observaciones, tenant ajeno, trasplante de descartada).

## Deuda técnica anotada, no incluida

`deleteSiembra` cuenta bandejas sin filtrar por `tenant_id`. **No es una fuga**: el `count` filtra por `siembra_id`, la siembra ya se trajo con scope de tenant vía `mustFindById`, y la FK `bandejas.siembra_id → siembras.id` garantiza que no puede alcanzar bandejas de otro cliente. Es cumplimiento del Principio II y defensa en profundidad, nada más.

Se corrige acá porque la Fase 4 ya modifica esa misma línea para sumar `SIEMBRA_HAS_DESCARTADAS` y el costo marginal es cero.

El mismo patrón aparece en [principios-activos.service.ts:78](../../src/modules/quimicos/principios-activos.service.ts), con la misma forma benigna (count de guarda scopeado por una FK que ya es tenant-scoped). **Queda anotado como limpieza aparte, no se toca en esta feature**: ensanchar el alcance para barrer todo el repo es cómo un descarte de bandejas termina siendo un PR de 40 archivos.

## Complexity Tracking

Sin desvíos a la constitución.
