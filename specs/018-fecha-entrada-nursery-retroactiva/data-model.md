# Data Model: Fecha de entrada a nursery retroactiva

**Feature**: 018-fecha-entrada-nursery-retroactiva | **Date**: 2026-07-29

**Sin migración.** Ninguna tabla, columna, índice ni constraint cambia. Lo único que cambia es el **origen posible del valor** de `bandejas.fecha_entrada_nursery`. Este documento describe las entidades involucradas para dejar fijadas las reglas de validación y la transición de estado.

---

## Entidades

### `Bandeja` (`bandejas`) — entidad escrita

| Campo | Tipo | Rol en esta feature |
|---|---|---|
| `id` | uuid (PK) | — |
| `tenant_id` | uuid (`BaseEntity`) | **Nuevo filtro** en el UPDATE (D5) |
| `siembra_id` | uuid | Selector de las bandejas a mover |
| `estado` | enum `cooling_period \| en_nursery \| trasplantada` | Filtro del UPDATE y campo escrito |
| `fecha_entrada_nursery` | `timestamptz NULL` | **Campo escrito**: hoy siempre `now()`, ahora puede venir del usuario |
| `fecha_trasplante` | `timestamptz NULL` | Sin cambios (fuera de alcance) |
| `deleted_at` | `timestamptz NULL` (`BaseEntity`) | **Nuevo filtro** en el UPDATE (D5) |

Sin cambios de estructura. `fecha_entrada_nursery` ya es nullable y ya es `timestamptz`, que es exactamente lo que la feature necesita.

### `Siembra` (`siembras`) — entidad leída

| Campo | Tipo | Rol en esta feature |
|---|---|---|
| `id` | uuid (PK) | Identifica la operación |
| `tenant_id` | uuid | Aislamiento (ya validado en el `findOne` existente) |
| `fecha` | `date` → string `'YYYY-MM-DD'` | **Límite inferior** de `fecha_entrada` (D4) |

Solo lectura, sin cambios. El `findOne` que ya se ejecuta pasa a usar también `fecha`; no se agrega ninguna query.

### `AuditLog` — entidad escrita (existente)

La entrada `INGRESO_NURSERY` que el controller ya escribe suma la fecha informada a su payload `extra`:

```jsonc
{ "siembraId": "<uuid>", "fechaEntrada": "2026-07-20" }   // null si no se informó
```

Sin cambios de estructura: `extra` es un campo libre.

---

## Transición de estado

```text
cooling_period ──[POST /siembras/:id/ingresar-nursery]──▶ en_nursery ──[trasplante]──▶ trasplantada
```

La transición **no cambia**. Solo cambia el valor que se escribe en `fecha_entrada_nursery` al ejecutarla:

| Entrada | Valor persistido |
|---|---|
| Sin `fecha_entrada` | `now()` (reloj de la base) — comportamiento actual |
| `fecha_entrada` == hoy (UTC) | `now()` (reloj de la base) — D2 |
| `fecha_entrada` < hoy | `<fecha>T12:00:00.000Z` — D1 |
| `fecha_entrada` > hoy | ✗ rechazado, nada se escribe |
| `fecha_entrada` < `siembra.fecha` | ✗ rechazado, nada se escribe |

Las bandejas ya en `en_nursery` o `trasplantada` quedan fuera del UPDATE por el filtro `estado = 'cooling_period'`, que se conserva intacto: **no existe forma de re-fechar una bandeja ya movida** (US3).

---

## Reglas de validación

| # | Regla | Dónde | Respuesta |
|---|---|---|---|
| V1 | `fecha_entrada` opcional; si viene, debe matchear `^\d{4}-\d{2}-\d{2}$` | DTO (`@Matches`) | 400 (ValidationPipe) |
| V2 | Cualquier campo desconocido en el body | ValidationPipe (`forbidNonWhitelisted`) | 400 |
| V3 | La fecha debe existir en el calendario (round-trip) | Service | 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` |
| V4 | `fecha_entrada <= hoy` (UTC, día calendario) | Service | 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` |
| V5 | `fecha_entrada >= siembra.fecha` (día calendario; igual es válido) | Service | 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` |
| V6 | La siembra existe y pertenece al tenant | Service (existente) | 404 `SIEMBRA_NOT_FOUND` |
| V7 | Hay al menos una bandeja en `cooling_period` | Service (existente, post-UPDATE) | 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING` |

V3–V5 se evalúan **antes** de abrir la transacción, así que un rechazo no llega siquiera a tocar la base (FR-014).

---

## Códigos de error

| Código | Estado | Nuevo |
|---|---|---|
| `SIEMBRA_FECHA_ENTRADA_INVALIDA` | 422 | **Sí** |
| `SIEMBRA_NOT_FOUND` | 404 | No |
| `SIEMBRA_SIN_BANDEJAS_EN_COOLING` | 422 | No |

---

## Invariantes preservadas

- Todas las bandejas movidas en una operación comparten exactamente el mismo `fecha_entrada_nursery` (un único UPDATE) — FR-009.
- `fecha_entrada_nursery` nunca queda en el futuro — D2.
- `fecha_entrada_nursery >= siembra.fecha` para todo registro creado por esta ruta — V5.
- Ninguna bandeja de otro tenant, eliminada, o fuera de `cooling_period` es alcanzada por el UPDATE — D5 + filtro de estado.
