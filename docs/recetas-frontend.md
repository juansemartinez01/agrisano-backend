# Modulo Recetas - Guia para Frontend

## 1. Objetivo del modulo

El modulo de recetas administra recetas asociadas a establecimientos. Una receta representa una configuracion o definicion operativa que puede usarse luego en otros procesos del sistema.

Cada receta pertenece a:

- Un tenant.
- Un establecimiento.

Desde frontend, este modulo sirve para:

- Listar recetas.
- Consultar el detalle de una receta.
- Crear recetas para un establecimiento.
- Editar nombre, descripcion y estado activo.
- Desactivar recetas con `activo=false`.
- Eliminar recetas, si el usuario tiene permisos.

Controladores del modulo:

- `RecetasController`: rutas bajo `/recetas`.
- `AdminRecetasController`: ruta administrativa bajo `/admin/recetas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/recetas
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de recetas requieren JWT.

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
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/recetas"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /recetas` | Cualquier usuario autenticado |
| `GET /recetas/:id` | Cualquier usuario autenticado |
| `POST /recetas` | `supervisor`, `admin_global` |
| `PATCH /recetas/:id` | `supervisor`, `admin_global` |
| `DELETE /recetas/:id` | `admin_global` |
| `GET /admin/recetas` | `admin_global` |

Notas:

- Listar y obtener recetas no tienen decorador `@Roles`, pero siguen requiriendo JWT.
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
  "timestamp": "2026-06-04T22:50:14.989Z",
  "path": "/recetas"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `RECETA_FIELD_IMMUTABLE` | Se intento modificar un campo no permitido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Receta o establecimiento no encontrado |
| `409` | `RECETA_NOMBRE_DUPLICADO` | Ya existe una receta con ese nombre en el establecimiento |
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
    "message": "nombre should not be empty",
    "details": {
      "validationErrors": [
        {
          "message": "nombre should not be empty"
        }
      ]
    }
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/recetas"
}
```

## 8. Modelo de datos

### Receta

```ts
type Receta = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Receta Lechuga Base",
  "descripcion": "Receta operativa para lechuga base",
  "activo": true,
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
}
```

## 9. DTOs usados por frontend

### CreateRecetaDto

Body para crear:

```ts
type CreateRecetaDto = {
  establecimiento_id: string;
  nombre: string;
  descripcion?: string;
};
```

Validaciones:

- `establecimiento_id`: obligatorio, UUID.
- `nombre`: obligatorio, string no vacio, maximo 150 caracteres.
- `descripcion`: opcional, string.

Ejemplo:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Receta Lechuga Base",
  "descripcion": "Receta operativa para lechuga base"
}
```

Reglas de negocio:

- El establecimiento debe existir dentro del tenant actual.
- No puede existir otra receta con el mismo `nombre`, mismo `establecimiento_id` y mismo tenant.
- `activo` queda en `true` por default.

### UpdateRecetaDto

Body para actualizar:

```ts
type UpdateRecetaDto = {
  nombre?: string;
  descripcion?: string;
  activo?: boolean;
};
```

Validaciones:

- `nombre`: opcional, string no vacio, maximo 150 caracteres.
- `descripcion`: opcional, string.
- `activo`: opcional, boolean.

Importante:

- Solo se pueden modificar `nombre`, `descripcion` y `activo`.
- `establecimiento_id` no se puede modificar desde `PATCH`.
- Si se envia cualquier otro campo, responde `400 RECETA_FIELD_IMMUTABLE`.

Ejemplo valido:

```json
{
  "nombre": "Receta Lechuga Base Actualizada",
  "descripcion": "Descripcion actualizada",
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
    "code": "RECETA_FIELD_IMMUTABLE",
    "message": "Solo se pueden modificar nombre, descripcion y activo"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/recetas/3d6d26e5-47ad-478e-bcb6-81709765d67c"
}
```

### QueryRecetasDto

Query params para listados:

```ts
type QueryRecetasDto = {
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
- No hay default backend para `activo`; si no se envia, lista activas e inactivas.

Ejemplo:

```txt
/recetas?page=1&limit=10&q=lechuga&establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&activo=true&sortBy=nombre&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar recetas

```http
GET /recetas
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
| `activo` | boolean | No | - | Filtra activas/inactivas |
| `sortBy` | string | No | `created_at` | `nombre` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /recetas?page=1&limit=10&q=lechuga&activo=true&sortBy=nombre&sortOrder=ASC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Receta Lechuga Base",
      "descripcion": "Receta operativa para lechuga base",
      "activo": true,
      "created_at": "2026-06-04T19:03:01.913Z",
      "updated_at": "2026-06-04T19:03:01.913Z",
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

### 10.2. Obtener receta por ID

```http
GET /recetas/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la receta |

Ejemplo:

```http
GET /recetas/3d6d26e5-47ad-478e-bcb6-81709765d67c
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Receta Lechuga Base",
    "descripcion": "Receta operativa para lechuga base",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Errores comunes:

- `404 NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 10.3. Crear receta

```http
POST /recetas
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Receta Lechuga Base",
  "descripcion": "Receta operativa para lechuga base"
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `establecimiento_id` | uuid | Si | Debe existir en el tenant |
| `nombre` | string | Si | No vacio, maximo 150 caracteres |
| `descripcion` | string | No | Sin maximo definido en DTO |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Receta Lechuga Base",
    "descripcion": "Receta operativa para lechuga base",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Notas:

- El backend asigna automaticamente `tenant_id`.
- `activo` queda en `true` por default.
- Se registra auditoria con accion `receta_created`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 NOT_FOUND`: establecimiento inexistente o fuera del tenant.
- `409 RECETA_NOMBRE_DUPLICADO`: ya existe una receta con ese nombre en ese establecimiento.

Ejemplo de duplicado:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "RECETA_NOMBRE_DUPLICADO",
    "message": "Ya existe una receta con nombre 'Receta Lechuga Base' en este establecimiento"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/recetas"
}
```

### 10.4. Actualizar receta

```http
PATCH /recetas/:id
```

Roles:

- `supervisor`
- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la receta |

Body:

```json
{
  "nombre": "Receta Lechuga Base Actualizada",
  "descripcion": "Descripcion actualizada",
  "activo": true
}
```

Todos los campos son opcionales.

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `nombre` | string | No | No vacio, maximo 150 caracteres |
| `descripcion` | string | No | Sin maximo definido en DTO |
| `activo` | boolean | No | `true` o `false` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Receta Lechuga Base Actualizada",
    "descripcion": "Descripcion actualizada",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z",
    "deleted_at": null
  }
}
```

Reglas importantes:

- Solo se pueden modificar `nombre`, `descripcion` y `activo`.
- No se puede modificar `establecimiento_id`.
- No se puede modificar `tenant_id`.
- Si cambia `nombre`, se valida que no exista otra receta con ese nombre en el mismo establecimiento.
- Se registra auditoria con accion `receta_updated`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 RECETA_FIELD_IMMUTABLE`: body contiene campos no permitidos.
- `404 NOT_FOUND`: receta inexistente o fuera del tenant.
- `409 RECETA_NOMBRE_DUPLICADO`: nuevo nombre duplicado en el establecimiento.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 10.5. Desactivar receta

No hay endpoint separado. Se usa:

```http
PATCH /recetas/:id
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
    "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Receta Lechuga Base",
    "descripcion": "Receta desactivada",
    "activo": false,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:05:00.000Z",
    "deleted_at": null
  }
}
```

Recomendacion frontend:

- Usar `activo=false` para baja logica.
- Usar `DELETE` solo cuando se quiera soft delete y el usuario tenga `admin_global`.

### 10.6. Eliminar receta

```http
DELETE /recetas/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la receta |

Ejemplo:

```http
DELETE /recetas/3d6d26e5-47ad-478e-bcb6-81709765d67c
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
- Se registra auditoria con accion `receta_deleted`.

Errores comunes:

- `404 NOT_FOUND`: receta inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.7. Admin - Listar recetas

```http
GET /admin/recetas
```

Roles:

- `admin_global`

Query params:

Usa los mismos que `GET /recetas`.

Ejemplo:

```http
GET /admin/recetas?page=1&limit=20&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "3d6d26e5-47ad-478e-bcb6-81709765d67c",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Receta Lechuga Base",
      "descripcion": "Receta operativa para lechuga base",
      "activo": true,
      "created_at": "2026-06-04T19:03:01.913Z",
      "updated_at": "2026-06-04T19:03:01.913Z",
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
2. Enviar `GET /recetas?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, activo y busqueda `q`.
6. Si hay `401`, redirigir a login o intentar refresh.
7. Si hay `400 BAD_REQUEST`, revisar query params enviados.

### Flujo de creacion

1. Cargar establecimientos disponibles.
2. Validar que `establecimiento_id` exista.
3. Validar que `nombre` no este vacio y no supere 150 caracteres.
4. Enviar `POST /recetas`.
5. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
6. Si responde `409 RECETA_NOMBRE_DUPLICADO`, mostrar que ya existe una receta con ese nombre en el establecimiento.

### Flujo de edicion

1. Cargar detalle con `GET /recetas/:id`.
2. Permitir editar solo `nombre`, `descripcion` y `activo`.
3. Enviar `PATCH /recetas/:id`.
4. Nunca incluir `establecimiento_id` ni `tenant_id`.
5. Si `activo=false`, tratarlo como desactivacion.
6. Refrescar detalle/listado.

### Flujo de eliminacion

1. Mostrar confirmacion.
2. Enviar `DELETE /recetas/:id`.
3. Si responde `200`, quitarla del listado o refrescar.
4. Si responde `403`, ocultar esta accion para el rol actual.

## 12. Consideraciones de UI/UX

- Mostrar crear y editar solo para `supervisor` o `admin_global`.
- Mostrar eliminar solo para `admin_global`.
- Mostrar `establecimiento_id` como seleccionable solo en creacion.
- En edicion, mostrar establecimiento como solo lectura o no mostrarlo como campo editable.
- Para filtros, ofrecer selector de establecimiento.
- Para `activo`, ofrecer `Todos`, `Activas`, `Inactivas`.
- Para ordenamiento, limitar UI a `nombre` y `created_at`.
- Mostrar mensajes especificos para `RECETA_NOMBRE_DUPLICADO` y `RECETA_FIELD_IMMUTABLE`.
- Si frontend no quiere mostrar inactivas por defecto, debe enviar `activo=true`, porque el backend no aplica ese filtro automaticamente.

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
  "/recetas?page=1&limit=10&activo=true&sortBy=created_at&sortOrder=DESC"
);

const recetas = response.data;
const meta = response.meta;
```

### Crear

```ts
const response = await apiFetch("/recetas", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    nombre: "Receta Lechuga Base",
    descripcion: "Receta operativa para lechuga base"
  })
});

const nuevaReceta = response.data;
```

### Actualizar

```ts
const response = await apiFetch(`/recetas/${recetaId}`, {
  method: "PATCH",
  body: JSON.stringify({
    nombre: "Receta Lechuga Base Actualizada",
    descripcion: "Descripcion actualizada",
    activo: true
  })
});

const recetaActualizada = response.data;
```

### Desactivar

```ts
const response = await apiFetch(`/recetas/${recetaId}`, {
  method: "PATCH",
  body: JSON.stringify({
    activo: false
  })
});

const recetaDesactivada = response.data;
```

### Eliminar

```ts
await apiFetch(`/recetas/${recetaId}`, {
  method: "DELETE"
});
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear receta valida `establecimiento_id`.
- Crear receta valida `nombre` obligatorio.
- `nombre` no supera 150 caracteres.
- En PATCH solo se envian `nombre`, `descripcion` y `activo`.
- En PATCH no se envia `establecimiento_id`.
- `activo` se envia como boolean real en JSON, no como string.
- La UI maneja `RECETA_NOMBRE_DUPLICADO`.
- La UI maneja `RECETA_FIELD_IMMUTABLE`.
- Crear/editar se muestran solo para `supervisor` o `admin_global`.
- Eliminar se muestra solo para `admin_global`.
- Si se quieren listar solo activas, enviar `activo=true`.

