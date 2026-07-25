# Implementation Plan: Enriquecimiento de lectura de Aplicaciones Químicas

**Branch**: `016-enrich-aplicaciones-quimicas` | **Date**: 2026-07-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-enrich-aplicaciones-quimicas/spec.md`

## Summary

Enriquecer los dos endpoints de lectura de `src/modules/aplicaciones-quimicas` de forma 100% aditiva:

- `GET /aplicaciones-quimicas` (listado paginado): agregar `usuario`, `target_count`, `target_summary` (túneles con `table_count` / seedings con `tray_count`, producto y variedad) y `chemical_lines` enriquecidas.
- `GET /aplicaciones-quimicas/:id` (detalle): agregar bloque `targets` agrupado (mesas por túnel / bandejas por siembra) manteniendo `aplicacion`, `detalles`, `mesa_ids`, `bandeja_ids` intactos.

Estrategia: la query paginada actual no se toca; el enriquecimiento se resuelve con **queries batch por `IN` sobre los IDs de la página** (número de queries constante ≤ 6 por página, nunca proporcional a targets). Sin migraciones — todos los datos e índices necesarios ya existen (verificado en el análisis previo).

## Technical Context

**Language/Version**: TypeScript 5, NestJS 10, Node 20

**Primary Dependencies**: TypeORM (QueryBuilder con joins crudos por nombre de tabla, patrón ya usado en el módulo), class-validator (sin cambios de DTO de entrada)

**Storage**: PostgreSQL — tablas existentes: `aplicaciones_quimicas`, `aplicaciones_quimicas_detalle`, `aplicacion_quimica_mesa`, `aplicacion_quimica_bandeja`, `mesas`, `tuneles`, `bandejas`, `siembras`, `lotes`, `productos`, `variedades`, `lotes_quimicos`, `quimicos`, `marcas`, `proveedores`, `users`. **Sin migraciones.**

**Testing**: `npx tsc --noEmit` + verificación manual con Postman (`postman/aplicaciones-quimicas.postman_collection.json`)

**Target Platform**: Backend NestJS (Docker Alpine)

**Project Type**: Web service — enriquecimiento de lectura en módulo existente

**Performance Goals**: Página de 10 aplicaciones resuelta con ≤ 6 queries SQL independientes del número de mesas/bandejas por aplicación (SC-002). Detalle con ≤ 5 queries.

**Constraints**: Contrato aditivo (no renombrar/eliminar campos), paginación/orden/total en SQL (ya cumplido), tope 200, aislamiento por tenant en toda query nueva, TypeScript strict sin `any`, nunca exponer `password_hash`.

**Scale/Scope**: 1 módulo tocado (`aplicaciones-quimicas`), ~3 archivos modificados + 1 archivo nuevo de tipos de respuesta. Cero cambios de esquema.

## Constitution Check

| Principio | Estado |
|-----------|--------|
| I. Template First — se reutiliza `clampPagination`, `ok()`/`page()`, patrón QueryBuilder existente | ✅ |
| II. Multi-Tenancy — toda query batch filtra `tenant_id` (aplicaciones ya filtradas; joins heredan el scope por `aplicacion_id` de la página + filtro tenant explícito donde la tabla lo tiene) | ✅ |
| III. Error Handling — sin nuevos errores de negocio; 404 existente se mantiene; enriquecimientos faltantes degradan a `null`, nunca a error | ✅ |
| IV. Audit — solo lecturas; no se requieren nuevos registros de auditoría | ✅ N/A |
| V. Roles — guards actuales (`JwtAuthGuard`, `RolesGuard`) sin cambios | ✅ |
| VI. Transactions — solo lecturas; sin transacciones nuevas; `createAplicacion` intacto | ✅ |
| VII. API Responses — se mantienen `ok()` y `page()`; solo cambia el shape de los items (aditivo) | ✅ |
| VIII. Code Quality — interfaces explícitas para los shapes enriquecidos; sin `any`; raw results tipados | ✅ |
| IX. Modules — todo dentro de `src/modules/aplicaciones-quimicas`; acceso a tablas ajenas vía joins SQL de lectura (patrón ya presente en `siembra.service.ts` y en los filtros del propio módulo), no imports de servicios de otros módulos | ✅ |
| X. Small Steps — feature de lectura aislada, verificable endpoint por endpoint | ✅ |

**Gate: PASS** (pre-research y post-diseño — ver re-evaluación al final).

## Project Structure

### Documentation (this feature)

```text
specs/016-enrich-aplicaciones-quimicas/
├── spec.md              # Especificación funcional
├── plan.md              # Este archivo
├── research.md          # Fase 0 — decisiones y hallazgos del análisis de código
├── data-model.md        # Fase 1 — entidades, fuentes de datos y agregaciones
├── quickstart.md        # Fase 1 — cómo verificar la feature
├── contracts/
│   └── aplicaciones-quimicas-read.md   # Contrato de respuesta de ambos endpoints
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 — generado por /speckit-tasks
```

### Source Code (repository root)

```text
src/modules/aplicaciones-quimicas/
├── aplicaciones-quimicas.controller.ts   # MODIFICAR: sin cambios de rutas; tipos de retorno
├── aplicaciones-quimicas.service.ts      # MODIFICAR: enriquecer listAplicaciones y getAplicacionById
├── aplicaciones-quimicas.module.ts       # SIN CAMBIOS (repos ya inyectados; DataSource disponible)
├── dto/
│   ├── create-aplicacion.dto.ts          # SIN CAMBIOS
│   └── query-aplicaciones.dto.ts         # SIN CAMBIOS
├── entities/                             # SIN CAMBIOS (4 entidades)
└── types/
    └── aplicacion-enriched.types.ts      # NUEVO: interfaces de respuesta enriquecida
```

**Structure Decision**: módulo existente único; se agrega solo un archivo de tipos. Los enriquecimientos se implementan como métodos privados del servicio (`buildChemicalLines`, `buildGreenhouseSummary`, `buildNurserySummary`, `buildUsuarios`) que reciben la lista de `aplicacion_id` de la página y devuelven mapas `Map<aplicacion_id, …>` para ensamblar la respuesta.

## Diseño de queries (núcleo del plan)

Para una página de N aplicaciones (IDs ya obtenidos por la query paginada actual, que **no se modifica**):

1. **Q1 — página** (existente): `aplicacionRepo` con filtros + `skip/take` + `getManyAndCount()`. Sin joins nuevos para no romper la paginación.
2. **Q2 — chemical_lines**: `aplicaciones_quimicas_detalle d WHERE d.aplicacion_id IN (:ids)` `JOIN lotes_quimicos lq ON lq.id = d.lote_quimico_id` `JOIN quimicos q ON q.id = lq.quimico_id` `LEFT JOIN marcas m ON m.id = q.marca_id` `LEFT JOIN proveedores p ON p.id = lq.proveedor_id`. Línea principal identificada por `d.lote_quimico_id = a.lote_quimico_id` (en memoria, contra el snapshot de la aplicación): solo esa línea lleva `dose`/`dose_unit`/`withholding_period_days` (desde `a.dosis`, `a.dosis_unidad`, `a.withholding_period_dias`); el resto `null`. LEFT JOIN en todo lo enriquecible para degradar a `null`.
3. **Q3 — resumen greenhouse** (solo si la página tiene aplicaciones greenhouse): `aplicacion_quimica_mesa aqm WHERE aqm.aplicacion_id IN (:ghIds)` `LEFT JOIN mesas ms ON ms.id = aqm.mesa_id` `LEFT JOIN tuneles t ON t.id = ms.tunel_id` con `GROUP BY aqm.aplicacion_id, ms.tunel_id, t.nombre` y `COUNT(*) AS table_count` (el PK compuesto garantiza mesas distintas). `target_count` = suma de `table_count` por aplicación.
4. **Q4 — resumen nursery** (solo si hay aplicaciones nursery): `aplicacion_quimica_bandeja aqb WHERE aqb.aplicacion_id IN (:nuIds)` `LEFT JOIN bandejas b ON b.id = aqb.bandeja_id` `LEFT JOIN siembras s ON s.id = b.siembra_id` `LEFT JOIN lotes ls ON ls.id = b.lote_semilla_id` `LEFT JOIN productos pr / variedades v` con `GROUP BY aqb.aplicacion_id, b.siembra_id, s.created_at, pr.id, pr.nombre, v.id, v.nombre` y `COUNT(*) AS tray_count`. Si un `(aplicacion_id, siembra_id)` produce más de una fila (productos heterogéneos), en memoria se colapsa a una sola fila sumando `tray_count` y anulando `product`/`variety` (regla FR-007).
5. **Q5 — usuarios**: `users WHERE id IN (:userIds) AND tenant_id = :tenantId`, select explícito `id, nombre, apellido, email` (nunca `password_hash`).

Detalle (`:id`): mismas queries acotadas a un solo `aplicacion_id`, sin `GROUP BY` para targets — se traen las filas por mesa/bandeja (con joins de enriquecimiento) y el agrupamiento por túnel/siembra se hace en memoria (targets acotados por aplicación). `mesa_ids`/`bandeja_ids` se siguen derivando de las mismas filas.

Notas de diseño:

- Los `LEFT JOIN` a tablas con soft-delete (`mesas`, `tuneles`, `lotes`, `productos`, `variedades`, `marcas`, `proveedores`) usan join crudo por tabla (sin filtro `deleted_at`), de modo que un recurso borrado siga enriqueciendo como snapshot; si la fila no existe físicamente, el enriquecimiento es `null`. Coherente con FR-008 y con la regla del ticket ("mantener el ID y devolver null o fallback de snapshot").
- Q3/Q4 se ejecutan en paralelo (`Promise.all`) junto con Q2 y Q5 — "consultas paralelas acotadas por página".
- Cantidades `numeric` de Postgres llegan como `string` vía driver; se exponen como `number` con conversión explícita y `null` preservado (nunca `?? 0`).
- Índices verificados en migraciones: `IDX_aqd_aplicacion_id`, PKs compuestos de las tablas de vínculo (cubren `aplicacion_id` como primera columna), `IDX_aqm_mesa_id`, `IDX_aqb_bandeja_id`, `IDX_mesas_tunel_id`, `IDX_bandejas_siembra_id`, `IDX_lotes_quimicos_quimico_id`, `IDX_aq_tenant_id`, `IDX_aq_establecimiento_id`, `IDX_aq_fecha_hora (DESC)`. **No se crean índices** (los compuestos `(tenant_id, fecha_hora DESC)` quedan como optimización futura si el volumen lo exige).

## Complexity Tracking

Sin violaciones de constitución que justificar.

## Re-evaluación Constitution Check (post-diseño)

Sin cambios respecto al gate inicial: PASS. El diseño no introduce dependencias entre módulos (solo joins SQL de lectura), no toca escritura ni transacciones, mantiene envelope y guards, y conserva el aislamiento por tenant.
