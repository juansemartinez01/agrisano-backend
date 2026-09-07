# API Contract: Descarte de bandejas

**Feature**: `023-descarte-bandejas` | **Base path**: `/bandejas`

Todos los endpoints requieren `Authorization: Bearer <token>` y el header de tenant vigente en el resto de la API. Todas las respuestas usan los envoltorios `ok()` / `page()` del proyecto.

**Orden de rutas**: `POST /bandejas/descartar` y `GET /bandejas/descartes` deben declararse **antes** de `GET /bandejas/:id` en el controller, o Nest resolverá `descartes` como un `:id`.

---

## 1. `POST /bandejas/descartar`

Registra la pérdida de una o varias bandejas. Atómico: o se descartan todas, o ninguna.

**Roles**: `operario`, `supervisor`, `admin_global`

### Request

```json
{
  "bandeja_ids": [
    "8f3c1e2a-0000-4000-8000-000000000001",
    "8f3c1e2a-0000-4000-8000-000000000002"
  ],
  "motivo": "caida",
  "observaciones": "Se cayo el carro al trasladar del nursery al invernadero 3",
  "fecha_descarte": "2026-09-05"
}
```

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `bandeja_ids` | `string[]` (uuid) | sí | `@IsArray` `@ArrayNotEmpty` `@ArrayMaxSize(200)` `@IsUUID('4', { each: true })`. Los repetidos se deduplican, no son error. |
| `motivo` | enum | sí | `@IsEnum(BandejaDescarteMotivo)`: `caida`, `rotura`, `contaminacion`, `plaga`, `mala_germinacion`, `error_carga`, `otro` |
| `observaciones` | `string` | condicional | `@IsOptional` `@IsString` `@MaxLength(500)`. **Obligatorio si `motivo = "otro"`.** |
| `fecha_descarte` | `string` | no | `@Matches(/^\d{4}-\d{2}-\d{2}$/)`. Si se omite, se usa el momento de la carga. |

### Response `201`

```json
{
  "ok": true,
  "data": {
    "descartadas": 2,
    "motivo": "caida",
    "fecha_descarte": "2026-09-05T12:00:00.000Z",
    "bandejas": [
      {
        "bandeja_id": "8f3c1e2a-0000-4000-8000-000000000001",
        "estado_anterior": "en_nursery",
        "siembra_id": "1a2b3c4d-0000-4000-8000-000000000010",
        "mesa_id": null,
        "establecimiento_id": "aa11bb22-0000-4000-8000-000000000100"
      },
      {
        "bandeja_id": "8f3c1e2a-0000-4000-8000-000000000002",
        "estado_anterior": "trasplantada",
        "siembra_id": "1a2b3c4d-0000-4000-8000-000000000010",
        "mesa_id": "cc33dd44-0000-4000-8000-000000000200",
        "establecimiento_id": "aa11bb22-0000-4000-8000-000000000100"
      }
    ],
    "usuario": {
      "id": "99887766-0000-4000-8000-000000000001",
      "email": "operario.qa@agrisano.test",
      "nombre": "Operario",
      "apellido": "QA"
    }
  }
}
```

### Errores

| Código | HTTP | Cuándo | `details` |
|---|---|---|---|
| `BANDEJA_NOT_FOUND` | 404 | Alguno de los ids no existe, está borrado lógicamente o es de otro tenant | `{ "ids": [...] }` |
| `BANDEJA_YA_DESCARTADA` | 409 | Alguna bandeja ya tiene una pérdida registrada | `{ "ids": [...] }` |
| `BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES` | 422 | `motivo = "otro"` sin observaciones | — |
| `BANDEJA_DESCARTE_FECHA_INVALIDA` | 422 | Fecha inexistente en el calendario, futura, o anterior al último hecho conocido de alguna bandeja | `{ "ids": [...] }` cuando el conflicto es por bandeja |
| `VALIDATION_ERROR` | 400 | Falla de `class-validator` (array vacío, uuid inválido, motivo desconocido, formato de fecha) | detalle estándar |
| `FORBIDDEN` | 403 | Rol no habilitado | — |

Un tenant ajeno responde `BANDEJA_NOT_FOUND`, nunca `FORBIDDEN`: no se filtra la existencia de datos de otro cliente.

### Reglas de fecha

1. Sin `fecha_descarte`, o con la fecha de hoy → se guarda `now()`.
2. Con una fecha anterior → se guarda a las **12:00 UTC** de ese día, para que el día calendario no se corra por zona horaria.
3. Fecha posterior a hoy → `BANDEJA_DESCARTE_FECHA_INVALIDA`.
4. Fecha que no existe en el calendario (`2026-02-30`) → `BANDEJA_DESCARTE_FECHA_INVALIDA`.
5. Fecha anterior al último hecho conocido de la bandeja (`fecha_trasplante`, si no `fecha_entrada_nursery`, si no la fecha de la siembra) → `BANDEJA_DESCARTE_FECHA_INVALIDA` con los ids conflictivos.

Mismo criterio ya aplicado a `fecha_entrada` en el ingreso a nursery.

### Efectos

- `bandejas.estado` pasa a `descartada` (terminal).
- Se inserta una fila en `bandeja_descartes` con `estado_anterior` tomado de la fila bloqueada.
- Si la bandeja estaba trasplantada, se agrega un evento `bandeja_descartada` al historial de su mesa.
- Se escribe una entrada de auditoría con acción `bandeja_descartada`, los ids alcanzados y el motivo.
- **No** se modifican `mesa_bandeja`, aplicaciones químicas, cosechas, `carencia_hasta` ni los vínculos de la bandeja.

---

## 2. `GET /bandejas/descartes`

Listado paginado de pérdidas registradas, para análisis de mermas.

**Roles**: los mismos que ya leen bandejas.

### Query params

| Param | Tipo | Notas |
|---|---|---|
| `page`, `limit` | number | `PageQueryDto` estándar |
| `establecimiento_id` | uuid | Opcional |
| `siembra_id` | uuid | Opcional |
| `motivo` | enum | Opcional. Valor de `BandejaDescarteMotivo` |
| `estado_anterior` | enum | Opcional. Valor de `BandejaEstado` distinto de `descartada`. Permite separar mermas de nursery de mermas de invernadero |
| `fecha_desde` | `YYYY-MM-DD` | Opcional. Inclusive |
| `fecha_hasta` | `YYYY-MM-DD` | Opcional. Inclusive (hasta el final del día) |
| `sortBy` | `fecha_descarte` \| `created_at` | Default `fecha_descarte` |
| `sortOrder` | `ASC` \| `DESC` | Default `DESC` |

El orden siempre lleva `bandeja_id` como desempate, para que la paginación sea estable.

### Response `200`

```json
{
  "ok": true,
  "data": [
    {
      "bandeja_id": "8f3c1e2a-0000-4000-8000-000000000002",
      "estado_anterior": "trasplantada",
      "motivo": "caida",
      "observaciones": "Se cayo el carro al trasladar del nursery al invernadero 3",
      "fecha_descarte": "2026-09-05T12:00:00.000Z",
      "created_at": "2026-09-06T14:22:10.114Z",
      "usuario": {
        "id": "99887766-0000-4000-8000-000000000001",
        "email": "operario.qa@agrisano.test",
        "nombre": "Operario",
        "apellido": "QA"
      },
      "bandeja": {
        "siembra_id": "1a2b3c4d-0000-4000-8000-000000000010",
        "mesa_id": "cc33dd44-0000-4000-8000-000000000200",
        "establecimiento_id": "aa11bb22-0000-4000-8000-000000000100",
        "lote_semilla_id": "5566aabb-0000-4000-8000-000000000300"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

---

## 3. `GET /bandejas` (modificado)

### Query params nuevos y cambiados

| Param | Estado | Notas |
|---|---|---|
| `mesa_id` | **nuevo** | uuid. Lista las bandejas de una mesa. Necesario para llegar a la bandeja perdida desde su ubicación (User Story 2). |
| `estado` | **cambiado** | Hoy, si no se envía, se fuerza `en_nursery`. Pasa a ser opcional de verdad: sin filtro devuelve todas **menos** las descartadas; con `estado=descartada` devuelve solo las perdidas. |

El resto de los filtros (`establecimiento_id`, `siembra_id`, `lote_semilla_id`, `lote_vermiculita_id`) no cambia. Se agrega `id` como desempate del orden.

> **Nota de compatibilidad**: un cliente que hoy llama `GET /bandejas` sin `estado` y espera solo las de nursery recibirá también las de cooling y las trasplantadas. Los consumidores deben pasar `estado=en_nursery` explícitamente. Queda documentado en `docs/bandejas-descarte-frontend.md`.

### Response

Cada elemento suma `descarte` cuando la bandeja está descartada:

```json
{
  "id": "8f3c1e2a-0000-4000-8000-000000000002",
  "estado": "descartada",
  "mesa_id": "cc33dd44-0000-4000-8000-000000000200",
  "descarte": {
    "motivo": "caida",
    "fecha_descarte": "2026-09-05T12:00:00.000Z",
    "estado_anterior": "trasplantada"
  }
}
```

Para bandejas no descartadas, `descarte` es `null`.

---

## 4. `GET /bandejas/:id` (modificado)

Suma el objeto completo de la pérdida:

```json
{
  "ok": true,
  "data": {
    "id": "8f3c1e2a-0000-4000-8000-000000000002",
    "estado": "descartada",
    "siembra_id": "1a2b3c4d-0000-4000-8000-000000000010",
    "mesa_id": "cc33dd44-0000-4000-8000-000000000200",
    "carencia_hasta": "2026-09-12",
    "descarte": {
      "motivo": "caida",
      "observaciones": "Se cayo el carro al trasladar del nursery al invernadero 3",
      "fecha_descarte": "2026-09-05T12:00:00.000Z",
      "estado_anterior": "trasplantada",
      "usuario": {
        "id": "99887766-0000-4000-8000-000000000001",
        "email": "operario.qa@agrisano.test",
        "nombre": "Operario",
        "apellido": "QA"
      }
    }
  }
}
```

`descarte` es `null` cuando la bandeja no fue descartada. `carencia_hasta` se conserva tal como estaba: la pérdida no lo altera.

---

## 5. `GET /trazabilidad/...` (modificado)

Cada elemento de `bandejas_ciclo` suma el mismo objeto reducido de `descarte`:

```json
{
  "bandeja_id": "8f3c1e2a-0000-4000-8000-000000000002",
  "estado": "descartada",
  "carencia_hasta": "2026-09-12",
  "carencia_hasta_calculada": "2026-09-12",
  "siembra": { "...": "..." },
  "descarte": {
    "motivo": "caida",
    "fecha_descarte": "2026-09-05T12:00:00.000Z",
    "estado_anterior": "trasplantada"
  }
}
```

La bandeja **sigue apareciendo** en el ciclo. Un reporte de trazabilidad emitido antes del descarte y otro emitido después devuelven exactamente las mismas bandejas; la única diferencia es este campo.

---

## 6. Endpoints afectados por la guarda de estado terminal

| Endpoint | Cambio |
|---|---|
| `POST /trasplantes` | Una bandeja `descartada` es rechazada con `TRASPLANTE_BANDEJA_INVALIDA` (422). La guarda vive en el `WHERE` del `UPDATE` y llega en la **rama prerrequisito**, no en esta feature. |
| `POST /aplicaciones-quimicas` | Ídem: una bandeja descartada no puede recibir aplicaciones. Guarda provista por la rama prerrequisito. |
| `POST /siembras/:id/ingresar-nursery` | Sin cambios de código: la guarda `estado = cooling_period` ya excluye las descartadas. |
| `DELETE /siembras/:id` | Suma `SIEMBRA_HAS_DESCARTADAS` (409) cuando la siembra tiene bandejas perdidas. |
| `DELETE /lotes/:id` | Sin cambios: `LOTE_REFERENCED_BY_BANDEJA` ya cuenta bandejas en cualquier estado. |

---

## Códigos de error nuevos

```ts
BANDEJA_YA_DESCARTADA                          // 409
BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES // 422
BANDEJA_DESCARTE_FECHA_INVALIDA                // 422
SIEMBRA_HAS_DESCARTADAS                        // 409
```
