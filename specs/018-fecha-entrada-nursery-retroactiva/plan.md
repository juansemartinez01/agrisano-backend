# Implementation Plan: Fecha de entrada a nursery retroactiva

**Branch**: `018-fecha-entrada-nursery-retroactiva` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-fecha-entrada-nursery-retroactiva/spec.md`

## Summary

`POST /siembras/:id/ingresar-nursery` —hoy sin body— pasa a aceptar un body opcional con `fecha_entrada` (`"YYYY-MM-DD"`). Si se omite, el comportamiento es idéntico al actual (`now()` de la base). Si se informa una fecha pasada, se persiste anclada a las **12:00 UTC** de ese día; si se informa el día de hoy, se usa `now()`. Dos validaciones duras (no futura, no anterior a `siembras.fecha`) responden 422 con el código nuevo `SIEMBRA_FECHA_ENTRADA_INVALIDA`. Se aprovecha la edición del UPDATE para agregarle los filtros `tenant_id` y `deleted_at IS NULL` que hoy le faltan. Sin migración, sin cambios en lectura.

## Technical Context

**Language/Version**: TypeScript 5, NestJS 10, Node 20

**Primary Dependencies**: class-validator (campo nuevo en DTO), TypeORM (UpdateQueryBuilder existente)

**Storage**: PostgreSQL — sin cambios de esquema (`bandejas.fecha_entrada_nursery` ya es `timestamptz NULL`)

**Testing**: `npx tsc --noEmit` + `npx eslint "src/modules/siembra/**/*.ts"` + verificación funcional contra el entorno de desarrollo (Railway) siguiendo `quickstart.md`

**Target Platform**: Backend NestJS (Docker Alpine)

**Project Type**: Web service — cambio aditivo de contrato de entrada en módulo existente

**Performance Goals**: Sin cambio. El UPDATE sigue siendo uno solo para toda la siembra; no se agregan queries (la validación reutiliza el `SELECT` de la siembra que ya se hacía, leyendo además su campo `fecha`).

**Constraints**: Cambio no breaking (campo opcional); TypeScript strict sin `any`; sin migración; comparación de fechas a nivel de día calendario; el proyecto no tiene infraestructura de zonas horarias

**Scale/Scope**: 4 archivos de código (`dto/ingresar-nursery.dto.ts` nuevo, `siembra.service.ts`, `siembra.controller.ts`, `error-codes.ts`), más docs y Postman

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Estado | Nota |
|-----------|--------|------|
| I. Template First — se reutilizan el ValidationPipe global, los decoradores de class-validator y el flujo existente del endpoint | ✅ | |
| II. Multi-Tenancy — la validación de la siembra ya filtra por tenant; además se **agrega** `tenant_id` al UPDATE de bandejas, que hoy no lo tiene | ✅ | Mejora neta |
| III. Error Handling — se usa `AppError` con un `ErrorCodes` nuevo (`SIEMBRA_FECHA_ENTRADA_INVALIDA`), nunca `throw new Error()` | ✅ | |
| IV. Audit — el audit existente (`INGRESO_NURSERY`) se mantiene y suma la fecha informada al payload | ✅ | |
| V. Roles — `@Roles('operario','supervisor','admin_global')` sin cambios | ✅ | |
| VI. Transactions — la transacción existente cubre el UPDATE; las validaciones ocurren antes de abrirla | ✅ | |
| VII. API Responses — sigue devolviendo `ok(...)` con el mismo shape | ✅ | |
| VIII. Code Quality — DTO tipado y validado, sin `any`; helper de fecha con tipos explícitos | ✅ | |
| IX. Modules — todo dentro de `src/modules/siembra` + una constante en `src/common/errors` | ✅ | |
| X. Small Steps — una regla nueva, verificable de punta a punta | ✅ | |

**Gate: PASS** (pre y post diseño).

## Project Structure

### Documentation (this feature)

```text
specs/018-fecha-entrada-nursery-retroactiva/
├── spec.md
├── plan.md              # este archivo
├── research.md          # decisiones técnicas (anclaje horario, formato, validaciones)
├── data-model.md        # entidades tocadas y transición de estado
├── quickstart.md        # verificación funcional
├── contracts/
│   └── ingresar-nursery.md
├── checklists/requirements.md
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── common/errors/
│   └── error-codes.ts                       # MODIFICAR: + SIEMBRA_FECHA_ENTRADA_INVALIDA
└── modules/siembra/
    ├── dto/
    │   └── ingresar-nursery.dto.ts          # NUEVO: fecha_entrada opcional
    ├── siembra.service.ts                   # MODIFICAR: validaciones + resolución del valor + hardening del UPDATE
    └── siembra.controller.ts                # MODIFICAR: @Body() + fecha en el payload de auditoría

docs/siembra-frontend.md                     # MODIFICAR: contrato del endpoint
postman/siembra.postman_collection.json      # MODIFICAR: body del POST ingresar-nursery
```

**Structure Decision**: proyecto único NestJS. El cambio vive en el módulo `siembra` ya existente; la única salida del módulo es la constante de error en `src/common/errors/error-codes.ts`, que es el registro compartido de códigos del proyecto (patrón vigente para todos los módulos).

## Diseño del cambio (exacto)

### 1. Código de error

`src/common/errors/error-codes.ts` suma `SIEMBRA_FECHA_ENTRADA_INVALIDA` junto a los demás `SIEMBRA_*`.

### 2. DTO nuevo

`src/modules/siembra/dto/ingresar-nursery.dto.ts`:

```ts
export class IngresarNurseryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha_entrada debe tener formato YYYY-MM-DD (solo día, sin hora)',
  })
  fecha_entrada?: string;
}
```

Se usa `@Matches` en lugar de `@IsDateString()` a propósito: el contrato es un **día calendario**, no un instante, y `@IsDateString()` aceptaría `"2026-07-20T10:00:00Z"`. La validez calendaria real (descartar `2026-02-31`) se verifica en el service — ver research D3.

### 3. Service — `ingresarNursery(id, dto?)`

Orden de operaciones (todo antes de abrir la transacción, salvo el UPDATE):

1. `findOne` de la siembra por `id` + `tenant_id` (**ya existe**); ahora se usa también su campo `fecha`.
2. Si `dto?.fecha_entrada` está presente:
   - **Validez calendaria**: reconstruir la fecha y comparar el round-trip; si no coincide → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`.
   - **Límite superior**: `fecha_entrada > hoyUTC` → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`.
   - **Límite inferior**: `fecha_entrada < siembra.fecha` → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`.
   - Las tres comparaciones son de strings `YYYY-MM-DD` (en ISO 8601 el orden lexicográfico coincide con el cronológico).
3. Resolver el valor a persistir:
   - sin fecha, o fecha == hoy → `() => 'now()'` (idéntico a hoy)
   - fecha pasada → `new Date(\`${fecha}T12:00:00.000Z\`)`
4. UPDATE con los filtros existentes **más** `tenant_id = :tenantId` y `deleted_at IS NULL`.
5. Se mantienen el 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING` cuando `affected === 0`, la transacción y el retorno `getSiembraWithBandejas(id)`.

### 4. Controller

`@Body() dto: IngresarNurseryDto` y `extra: { siembraId: id, fechaEntrada: dto.fecha_entrada ?? null }` en el payload de auditoría (que ya se escribe).

## Impacto verificado en el resto del sistema

`fecha_entrada_nursery` se consume en exactamente dos lugares: el `SELECT` del detalle de siembra y `sortAllowed` de `GET /bandejas`. No la usan trazabilidad, cosecha, packing ni aplicaciones químicas; no hay FK, constraint ni índice sobre esa columna; no existe historial por bandeja. Por eso el cambio no propaga efectos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Corrimiento de un día por zona horaria (el usuario elige el 20 y ve el 19) | Anclaje a 12:00 UTC: el día se preserva de UTC-11 a UTC+11 (research D1) |
| Guardar un instante futuro al informar el día de hoy antes del mediodía UTC | Excepción explícita: hoy → `now()` (research D2) |
| El endpoint pasa a tener body con `forbidNonWhitelisted: true`, así que un cliente que mande campos extra recibirá 400 donde antes se ignoraban | Riesgo teórico: el endpoint nunca aceptó body ni está documentado con uno, así que ningún cliente actual manda campos. Se documenta el contrato exacto |
| Regresión en el comportamiento por defecto | El camino sin fecha conserva `() => 'now()'` (reloj de la base, no del proceso) y se verifica explícitamente en quickstart |

## Fuera de alcance verificado

Corrección posterior de la fecha, movimiento parcial por `bandeja_ids`, fecha informada en trasplante, columnas o flags de origen del dato, y cualquier cambio en endpoints de lectura.

## Complexity Tracking

Sin violaciones de constitución que justificar.
