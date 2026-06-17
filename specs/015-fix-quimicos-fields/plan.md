# Implementation Plan: M05-FIX — Alinear Químicos

**Branch**: `015-fix-quimicos-fields` | **Date**: 2026-06-17 | **Spec**: [spec.md](spec.md)

## Summary

Bugfix en tres puntos del módulo `src/modules/quimicos/`. Los 8 campos nuevos validados por los DTOs de M05 (`nombre_lista`, `unidad_stock`, `rate_unidad`, `withholding_period_dias`, `manufacture_date`, `dom`, `supplier`, `batch`) no se persisten al crear ni actualizar un químico, y el controlador los rechaza con `QUIMICO_FIELD_IMMUTABLE` en PATCH. No hay cambio de esquema — las columnas ya existen en `quimicos`.

## Technical Context

**Language/Version**: TypeScript 5, NestJS 10, Node 20  
**Primary Dependencies**: TypeORM, class-validator  
**Storage**: PostgreSQL — tabla `quimicos`, columnas ya existentes desde migración `AddChemicalFields`  
**Testing**: `npx tsc --noEmit`  
**Target Platform**: Backend NestJS (Docker Alpine)  
**Project Type**: Web service — bugfix quirúrgico en módulo existente  
**Performance Goals**: Sin cambio  
**Constraints**: No migration, no new packages, TypeScript strict, no `any`  
**Scale/Scope**: 2 archivos modificados, 3 bloques de código afectados

## Constitution Check

| Principio | Estado |
|-----------|--------|
| I. Template First — `BaseCrudTenantService.create()` / `update()` | ✅ Mantiene patrón |
| II. Multi-Tenancy — `getTenantId({ strictTenant: true })` ya presente | ✅ Sin cambio |
| III. Error Handling — `AppError` + `ErrorCodes` ya usados | ✅ Sin cambio |
| IV. Audit — eventos `QUIMICO_CREATED` / `QUIMICO_UPDATED` ya presentes | ✅ Sin cambio |
| V. Roles — `supervisor`, `admin_global` ya declarados | ✅ Sin cambio |
| VI. Transactions — `runInTx` ya usado para principios_activos | ✅ Sin cambio |
| VII. API Responses — `ok()` ya usado | ✅ Sin cambio |
| VIII. Code Quality — no `any`, cambios mínimos | ✅ |
| IX. Modules — módulo quimicos ya existe | ✅ Sin cambio |
| X. Small Steps — 3 bloques quirúrgicos | ✅ |

## Análisis del Código (estado actual, pre-fix)

### Bug 1 — `createQuimico()` en `quimicos.service.ts` línea 114

`this.create()` solo pasa 4 campos — los 8 nuevos se descartan silenciosamente:

```typescript
// ACTUAL (buggy):
const quimico = await this.create(
  {
    establecimiento_id: dto.establecimiento_id,
    nombre: dto.nombre,
    unidad_medida: dto.unidad_medida,
    stock_actual: 0,
    // ← 8 campos del DTO nunca llegan aquí
  },
  { strictTenant: true },
);
```

### Bug 2 — `updateQuimico()` en `quimicos.service.ts` línea 175

`updatePayload` solo copia 3 campos — los 8 nuevos se ignoran:

```typescript
// ACTUAL (buggy):
const updatePayload: Partial<Quimico> = {};
if (dto.nombre !== undefined) updatePayload.nombre = dto.nombre;
if (dto.unidad_medida !== undefined) updatePayload.unidad_medida = dto.unidad_medida;
if (dto.activo !== undefined) updatePayload.activo = dto.activo;
// ← 8 campos del DTO nunca se aplican
```

### Bug 3 — PATCH whitelist en `quimicos.controller.ts` línea 104

El `Set` solo tiene 4 entradas — los 8 campos nuevos son rechazados con `QUIMICO_FIELD_IMMUTABLE`:

```typescript
// ACTUAL (buggy):
const ALLOWED = new Set(['nombre', 'unidad_medida', 'activo', 'principios_activos']);
```

### DTOs — Sin cambios necesarios

Ambos DTOs ya están correctos con los 8 campos declarados correctamente:
- `create-quimico.dto.ts` — `unidad_stock` y `rate_unidad` son required; el resto `@IsOptional()`
- `update-quimico.dto.ts` — todos los 8 campos con `@IsOptional()` + validadores

## Project Structure

```text
specs/015-fix-quimicos-fields/
├── spec.md              ✅
├── plan.md              ← este archivo
└── checklists/
    └── requirements.md  ✅

src/modules/quimicos/
├── quimicos.service.ts          ← MODIFICAR (bugs 1 y 2)
├── quimicos.controller.ts       ← MODIFICAR (bug 3)
├── dto/
│   ├── create-quimico.dto.ts    ← SOLO VERIFICAR (no se espera cambio)
│   └── update-quimico.dto.ts    ← SOLO VERIFICAR (no se espera cambio)
└── entities/
    └── quimico.entity.ts        ← NO TOCAR
```

## Implementation Steps

### Step 1 — Fix `createQuimico()` (`quimicos.service.ts` líneas 114–122)

Reemplazar el objeto pasado a `this.create()` para incluir todos los campos del DTO:

```typescript
const quimico = await this.create(
  {
    establecimiento_id: dto.establecimiento_id,
    nombre: dto.nombre,
    unidad_medida: dto.unidad_medida,
    stock_actual: 0,
    nombre_lista: dto.nombre_lista ?? false,
    unidad_stock: dto.unidad_stock,
    rate_unidad: dto.rate_unidad,
    withholding_period_dias: dto.withholding_period_dias ?? null,
    manufacture_date: dto.manufacture_date ?? null,
    dom: dto.dom ?? null,
    supplier: dto.supplier ?? null,
    batch: dto.batch ?? null,
  },
  { strictTenant: true },
);
```

No modificar: validación de unicidad (líneas 96–109), linking de principios_activos (111–128).

### Step 2 — Fix `updateQuimico()` (`quimicos.service.ts` líneas 175–178)

Agregar los 8 campos al bloque `updatePayload`:

```typescript
const updatePayload: Partial<Quimico> = {};
if (dto.nombre !== undefined) updatePayload.nombre = dto.nombre;
if (dto.unidad_medida !== undefined) updatePayload.unidad_medida = dto.unidad_medida;
if (dto.activo !== undefined) updatePayload.activo = dto.activo;
if (dto.nombre_lista !== undefined) updatePayload.nombre_lista = dto.nombre_lista;
if (dto.unidad_stock !== undefined) updatePayload.unidad_stock = dto.unidad_stock;
if (dto.rate_unidad !== undefined) updatePayload.rate_unidad = dto.rate_unidad;
if (dto.withholding_period_dias !== undefined) updatePayload.withholding_period_dias = dto.withholding_period_dias;
if (dto.manufacture_date !== undefined) updatePayload.manufacture_date = dto.manufacture_date;
if (dto.dom !== undefined) updatePayload.dom = dto.dom;
if (dto.supplier !== undefined) updatePayload.supplier = dto.supplier;
if (dto.batch !== undefined) updatePayload.batch = dto.batch;
```

No modificar: validación de nombre duplicado (136–156), manejo de principios_activos (158–173), la condición `if (Object.keys(updatePayload).length > 0)` que sigue.

### Step 3 — Fix ALLOWED whitelist (`quimicos.controller.ts` línea 104)

Reemplazar el `Set` y actualizar el mensaje de error:

```typescript
const ALLOWED = new Set([
  'nombre', 'unidad_medida', 'activo', 'principios_activos',
  'nombre_lista', 'unidad_stock', 'rate_unidad',
  'withholding_period_dias', 'manufacture_date', 'dom',
  'supplier', 'batch',
]);
```

Actualizar el mensaje del `AppError` para no listar campos explícitos (evitar que se desincronice de nuevo):
```typescript
message: 'Campo no permitido. Los campos inmutables son: id, tenant_id, establecimiento_id, stock_actual',
```

No modificar: la lógica del guard (`some((k) => !ALLOWED.has(k))`), audit, respuesta.

### Step 4 — Verificar compilación

```bash
npx tsc --noEmit
```

## Verification Checklist

- [ ] POST /quimicos con los 8 campos nuevos → GET /quimicos/:id devuelve valores exactos
- [ ] POST /quimicos sin campos opcionales → nulls retornados, `nombre_lista=false`
- [ ] POST /quimicos sin `unidad_stock` o `rate_unidad` → 400 error de validación
- [ ] PATCH /quimicos/:id con cualquiera de los 8 campos nuevos → 200, persistido
- [ ] PATCH /quimicos/:id con `stock_actual` en body → rechazado con `QUIMICO_FIELD_IMMUTABLE`
- [ ] PATCH /quimicos/:id con `tenant_id` o `establecimiento_id` → rechazado con `QUIMICO_FIELD_IMMUTABLE`
- [ ] `npx tsc --noEmit` pasa sin errores
