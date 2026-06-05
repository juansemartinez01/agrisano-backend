# Modulo Tuneles - Guia para Frontend

## 1. Objetivo del modulo

El modulo de tuneles administra tuneles asociados a establecimientos. Un tunel representa una unidad fisica o logica de capacidad dentro de un establecimiento.

Cada tunel pertenece a:

- Un tenant.
- Un establecimiento.

Desde frontend, este modulo sirve para:

- Listar tuneles.
- Consultar el detalle de un tunel.
- Crear tuneles para un establecimiento.
- Editar nombre, capacidad maxima y estado activo.
- Desactivar tuneles con `activo=false`.
- Eliminar tuneles, si el usuario tiene permisos.

Controladores del modulo:

- `TunelesController`: rutas bajo `/tuneles`.
- `AdminTunelesController`: ruta administrativa bajo `/admin/tuneles`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/tuneles
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de tuneles requieren JWT.

Header obligatorio:

```http
Authorization: Bearer <access_token>
```

El token se obtiene con:

```http
POST /auth/login
```

Body:

```json
{
  "email": "admin@agrisano.com",
  "password": "password"
}
```

Respuesta esperada:

```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt..."
}
```

Importante: los roles quedan dentro del JWT al momento del login. Si se cambian roles en base de datos, el usuario debe volver a iniciar sesion para obtener un token nuevo.

## 4. Tenancy

El modulo trabaja siempre dentro del tenant actual.

El tenant puede venir:

- Dentro del JWT como `tenant_id`.
- Por header `x-tenant-id`.
- Opcionalmente por header `x-tenant-key`, segun configuracion del backend.

Headers recomendados:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si falta tenant, el backend puede responder:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "TENANT_REQUIRED",
    "message": "Tenant is required"
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/tuneles"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /tuneles` | Cualquier usuario autenticado |
| `GET /tuneles/:id` | Cualquier usuario autenticado |
| `POST /tuneles` | `supervisor`, `admin_global` |
| `PATCH /tuneles/:id` | `supervisor`, `admin_global` |
| `DELETE /tuneles/:id` | `admin_global` |
| `GET /admin/tuneles` | `admin_global` |

Notas:

- Listar y obtener tuneles no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear y actualizar requieren `supervisor` o `admin_global`.
- Eliminar requiere `admin_global`.
- El rol `admin` no habilita automaticamente las acciones de este modulo si no esta listado arriba.

## 6. Formato general de respuestas exitosas

Respuesta simple:

```json
{
  "ok": true,
  "data": {}
}
```

Respuesta paginada:

```json
{
  "ok": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## 7. Formato general de errores

Todos los errores pasan por el filtro global y mantienen este formato:

```json
{
  "ok": false,
  "requestId": "73f4ee70-9f53-4a2a-a14e-e165cf68f6d6",
  "statusCode": 403,
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Forbidden resource"
  },
  "timestamp": "2026-06-05T22:50:14.989Z",
  "path": "/tuneles"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `TUNEL_FIELD_IMMUTABLE` | Se intento modificar un campo no permitido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Tunel o establecimiento no encontrado |
| `409` | `TUNEL_NOMBRE_DUPLICADO` | Ya existe un tunel con ese nombre en el establecimiento |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

Errores de validacion pueden incluir `details.validationErrors`:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "BAD_REQUEST",
    "message": "capacidad_maxima must not be less than 1",
    "details": {
      "validationErrors": [
        {
          "message": "capacidad_maxima must not be less than 1"
        }
      ]
    }
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/tuneles"
}
```

## 8. Modelo de datos

### Tunel

```ts
type Tunel = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  nombre: string;
  capacidad_maxima: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Tunel Norte",
  "capacidad_maxima": 100,
  "activo": true,
  "created_at": "2026-06-05T19:03:01.913Z",
  "updated_at": "2026-06-05T19:03:01.913Z",
  "deleted_at": null
}
```

## 9. DTOs usados por frontend

### CreateTunelDto

Body para crear:

```ts
type CreateTunelDto = {
  establecimiento_id: string;
  nombre: string;
  capacidad_maxima: number;
};
```

Validaciones:

- `establecimiento_id`: obligatorio, UUID.
- `nombre`: obligatorio, string no vacio, maximo 100 caracteres.
- `capacidad_maxima`: obligatorio, entero, minimo 1.

Ejemplo:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Tunel Norte",
  "capacidad_maxima": 100
}
```

Reglas de negocio:

- El establecimiento debe existir dentro del tenant actual.
- No puede existir otro tunel con el mismo `nombre`, mismo `establecimiento_id` y mismo tenant.
- `activo` queda en `true` por default.

### UpdateTunelDto

Body para actualizar:

```ts
type UpdateTunelDto = {
  nombre?: string;
  capacidad_maxima?: number;
  activo?: boolean;
};
```

Validaciones:

- `nombre`: opcional, string no vacio, maximo 100 caracteres.
- `capacidad_maxima`: opcional, entero, minimo 1.
- `activo`: opcional, boolean.

Importante:

- Solo se pueden modificar `nombre`, `capacidad_maxima` y `activo`.
- `establecimiento_id` no se puede modificar desde `PATCH`.
- Si se envia cualquier otro campo, responde `400 TUNEL_FIELD_IMMUTABLE`.

Ejemplo valido:

```json
{
  "nombre": "Tunel Norte Actualizado",
  "capacidad_maxima": 120,
  "activo": true
}
```

Ejemplo invalido:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731"
}
```

Respuesta del ejemplo invalido:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "TUNEL_FIELD_IMMUTABLE",
    "message": "Solo se pueden modificar nombre, capacidad_maxima y activo"
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/tuneles/9e314fed-4062-4563-913f-a66f2fbb422e"
}
```

### QueryTunelesDto

Query params para listados:

```ts
type QueryTunelesDto = {
  page?: number;
  limit?: number;
  q?: string;
  establecimiento_id?: string;
  activo?: boolean;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `q`: opcional, string. Busca por `nombre`.
- `establecimiento_id`: opcional, UUID.
- `activo`: opcional, boolean. Acepta `true` o `false`.
- `sortBy`: opcional. Valores permitidos reales: `nombre`, `created_at`.
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.
- Si `sortBy` no es permitido, el backend ordena por `created_at DESC`.
- No hay default backend para `activo`; si no se envia, lista activos e inactivos.

Ejemplo:

```txt
/tuneles?page=1&limit=10&q=norte&establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&activo=true&sortBy=nombre&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar tuneles

```http
GET /tuneles
```

Roles:

- Cualquier usuario autenticado.

Headers:

```http
Authorization: Bearer <access_token>
x-tenant-id: <tenant_id>
```

Query params:

| Param | Tipo | Requerido | Default | Descripcion |
| --- | --- | --- | --- | --- |
| `page` | number | No | `1` | Pagina actual |
| `limit` | number | No | `20` | Cantidad por pagina, maximo `200` |
| `q` | string | No | - | Busca por nombre |
| `establecimiento_id` | uuid | No | - | Filtra por establecimiento |
| `activo` | boolean | No | - | Filtra activos/inactivos |
| `sortBy` | string | No | `created_at` | `nombre` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /tuneles?page=1&limit=10&q=norte&activo=true&sortBy=nombre&sortOrder=ASC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Tunel Norte",
      "capacidad_maxima": 100,
      "activo": true,
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z",
      "deleted_at": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

Errores comunes:

- `401 AUTH_INVALID`: token invalido o ausente.
- `400 TENANT_REQUIRED`: falta tenant.
- `400 BAD_REQUEST`: query invalida.

### 10.2. Obtener tunel por ID

```http
GET /tuneles/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del tunel |

Ejemplo:

```http
GET /tuneles/9e314fed-4062-4563-913f-a66f2fbb422e
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Tunel Norte",
    "capacidad_maxima": 100,
    "activo": true,
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Errores comunes:

- `404 NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 10.3. Crear tunel

```http
POST /tuneles
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Tunel Norte",
  "capacidad_maxima": 100
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `establecimiento_id` | uuid | Si | Debe existir en el tenant |
| `nombre` | string | Si | No vacio, maximo 100 caracteres |
| `capacidad_maxima` | number | Si | Entero, minimo 1 |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Tunel Norte",
    "capacidad_maxima": 100,
    "activo": true,
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Notas:

- El backend asigna automaticamente `tenant_id`.
- `activo` queda en `true` por default.
- Se registra auditoria con accion `tunel_created`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 NOT_FOUND`: establecimiento inexistente o fuera del tenant.
- `409 TUNEL_NOMBRE_DUPLICADO`: ya existe un tunel con ese nombre en ese establecimiento.

Ejemplo de duplicado:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "TUNEL_NOMBRE_DUPLICADO",
    "message": "Ya existe un tunel con nombre 'Tunel Norte' en este establecimiento"
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/tuneles"
}
```

### 10.4. Actualizar tunel

```http
PATCH /tuneles/:id
```

Roles:

- `supervisor`
- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del tunel |

Body:

```json
{
  "nombre": "Tunel Norte Actualizado",
  "capacidad_maxima": 120,
  "activo": true
}
```

Todos los campos son opcionales.

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `nombre` | string | No | No vacio, maximo 100 caracteres |
| `capacidad_maxima` | number | No | Entero, minimo 1 |
| `activo` | boolean | No | `true` o `false` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Tunel Norte Actualizado",
    "capacidad_maxima": 120,
    "activo": true,
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T20:00:00.000Z",
    "deleted_at": null
  }
}
```

Reglas importantes:

- Solo se pueden modificar `nombre`, `capacidad_maxima` y `activo`.
- No se puede modificar `establecimiento_id`.
- No se puede modificar `tenant_id`.
- Si cambia `nombre`, se valida que no exista otro tunel con ese nombre en el mismo establecimiento.
- Se registra auditoria con accion `tunel_updated`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TUNEL_FIELD_IMMUTABLE`: body contiene campos no permitidos.
- `404 NOT_FOUND`: tunel inexistente o fuera del tenant.
- `409 TUNEL_NOMBRE_DUPLICADO`: nuevo nombre duplicado en el establecimiento.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 10.5. Desactivar tunel

No hay endpoint separado. Se usa:

```http
PATCH /tuneles/:id
```

Body:

```json
{
  "activo": false
}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Tunel Norte",
    "capacidad_maxima": 100,
    "activo": false,
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T20:05:00.000Z",
    "deleted_at": null
  }
}
```

Recomendacion frontend:

- Usar `activo=false` para baja logica.
- Usar `DELETE` solo cuando se quiera soft delete y el usuario tenga `admin_global`.

### 10.6. Eliminar tunel

```http
DELETE /tuneles/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del tunel |

Ejemplo:

```http
DELETE /tuneles/9e314fed-4062-4563-913f-a66f2fbb422e
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "deleted": true
  }
}
```

Notas:

- Hace soft delete.
- Se registra auditoria con accion `tunel_deleted`.

Errores comunes:

- `404 NOT_FOUND`: tunel inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.7. Admin - Listar tuneles

```http
GET /admin/tuneles
```

Roles:

- `admin_global`

Query params:

Usa los mismos que `GET /tuneles`.

Ejemplo:

```http
GET /admin/tuneles?page=1&limit=20&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Tunel Norte",
      "capacidad_maxima": 100,
      "activo": true,
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z",
      "deleted_at": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Notas:

- Hoy tiene comportamiento muy parecido al listado comun, pero exige `admin_global`.
- Es util si el frontend separa pantallas administrativas bajo `/admin`.

## 11. Flujos recomendados para frontend

### Flujo de carga de listado

1. Verificar que exista `access_token`.
2. Enviar `GET /tuneles?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, activo y busqueda `q`.
6. Si hay `401`, redirigir a login o intentar refresh.
7. Si hay `400 BAD_REQUEST`, revisar query params enviados.

### Flujo de creacion

1. Cargar establecimientos disponibles.
2. Validar que `establecimiento_id` exista.
3. Validar que `nombre` no este vacio y no supere 100 caracteres.
4. Validar que `capacidad_maxima` sea entero mayor o igual a 1.
5. Enviar `POST /tuneles`.
6. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
7. Si responde `409 TUNEL_NOMBRE_DUPLICADO`, mostrar que ya existe un tunel con ese nombre en el establecimiento.

### Flujo de edicion

1. Cargar detalle con `GET /tuneles/:id`.
2. Permitir editar solo `nombre`, `capacidad_maxima` y `activo`.
3. Enviar `PATCH /tuneles/:id`.
4. Nunca incluir `establecimiento_id` ni `tenant_id`.
5. Si `activo=false`, tratarlo como desactivacion.
6. Refrescar detalle/listado.

### Flujo de eliminacion

1. Mostrar confirmacion.
2. Enviar `DELETE /tuneles/:id`.
3. Si responde `200`, quitarlo del listado o refrescar.
4. Si responde `403`, ocultar esta accion para el rol actual.

## 12. Consideraciones de UI/UX

- Mostrar crear y editar solo para `supervisor` o `admin_global`.
- Mostrar eliminar solo para `admin_global`.
- Mostrar `establecimiento_id` como seleccionable solo en creacion.
- En edicion, mostrar establecimiento como solo lectura o no mostrarlo como campo editable.
- Para filtros, ofrecer selector de establecimiento.
- Para `activo`, ofrecer `Todos`, `Activos`, `Inactivos`.
- Para ordenamiento, limitar UI a `nombre` y `created_at`.
- Validar `capacidad_maxima` con input numerico entero.
- Mostrar mensajes especificos para `TUNEL_NOMBRE_DUPLICADO` y `TUNEL_FIELD_IMMUTABLE`.
- Si frontend no quiere mostrar inactivos por defecto, debe enviar `activo=true`, porque el backend no aplica ese filtro automaticamente.

## 13. Ejemplos con fetch

### Cliente base

```ts
const baseUrl = "http://localhost:3000";

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const tenantId = localStorage.getItem("tenant_id");

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(options.headers ?? {})
    }
  });

  const json = await res.json();

  if (!res.ok) {
    throw json;
  }

  return json;
}
```

### Listar

```ts
const response = await apiFetch(
  "/tuneles?page=1&limit=10&activo=true&sortBy=created_at&sortOrder=DESC"
);

const tuneles = response.data;
const meta = response.meta;
```

### Crear

```ts
const response = await apiFetch("/tuneles", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    nombre: "Tunel Norte",
    capacidad_maxima: 100
  })
});

const nuevoTunel = response.data;
```

### Actualizar

```ts
const response = await apiFetch(`/tuneles/${tunelId}`, {
  method: "PATCH",
  body: JSON.stringify({
    nombre: "Tunel Norte Actualizado",
    capacidad_maxima: 120,
    activo: true
  })
});

const tunelActualizado = response.data;
```

### Desactivar

```ts
const response = await apiFetch(`/tuneles/${tunelId}`, {
  method: "PATCH",
  body: JSON.stringify({
    activo: false
  })
});

const tunelDesactivado = response.data;
```

### Eliminar

```ts
await apiFetch(`/tuneles/${tunelId}`, {
  method: "DELETE"
});
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear tunel valida `establecimiento_id`.
- Crear tunel valida `nombre` obligatorio.
- `nombre` no supera 100 caracteres.
- `capacidad_maxima` es entero y mayor o igual a 1.
- En PATCH solo se envian `nombre`, `capacidad_maxima` y `activo`.
- En PATCH no se envia `establecimiento_id`.
- `activo` se envia como boolean real en JSON, no como string.
- La UI maneja `TUNEL_NOMBRE_DUPLICADO`.
- La UI maneja `TUNEL_FIELD_IMMUTABLE`.
- Crear/editar se muestran solo para `supervisor` o `admin_global`.
- Eliminar se muestra solo para `admin_global`.
- Si se quieren listar solo activos, enviar `activo=true`.

