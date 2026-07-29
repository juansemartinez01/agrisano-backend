# Contrato: `POST /siembras/:id/ingresar-nursery`

**Feature**: 018-fecha-entrada-nursery-retroactiva | **Date**: 2026-07-29

Mueve **todas** las bandejas de la siembra que estén en `cooling_period` a `en_nursery`, registrando la fecha de entrada.

**Cambio de esta feature**: el endpoint pasa de no aceptar body a aceptar un body **opcional** con `fecha_entrada`. Es el único cambio de contrato; la respuesta no cambia.

---

## Request

| | |
|---|---|
| Método | `POST` |
| Path | `/siembras/:id/ingresar-nursery` |
| Auth | Bearer JWT |
| Headers | `x-tenant-id: <uuid>`, `Content-Type: application/json` |
| Roles | `operario`, `supervisor`, `admin_global` — **sin cambios** |

### Body (opcional)

```jsonc
{
  "fecha_entrada": "2026-07-20"  // opcional | "YYYY-MM-DD" | día calendario, sin hora
}
```

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `fecha_entrada` | string | No | Formato exacto `YYYY-MM-DD`. Debe existir en el calendario. No posterior a hoy. No anterior a la fecha de la siembra (igual es válido). |

**Formas válidas de request**:

- Sin body
- `{}`
- `{ "fecha_entrada": "2026-07-20" }`

**No se aceptan** timestamps (`"2026-07-20T10:00:00Z"`), otros formatos (`"20/07/2026"`), ni campos adicionales — el body se valida con `whitelist` + `forbidNonWhitelisted`, así que cualquier campo desconocido responde 400.

---

## Semántica de la fecha persistida

| Caso | `bandejas.fecha_entrada_nursery` |
|---|---|
| `fecha_entrada` ausente | `now()` — instante real del registro (**comportamiento actual, sin cambios**) |
| `fecha_entrada` == hoy | `now()` — instante real del registro |
| `fecha_entrada` < hoy | `<fecha_entrada>T12:00:00.000Z` |

El anclaje al mediodía UTC garantiza que el día calendario se lea igual en cualquier huso de América. El cliente **no debe** re-interpretar el valor: para mostrar el día basta con formatear el timestamp recibido.

---

## Respuestas

### 200 OK

Sin cambios respecto de hoy: la siembra completa con sus bandejas (mismo shape que `GET /siembras/:id`).

```jsonc
{
  "ok": true,
  "data": {
    "id": "…",
    "fecha": "2026-07-01",
    "estado": "…",
    "usuario": { "…": "…" },
    "bandejas": [
      {
        "id": "…",
        "codigo": "…",
        "estado": "en_nursery",
        "fecha_entrada_nursery": "2026-07-20T12:00:00.000Z",
        "fecha_trasplante": null,
        "…": "…"
      }
    ]
  }
}
```

Ningún campo se agrega, renombra ni elimina (FR-013).

### 400 Bad Request — validación del body

Formato de `fecha_entrada` inválido, tipo incorrecto, o campo desconocido en el body. Respuesta estándar del `ValidationPipe` global. Ninguna bandeja se modifica.

```jsonc
{
  "ok": false,
  "error": {
    "message": ["fecha_entrada debe tener formato YYYY-MM-DD (solo día, sin hora)"]
  }
}
```

### 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` — **nuevo**

La fecha tiene formato correcto pero viola una regla de negocio:

- No existe en el calendario (`2026-02-31`)
- Es posterior a hoy
- Es anterior a `siembras.fecha`

Ninguna bandeja se modifica (la validación ocurre antes de abrir la transacción).

```jsonc
{
  "ok": false,
  "error": {
    "code": "SIEMBRA_FECHA_ENTRADA_INVALIDA",
    "message": "La fecha de entrada a nursery no es válida"
  }
}
```

### 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING` — existente

La siembra no tiene ninguna bandeja en `cooling_period` (ya fueron movidas o trasplantadas). Se conserva tal cual, con o sin fecha informada. Ninguna fecha existente se sobrescribe.

### 404 `SIEMBRA_NOT_FOUND` — existente

La siembra no existe o pertenece a otro tenant.

### 401 / 403 — existentes

Sin token, o rol no autorizado.

---

## Tabla de errores

| Estado | Código | Cuándo |
|---|---|---|
| 400 | (validación) | `fecha_entrada` con formato inválido o campo desconocido en el body |
| 401 | — | Sin autenticación |
| 403 | — | Rol no autorizado |
| 404 | `SIEMBRA_NOT_FOUND` | Siembra inexistente o de otro tenant |
| 422 | `SIEMBRA_FECHA_ENTRADA_INVALIDA` | Fecha inexistente, futura, o anterior a la siembra |
| 422 | `SIEMBRA_SIN_BANDEJAS_EN_COOLING` | No hay bandejas en `cooling_period` |

---

## Auditoría

La entrada existente (`action: INGRESO_NURSERY`, `entity: siembra`) suma la fecha informada:

```jsonc
"extra": { "siembraId": "<uuid>", "fechaEntrada": "2026-07-20" }   // null si no se informó
```

---

## Compatibilidad

**No breaking.** Un cliente que sigue llamando sin body obtiene exactamente el comportamiento anterior. Frontend y backend pueden desplegarse en cualquier orden.

**Única salvedad**: si un cliente hoy envía campos que el endpoint ignoraba (no hay ninguno conocido: el endpoint nunca aceptó body ni está documentado con uno), ahora recibirá 400 por `forbidNonWhitelisted`.

---

## Nota para el frontend

- El selector de fecha debe limitar el rango a `[siembra.fecha, hoy]`; fuera de ese rango el backend responde 422.
- Enviar solo `YYYY-MM-DD`. Si se toma la fecha de un `Date` del navegador, usar los getters **locales** (`getFullYear`/`getMonth`/`getDate`), no `toISOString()`, que convierte a UTC y puede devolver el día anterior para husos negativos.
- Si el usuario no toca el selector, lo más simple es **omitir** el campo (no mandar la fecha de hoy explícitamente); el resultado es equivalente.
