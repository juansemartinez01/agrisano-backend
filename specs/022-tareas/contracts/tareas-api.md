# Contrato de API: Módulo de tareas

**Feature**: `022-tareas` | **Date**: 2026-08-28

Base: `/tareas`. Todos los endpoints requieren `Authorization: Bearer <token>` y el header `x-tenant-id`. Todas las respuestas usan el envelope estándar del proyecto:

```jsonc
// éxito
{ "ok": true, "data": <T>, "meta": { "page": 1, "limit": 20, "total": 42 } }  // meta solo en listados

// error
{ "ok": false, "error": { "code": "TAREA_NOT_FOUND", "message": "...", "details": { } } }
```

## Objeto `Tarea` (respuesta)

```jsonc
{
  "id": "9f2c1a44-0e1b-4a9d-8f31-6b0a2c7e5d10",
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "ambito": "nursery",
  "estado": "pendiente",
  "titulo": "Revisar bandejas del sector 3",
  "descripcion": "Controlar germinación y humedad",
  "orden": 4,
  "asignado_a": {
    "id": "3c8b...", "email": "operario@agrisano.com",
    "nombre": "Ana", "apellido": "Pérez"
  },
  "creada_por": {
    "id": "1a2b...", "email": "admin@agrisano.com",
    "nombre": "Admin", "apellido": "Agrisano"
  },
  "completada_at": null,
  "completada_por": null,
  "created_at": "2026-08-28T13:04:11.000Z",
  "updated_at": "2026-08-28T13:04:11.000Z"
}
```

`asignado_a`, `creada_por` y `completada_por` son objetos `UsuarioResumen` (`{ id, email, nombre, apellido }`) o `null`. Nunca se expone ningún otro campo de `users`.

---

## 1. `GET /tareas` — Listar

**Roles**: cualquier usuario autenticado.

**Query params** (todos opcionales):

| Param | Tipo | Notas |
|---|---|---|
| `page` | int | Default 1 |
| `limit` | int | Default 20, máximo 200 |
| `establecimiento_id` | uuid | |
| `ambito` | `nursery` \| `greenhouse` | |
| `estado` | `pendiente` \| `en_progreso` \| `completada` \| `cancelada` | |
| `asignado_a` | uuid o `me` | `me` se resuelve al usuario del token |
| `q` | string | `ILIKE` sobre `titulo` y `descripcion` |
| `sortBy` | `orden` \| `created_at` \| `titulo` \| `estado` | Default `orden` |
| `sortOrder` | `ASC` \| `DESC` | Default `ASC` |

Sin filtro de estado el listado incluye las cuatro situaciones. Para el tablero operativo el cliente pide explícitamente `estado=pendiente` y `estado=en_progreso` en dos llamadas, o filtra en pantalla.

**Ejemplo**

```http
GET /tareas?establecimiento_id=00bb7c42-...&ambito=nursery&estado=pendiente&limit=50
```

**200**

```jsonc
{ "ok": true, "data": [ /* Tarea[] */ ], "meta": { "page": 1, "limit": 50, "total": 7 } }
```

**Errores**: 400 `TENANT_REQUIRED` (sin `x-tenant-id`), 400 de validación si un enum o un uuid viene mal formado, 401 sin token.

**Orden**: siempre `sortBy sortOrder`, luego `id ASC` como desempate. Sin ese segundo criterio la paginación por `OFFSET` puede repetir una fila y saltear otra.

---

## 2. `GET /tareas/ambitos` — Ámbitos disponibles

**Roles**: cualquier usuario autenticado.

Fuente de verdad de la lista de ámbitos, para que el frontend no la tenga hardcodeada. Declarado antes que `GET /tareas/:id` en el controller para que `ambitos` no se interprete como un id.

**200**

```jsonc
{
  "ok": true,
  "data": [
    { "value": "nursery", "label": "Nursery" },
    { "value": "greenhouse", "label": "Greenhouse" }
  ]
}
```

Agregar un ámbito en el futuro suma un elemento; la forma de la respuesta no cambia.

---

## 3. `GET /tareas/:id` — Detalle

**Roles**: cualquier usuario autenticado.

**200**: el objeto `Tarea` completo.

**Errores**: 404 `TAREA_NOT_FOUND` (no existe, es de otro tenant, o está borrada).

---

## 4. `POST /tareas` — Crear

**Roles**: `supervisor`, `admin_global`.

**Body**

```jsonc
{
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",  // requerido, uuid
  "ambito": "nursery",                                            // requerido
  "titulo": "Revisar bandejas del sector 3",                      // requerido, 1..150, se trimea
  "descripcion": "Controlar germinación y humedad",               // opcional, máx 2000
  "asignado_a_usuario_id": "3c8b..."                              // opcional, uuid
}
```

`estado`, `orden` y `creada_por_usuario_id` no se aceptan en el body: la tarea nace en `pendiente`, con `orden = MAX(orden) + 1` de su tablero, y `creada_por_usuario_id` sale del token.

**201**: el objeto `Tarea` creado.

**Errores**

| Código | HTTP | Cuándo |
|---|---|---|
| validación | 400 | Falta un campo requerido, título vacío o de más de 150, campo desconocido en el body |
| `ESTABLECIMIENTO_NOT_FOUND` | 404 | El establecimiento no existe en el tenant |
| `TAREA_ASIGNADO_INVALIDO` | 422 | `asignado_a_usuario_id` no corresponde a un usuario del tenant |
| `AUTH_FORBIDDEN` | 403 | Rol operario |

---

## 5. `PATCH /tareas/:id` — Editar

**Roles**: `supervisor`, `admin_global`.

**Body**: únicamente estos tres campos, todos opcionales.

```jsonc
{
  "titulo": "Revisar bandejas del sector 3 y 4",
  "descripcion": null,
  "asignado_a_usuario_id": null   // null desasigna
}
```

Cualquier otra clave (`ambito`, `establecimiento_id`, `estado`, `orden`, ...) devuelve **400 `TAREA_FIELD_IMMUTABLE`**. El estado se cambia por su endpoint y la posición por el de reordenamiento.

**200**: la tarea actualizada.

**Errores**: 400 `TAREA_FIELD_IMMUTABLE`, 404 `TAREA_NOT_FOUND`, 422 `TAREA_ASIGNADO_INVALIDO`, 403 `AUTH_FORBIDDEN`.

---

## 6. `POST /tareas/:id/estado` — Cambiar de estado

**Roles**: `operario`, `supervisor`, `admin_global`. La reapertura queda restringida dentro del service.

**Body**

```jsonc
{ "estado": "en_progreso" }
```

**Matriz de transiciones**

| Desde \ Hacia | `pendiente` | `en_progreso` | `completada` | `cancelada` |
|---|---|---|---|---|
| `pendiente` | ✗ | ✓ | ✓ | ✓ |
| `en_progreso` | ✓ | ✗ | ✓ | ✓ |
| `completada` | ✓ *(supervisor+)* | ✗ | ✗ | ✗ |
| `cancelada` | ✓ *(supervisor+)* | ✗ | ✗ | ✗ |

**Efectos**: al pasar a `completada` se setean `completada_at` y `completada_por_usuario_id`; al reabrir a `pendiente` desde `completada` se limpian ambos. `orden` no cambia nunca.

**200**: la tarea con su nuevo estado.

**Errores**

| Código | HTTP | Cuándo |
|---|---|---|
| `TAREA_TRANSICION_INVALIDA` | 422 | La celda es ✗, incluido pedir el estado que la tarea ya tiene. `details` trae `{ from, to }` |
| `AUTH_FORBIDDEN` | 403 | Un operario intenta reabrir una tarea `completada` o `cancelada` |
| `TAREA_NOT_FOUND` | 404 | |

Ejemplo de rechazo:

```jsonc
{
  "ok": false,
  "error": {
    "code": "TAREA_TRANSICION_INVALIDA",
    "message": "No se puede pasar de 'completada' a 'en_progreso'",
    "details": { "from": "completada", "to": "en_progreso" }
  }
}
```

---

## 7. `POST /tareas/reordenar` — Reordenar un tablero

**Roles**: `supervisor`, `admin_global`.

No colisiona con ninguna ruta con parámetro (no existe `POST /tareas/:id`), pero se declara junto al resto de los POST por claridad.

**Body**

```jsonc
{
  "establecimiento_id": "00bb7c42-...",
  "ambito": "nursery",
  "tarea_ids": ["uuid-3", "uuid-1", "uuid-2"]   // 1..500, el orden del array es el orden final
}
```

`tarea_ids` debe contener **exactamente** las tareas activas (`pendiente` + `en_progreso`, no borradas) de ese establecimiento y ámbito: ni una de más ni una de menos. Las tareas `completada` y `cancelada` no participan y conservan su `orden` histórico.

**200**

```jsonc
{ "ok": true, "data": [ /* las tareas del tablero, ya con orden 1..N */ ] }
```

**Errores**

| Código | HTTP | Cuándo |
|---|---|---|
| `TAREA_REORDEN_INVALIDO` | 422 | El conjunto enviado no coincide con las activas del tablero (alguien agregó, cerró o borró una tarea mientras se arrastraba), o hay ids repetidos. `details` trae `{ esperadas, recibidas }` |
| validación | 400 | Array vacío, más de 500 ids, o un id que no es uuid |
| `AUTH_FORBIDDEN` | 403 | Rol operario |

Ante un 422 el cliente debe recargar el tablero y reintentar; es la contrapartida deliberada de garantizar que el orden nunca quede corrupto.

---

## 8. `DELETE /tareas/:id` — Eliminar

**Roles**: `supervisor`, `admin_global`.

Soft delete (`deleted_at`). La tarea desaparece de listados y detalle, y deja de participar del reordenamiento. Se puede borrar en cualquier estado.

**200**

```jsonc
{ "ok": true, "data": { "deleted": true } }
```

**Errores**: 404 `TAREA_NOT_FOUND`, 403 `AUTH_FORBIDDEN`.

---

## Resumen de códigos de error nuevos

| Código | HTTP | Endpoints |
|---|---|---|
| `TAREA_NOT_FOUND` | 404 | GET `/:id`, PATCH, POST `/:id/estado`, DELETE |
| `TAREA_TRANSICION_INVALIDA` | 422 | POST `/:id/estado` |
| `TAREA_FIELD_IMMUTABLE` | 400 | PATCH |
| `TAREA_ASIGNADO_INVALIDO` | 422 | POST, PATCH |
| `TAREA_REORDEN_INVALIDO` | 422 | POST `/reordenar` |

Reutilizados: `TENANT_REQUIRED` (400), `AUTH_FORBIDDEN` (403), `ESTABLECIMIENTO_NOT_FOUND` (404).

---

## Auditoría

Cada escritura registra un evento vía `AuditService`:

| Acción | Endpoint | Payload extra |
|---|---|---|
| `tarea_created` | POST `/tareas` | `{ id, establecimiento_id, ambito }` |
| `tarea_updated` | PATCH `/tareas/:id` | campos modificados |
| `tarea_estado_changed` | POST `/tareas/:id/estado` | `{ from, to }` |
| `tarea_reordenada` | POST `/tareas/reordenar` | `{ establecimiento_id, ambito, cantidad }` |
| `tarea_deleted` | DELETE `/tareas/:id` | `{ id }` |
