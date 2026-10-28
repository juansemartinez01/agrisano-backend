# Implementation Plan: Tiempo de ejecución de la aplicación química

**Branch**: `027-tiempo-aplicacion-quimica` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-tiempo-aplicacion-quimica/spec.md`

## Summary

Cada aplicación química (nursery y greenhouse) pasa a guardar `fecha_hora_inicio` y
`fecha_hora_fin`. La columna existente `fecha_hora` **se conserva y es siempre igual a
`fecha_hora_fin`** (garantizado con un CHECK en base), de modo que carencia, trazabilidad,
orden, filtros e historial siguen anclados a una sola columna y no hay que tocar sus
consultas. Un único helper puro calcula y valida el par inicio/fin en los 4 puntos de
escritura (POST, PATCH fila, PATCH grupo-update, PATCH grupo-create). La duración
(`duracion_segundos`) se calcula al leer, nunca se guarda. Las filas viejas quedan con
NULL. De paso se unifica el cálculo de `carencia_hasta` en UTC en un solo util compartido.

## Technical Context

**Language/Version**: TypeScript (strict) sobre NestJS

**Primary Dependencies**: NestJS, TypeORM, class-validator / class-transformer

**Storage**: PostgreSQL (Railway). Migración nueva, aditiva (ADD COLUMN nullable + CHECK)

**Testing**: Jest (`npm test`, specs unitarios junto al código, como `dosis.validator.spec.ts`
y `dosis-precision.dto.spec.ts`); verificación manual con la base local descartable (ver
[quickstart.md](./quickstart.md)). No existen tests de servicio de aplicaciones-quimicas hoy.

**Target Platform**: API REST en Railway (contenedor Linux; migraciones corren al arrancar)

**Project Type**: web-service (backend NestJS modular)

**Performance Goals**: sin cambio; no se agregan índices (el orden por defecto sigue usando
`fecha_hora`). `sortBy=fecha_hora_inicio` sin índice es aceptable al volumen actual.

**Constraints**: breaking change controlado (inicio obligatorio en POST; `fecha_hora` deja de
aceptarse en PATCH) → deploy coordinado con el frontend; ningún rechazo de validación puede
dejar efectos (stock, carencia, historial); filas viejas intactas.

**Scale/Scope**: ~10 archivos de `src/`, 1 migración, 1 util común nuevo + 1 validador común
nuevo, 2 docs. Aplicaciones masivas: hasta 200 targets por request y 50 items por PATCH de grupo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|-----------|------------|
| I. Template First | Se reutiliza la infraestructura existente (`ValidateBy` como `IsDosis`, `AppError`, util de `src/common/utils`). Sin duplicar lógica: el cálculo de carencia pasa a un util común usado por ambos módulos. ✅ |
| II. Multi-Tenancy | Sin entidades nuevas; todas las consultas tocadas ya filtran por `tenant_id`. La herencia de inicio/fin dentro de un grupo se consulta con `tenant_id`. ✅ |
| III. Error Handling | Dos códigos nuevos en `ErrorCodes`: `APLICACION_HORARIO_INVALIDO` y `APLICACION_DURACION_EXCESIVA` (422, como `SIEMBRA_FECHA_ENTRADA_INVALIDA`). Formato inválido → 400 por class-validator. Nada de `throw new Error()`. ✅ |
| IV. Audit | Create/PATCH siguen escribiendo `writeAudit`; el before/after incluye inicio y fin. ✅ |
| V. Roles | Sin cambios: POST operario/supervisor/admin_global; PATCH supervisor/admin_global. ✅ |
| VI. Transacciones | Los 4 puntos de escritura ya están dentro de transacción; la validación del par ocurre **antes** de abrir la transacción (un rechazo no toca la base) y el UPDATE usa el mismo `qr`. ✅ |
| VII. API Responses | Sin endpoints nuevos; los existentes siguen usando `ok()`/`page()`. ✅ |
| VIII. Code Quality | Sin `any`; DTOs con class-validator; JSDoc en el helper y el validador. ✅ |
| IX. Modules | El helper de horarios vive en el módulo `aplicaciones-quimicas`; lo compartido con `trazabilidad` (cálculo de carencia) va a `src/common/utils`. Sin imports cruzados entre módulos. ✅ |
| X. Small Steps | Una sola feature, un solo módulo principal, entregable en fases independientes (ver tasks). ✅ |

Re-check post-diseño: sin violaciones; Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/027-tiempo-aplicacion-quimica/
├── plan.md                 # Este archivo
├── research.md            # Decisiones y alternativas descartadas
├── data-model.md          # Columnas, CHECKs, reglas de validación, transiciones
├── quickstart.md          # Verificación manual de punta a punta
├── contracts/
│   └── api-changes.md     # Cambios de contrato HTTP (request/response/errores)
├── checklists/
│   └── requirements.md
└── tasks.md               # Lo genera /speckit-tasks
```

### Source Code (repository root)

```text
migrations/
└── 1775200000000-AplicacionQuimicaInicioFin.ts        # NUEVO: 2 columnas + 3 CHECKs

src/common/
├── errors/error-codes.ts                               # + APLICACION_HORARIO_INVALIDO, APLICACION_DURACION_EXCESIVA
├── validators/
│   ├── fecha-hora-con-zona.validator.ts                # NUEVO: @IsFechaHoraConZona() (+ .spec.ts)
└── utils/
    └── carencia.util.ts                                # NUEVO: calcularCarenciaHasta() en UTC (+ .spec.ts)

src/modules/aplicaciones-quimicas/
├── entities/aplicacion-quimica.entity.ts               # + fecha_hora_inicio, fecha_hora_fin
├── utils/
│   └── tiempo-aplicacion.util.ts                       # NUEVO: resolver/validar par, duración (+ .spec.ts)
├── dto/
│   ├── create-aplicacion.dto.ts                        # + fecha_hora_inicio (req), fecha_hora_fin (opt)
│   ├── update-aplicacion.dto.ts                        # fecha_hora → fecha_hora_inicio/fecha_hora_fin
│   ├── update-operation-group.dto.ts                   # idem, a nivel grupo
│   ├── query-aplicaciones.dto.ts                       # sortBy admite fecha_hora_inicio
│   └── tiempo-aplicacion.dto.spec.ts                   # NUEVO: DTOs aceptan/rechazan formatos
├── types/aplicacion-enriched.types.ts                  # + fecha_hora_inicio/fin, duracion_segundos
├── aplicaciones-quimicas.controller.ts                 # whitelists de PATCH (fila y grupo)
└── aplicaciones-quimicas.service.ts                    # helper en 4 puntos de escritura + lecturas + carencia + historial

src/modules/trazabilidad/
├── trazabilidad.service.ts                             # SELECT + mapAplicacionRow + usar carencia.util
└── trazabilidad.service.spec.ts                        # ajustar/ampliar casos de aplicaciones

docs/
├── aplicaciones-quimicas-frontend.md                   # actualizar contrato
└── handoff-frontend-tiempo-aplicacion.md               # NUEVO: breaking changes para el front
```

**Structure Decision**: se mantiene la estructura modular existente. El helper de horarios es
específico de aplicaciones químicas (vive en el módulo); el validador de fecha-hora con zona y
el cálculo de carencia son transversales (van a `src/common`), igual que `dosis.validator.ts` y
`fecha-dia.util.ts`.

## Design Overview

### 1. Datos (ver [data-model.md](./data-model.md))
- `fecha_hora_inicio timestamptz NULL`, `fecha_hora_fin timestamptz NULL`.
- CHECK `fecha_hora_fin IS NULL OR fecha_hora_fin = fecha_hora` (FR-022).
- CHECK `(fecha_hora_inicio IS NULL) = (fecha_hora_fin IS NULL)` (ambos o ninguno).
- CHECK `fecha_hora_inicio IS NULL OR fecha_hora_inicio <= fecha_hora_fin`.
- Sin backfill, sin índice. `down` borra los CHECKs y las columnas.

### 2. Helper único de horarios (`tiempo-aplicacion.util.ts`)
Funciones puras (sin acceso a base), testeables con `ahora` inyectado:

- `resolverTiempoAplicacion({ inicio?, fin?, ahora, actual? })` → `{ inicio: Date; fin: Date }`
  - Creación: `inicio` obligatorio; `fin ?? ahora`.
  - Corrección: parte de `actual` (inicio/fin guardados) y pisa con lo enviado. Si `actual`
    no tiene horarios (fila vieja) y no llegan ambos → `APLICACION_HORARIO_INVALIDO`.
  - Reglas en este orden: `inicio <= fin`; `fin <= ahora + 5 min` **solo si `fin` fue enviado
    o es creación**; `fin - inicio <= 24 h`.
- `duracionSegundos(inicio, fin)` → `number | null` (null si falta alguno).
- Constantes `TOLERANCIA_FUTURO_MS = 5 min`, `DURACION_MAXIMA_MS = 24 h`.
- Lanza `AppError` 422: `APLICACION_HORARIO_INVALIDO` (orden / futuro / falta extremo) y
  `APLICACION_DURACION_EXCESIVA`.

### 3. Validador de formato (`@IsFechaHoraConZona`)
Acepta solo ISO-8601 con fecha + hora + zona (`Z` u offset `±HH:MM`). Rechaza fecha sola y
hora sin zona (donde `@IsISO8601()` los deja pasar). DTOs lo usan en lugar de `@IsISO8601()`.

### 4. Puntos de escritura (todos en `aplicaciones-quimicas.service.ts`)
1. **`createAplicacion`**: resolver par antes de abrir la transacción; `fecha_hora = fin`,
   `fecha_hora_inicio`, `fecha_hora_fin` en el insert; eventos de historial con
   `fecha = fin` y `detalle.{fecha_hora_inicio, fecha_hora_fin}`.
2. **`updateAplicacion`**: si llegan inicio y/o fin, resolver contra los guardados; el UPDATE
   crudo escribe `fecha_hora`, `fecha_hora_inicio`, `fecha_hora_fin` juntos; cualquier cambio
   de inicio o fin marca `tocaCarencia`.
3. **`updateOperationGroup` (items `update`)**: el par resuelto a nivel grupo se aplica a toda
   fila `update` (y a las filas existentes del grupo si se envió a nivel grupo).
4. **`updateOperationGroup` (items `create`)**: usan el par de nivel grupo si vino; si no,
   heredan de la primera fila del grupo con horarios (orden `created_at, id`); si el grupo
   no tiene ninguna fila con horarios → `APLICACION_HORARIO_INVALIDO`.

### 5. Lecturas
- `listAplicaciones`, `getAplicacionById`, `getAplicacionesByMesa`, `getAplicacionesByBandeja`:
  agregan `fecha_hora_inicio`, `fecha_hora_fin`, `duracion_segundos` (vía `duracionSegundos`).
- `SORT_ALLOWED` incorpora `fecha_hora_inicio` (con `NULLS LAST`). Filtros `fecha_desde/hasta`
  y orden por defecto siguen sobre `fecha_hora` (= fin).
- `trazabilidad.service.ts`: `APLICACION_SELECT` y `mapAplicacionRow` suman los tres campos.

### 6. Carencia (FR-014..016)
- `carencia.util.ts#calcularCarenciaHasta(fin, dias)` → `YYYY-MM-DD` con `setUTCDate`.
- `recomputeCarenciaHastaBatch` y `trazabilidad.computeCarenciaHasta` pasan a usarlo.
- Como `fecha_hora = fin`, las consultas de carencia existentes ya leen el fin; el cambio es
  solo el cálculo UTC unificado.

### 7. Controller
- `ALLOWED` de PATCH fila: se quita `fecha_hora`, se agregan `fecha_hora_inicio`,
  `fecha_hora_fin`. Idem PATCH grupo. Mensajes de error actualizados.

### 8. Documentación
- Actualizar `docs/aplicaciones-quimicas-frontend.md`; crear
  `docs/handoff-frontend-tiempo-aplicacion.md` (qué cambia, ejemplos, errores, orden de deploy).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Front viejo recibe 400 al crear (falta inicio) | Deploy coordinado; handoff documentado; es decisión aceptada (spec, Assumptions) |
| Front viejo manda `fecha_hora` en PATCH → rechazo | Idem; mensaje de error explícito indicando los campos nuevos |
| Drift entre `fecha_hora` y `fecha_hora_fin` | Un solo helper + CHECK en base (la base lo impide aunque falle el código) |
| Cambio de día de carencia por UTC vs local | Util único UTC; producción corre en UTC (verificar en el quickstart); documentado en research |
| Migración en prod | ADD COLUMN nullable + CHECK sobre filas con NULL: instantáneo, sin reescritura. Corre al arrancar, como 024/025; verificar registro en tabla `migrations` |
| Sin tests de servicio previos | Lógica crítica aislada en funciones puras con specs; escenarios de servicio cubiertos por el quickstart |
| Grupo con filas viejas sin horarios | Regla explícita: exigir inicio/fin a nivel grupo (error claro) |

## Complexity Tracking

Sin violaciones de la constitución; no aplica.
