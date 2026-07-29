# Implementation Plan: Cantidad explícita del lote primario

**Branch**: `017-cantidad-primario-explicita` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-cantidad-primario-explicita/spec.md`

## Summary

Cambio quirúrgico en `POST /aplicaciones-quimicas`: el descuento de stock del lote primario deja de calcularse como `dosis × targets` y pasa a ser la `cantidad` explícita (nuevo campo obligatorio, number > 0) enviada por el cliente — simetría exacta con `detalles[]`. `dosis`/`dosis_unidad` quedan intactas como dato informativo. El historial de mesa agrega `cantidad` al evento (aditivo). Sin migración, sin cambios en lectura, sin validación de coherencia.

## Technical Context

**Language/Version**: TypeScript 5, NestJS 10, Node 20

**Primary Dependencies**: class-validator (nuevo campo en DTO), TypeORM (sin cambios de query)

**Storage**: PostgreSQL — sin cambios de esquema (`aplicaciones_quimicas_detalle.cantidad` ya existe y es donde vive el valor)

**Testing**: `npx tsc --noEmit` + `npx eslint` del módulo + verificación funcional contra el entorno de desarrollo (Railway) con validación de stock antes/después

**Target Platform**: Backend NestJS (Docker Alpine)

**Project Type**: Web service — cambio de contrato de entrada en módulo existente

**Performance Goals**: Sin cambio (misma cantidad de queries; solo cambia el origen de un valor)

**Constraints**: Corte limpio de contrato (breaking para clientes sin `cantidad` — coordinado con frontend); TypeScript strict sin `any`; sin migración; `decrementarLote` intacto

**Scale/Scope**: 2 archivos de código (`dto/create-aplicacion.dto.ts`, `aplicaciones-quimicas.service.ts`), docs y Postman

## Constitution Check

| Principio | Estado |
|-----------|--------|
| I. Template First — se reutilizan validadores class-validator y el flujo existente | ✅ |
| II. Multi-Tenancy — sin queries nuevas; el descuento ya filtra tenant | ✅ |
| III. Error Handling — 400 lo produce el ValidationPipe estándar; 422 de stock ya existe (`AppError`) | ✅ |
| IV. Audit — el audit de creación existente no cambia | ✅ |
| V. Roles — guards y roles del POST sin cambios | ✅ |
| VI. Transactions — la transacción existente cubre el nuevo origen del valor; rollback intacto | ✅ |
| VII. API Responses — sin cambios de envelope | ✅ |
| VIII. Code Quality — campo tipado + validado; sin `any` | ✅ |
| IX. Modules — todo dentro de `aplicaciones-quimicas` | ✅ |
| X. Small Steps — un cambio de una regla, verificable de punta a punta | ✅ |

**Gate: PASS** (pre y post diseño).

## Project Structure

### Documentation (this feature)

```text
specs/017-cantidad-primario-explicita/
├── spec.md
├── plan.md              # este archivo
├── quickstart.md        # verificación
├── contracts/
│   └── create-aplicacion.md
├── checklists/requirements.md
└── tasks.md
```

(No hay research.md: no quedaron incógnitas — las 4 decisiones de negocio se resolvieron con el solicitante y están en el spec.)

### Source Code

```text
src/modules/aplicaciones-quimicas/
├── dto/create-aplicacion.dto.ts      # MODIFICAR: + cantidad (IsNumber, IsPositive) en la raíz
└── aplicaciones-quimicas.service.ts  # MODIFICAR: createAplicacion usa dto.cantidad; historial + cantidad
```

## Diseño del cambio (exacto)

1. **DTO** — `CreateAplicacionDto` agrega:
   ```ts
   @IsNumber()
   @IsPositive()
   cantidad!: number;
   ```
   (mismos decoradores que `DetalleItemDto.cantidad`; el ValidationPipe global produce el 400 sin código nuevo).

2. **Service** — en `createAplicacion`:
   - Se elimina el cálculo `primaryTotalDosis = dto.dosis * (targetCount > 0 ? targetCount : 1)` (el bloque "7." completo, incluida la variable `targetCount` si queda sin otros usos).
   - `decrementarLote(qr, dto.lote_quimico_id, dto.cantidad, tenantId)`.
   - Detalle primario: `cantidad: dto.cantidad` (resto de campos igual).
   - Historial de mesa (evento `aplicacion_quimica`): el JSON `detalle` agrega `cantidad: dto.cantidad` junto a `dosis`.

3. **Docs** — `docs/aplicaciones-quimicas-frontend.md` (sección 4: body, regla de cálculo de stock y nota para frontend) + colección Postman (body del POST con `cantidad`).

## Fuera de alcance verificado

`decrementarLote` (guard atómico intacto), carencias, validaciones de targets, `detalles[]`, endpoints de lectura (ya muestran `quantity` desde `detalle.cantidad` — automáticamente reflejarán el valor explícito), `operation_group_id`.

## Riesgo principal

No es técnico: es el **corte de contrato**. El deploy debe coordinarse con el frontend porque los clientes actuales no envían `cantidad` y recibirán 400. Decisión explícita del solicitante (sin fallback).

## Complexity Tracking

Sin violaciones de constitución.
