# Modulo Establecimientos - Guia para Frontend

## 1. Objetivo del modulo

El modulo de establecimientos administra los lugares, sedes o unidades operativas sobre las que trabaja el sistema. Cada establecimiento pertenece a un tenant y puede tener usuarios asignados.

Desde frontend, este modulo sirve para:

- Listar establecimientos visibles para el usuario autenticado.
- Consultar el detalle de un establecimiento.
- Crear, editar, desactivar o eliminar establecimientos, si el usuario tiene permisos de administracion global.
- Asignar usuarios a establecimientos.
- Quitar usuarios de establecimientos.
- Listar los usuarios asignados a un establecimiento.

El modulo esta dividido en dos controladores:

- `EstablecimientosController`: rutas publicas del modulo bajo `/establecimientos`, siempre protegidas con JWT y roles.
- `AdminEstablecimientosController`: ruta administrativa bajo `/admin/establecimientos`, protegida con rol `admin_global`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/establecimientos
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de establecimientos requieren JWT.

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

El sistema esta preparado para multi-tenant.

El tenant puede venir:

- Dentro del JWT como `tenant_id`.
- Por header `x-tenant-id`.
- Opcionalmente por header `x-tenant-key`, segun configuracion del backend.

Headers recomendados para frontend/Postman:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si `TENANCY_REQUIRED=true` y no se envia tenant valido, el backend puede responder:

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
  "path": "/establecimientos"
}
```

Tambien puede responder `401` si hay mismatch entre el tenant del header y el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`. El usuario debe tener al menos uno de los roles requeridos por endpoint.

Roles usados en este modulo:

- `admin_global`
- `supervisor`
- `operario`

Nota importante: el rol `admin` no habilita este modulo, salvo que el backend se modifique. Para `/establecimientos`, un usuario con solo rol `admin` recibira `403 AUTH_FORBIDDEN`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /establecimientos` | `admin_global`, `supervisor`, `operario` |
| `GET /establecimientos/:id` | `admin_global`, `supervisor`, `operario` |
| `POST /establecimientos` | `admin_global` |
| `PATCH /establecimientos/:id` | `admin_global` |
| `DELETE /establecimientos/:id` | `admin_global` |
| `POST /establecimientos/:id/usuarios/:userId` | `admin_global` |
| `DELETE /establecimientos/:id/usuarios/:userId` | `admin_global` |
| `GET /establecimientos/:id/usuarios` | `admin_global`, `supervisor` |
| `GET /admin/establecimientos` | `admin_global` |

## 6. Formato general de respuestas exitosas

El backend responde con un wrapper uniforme.

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

Todos los errores pasan por un filtro global y tienen este formato:

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
  "path": "/establecimientos?page=1&limit=10"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Recurso no encontrado |
| `404` | `ESTABLECIMIENTO_NOT_FOUND` | Establecimiento no visible/no existe |
| `404` | `ASSIGNMENT_NOT_FOUND` | Asignacion usuario-establecimiento no existe |
| `409` | `ASSIGNMENT_CONFLICT` | Usuario ya asignado al establecimiento |
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
  "path": "/establecimientos"
}
```

## 8. Modelo de datos

### Establecimiento

Campos principales:

```ts
type Establecimiento = {
  id: string;
  tenant_id: string | null;
  nombre: string;
  ubicacion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "nombre": "Campo Norte",
  "ubicacion": "Ruta 1 km 10",
  "activo": true,
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
}
```

### UsuarioEstablecimiento

Representa una asignacion entre usuario y establecimiento.

```ts
type UsuarioEstablecimiento = {
  id: string;
  user_id: string;
  establecimiento_id: string;
  assigned_at: string;
};
```

Ejemplo:

```json
{
  "id": "1fdd266f-2c63-4ca7-9421-d601f5fdf921",
  "user_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "assigned_at": "2026-06-04T22:10:00.000Z"
}
```

## 9. DTOs usados por frontend

### CreateEstablecimientoDto

Body para crear:

```ts
type CreateEstablecimientoDto = {
  nombre: string;
  ubicacion?: string;
};
```

Validaciones:

- `nombre`: obligatorio, string, maximo 150 caracteres.
- `ubicacion`: opcional, string, maximo 300 caracteres.

Ejemplo:

```json
{
  "nombre": "Campo Norte",
  "ubicacion": "Ruta 1 km 10"
}
```

### UpdateEstablecimientoDto

Body para actualizar:

```ts
type UpdateEstablecimientoDto = {
  nombre?: string;
  ubicacion?: string;
  activo?: boolean;
};
```

Validaciones:

- `nombre`: opcional, string, maximo 150 caracteres.
- `ubicacion`: opcional, string, maximo 300 caracteres.
- `activo`: opcional, boolean.

Ejemplo:

```json
{
  "nombre": "Campo Norte Actualizado",
  "ubicacion": "Ruta 1 km 11",
  "activo": true
}
```

### QueryEstablecimientosDto

Query params para listados:

```ts
type QueryEstablecimientosDto = {
  page?: number;
  limit?: number;
  q?: string;
  activo?: boolean;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `q`: opcional, string. Busca por `nombre`.
- `activo`: opcional, boolean. Acepta `true` o `false`.
- `sortBy`: opcional. Valores permitidos reales: `nombre`, `created_at`.
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.
- Si `sortBy` no es permitido, el backend ordena por `created_at DESC`.

Ejemplo:

```txt
/establecimientos?page=1&limit=10&q=campo&activo=true&sortBy=nombre&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar establecimientos

```http
GET /establecimientos
```

Roles:

- `admin_global`
- `supervisor`
- `operario`

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
| `activo` | boolean | No | - | Filtra activos/inactivos |
| `sortBy` | string | No | `created_at` | `nombre` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /establecimientos?page=1&limit=10&q=campo&activo=true&sortBy=nombre&sortOrder=ASC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "nombre": "Campo Norte",
      "ubicacion": "Ruta 1 km 10",
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

Comportamiento por rol:

- `admin_global`: lista todos los establecimientos del tenant.
- `supervisor` y `operario`: lista solo establecimientos asignados al usuario.

Errores comunes:

- `401 AUTH_INVALID`: token invalido o ausente.
- `403 AUTH_FORBIDDEN`: rol no permitido.
- `400 TENANT_REQUIRED`: falta tenant.

### 10.2. Obtener establecimiento por ID

```http
GET /establecimientos/:id
```

Roles:

- `admin_global`
- `supervisor`
- `operario`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |

Ejemplo:

```http
GET /establecimientos/1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "nombre": "Campo Norte",
    "ubicacion": "Ruta 1 km 10",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Comportamiento por rol:

- `admin_global`: puede ver cualquier establecimiento del tenant.
- `supervisor` y `operario`: solo pueden ver establecimientos asignados a su usuario.

Errores comunes:

- `404 ESTABLECIMIENTO_NOT_FOUND`: no existe o el usuario no tiene acceso.
- `403 AUTH_FORBIDDEN`: rol no permitido.

### 10.3. Crear establecimiento

```http
POST /establecimientos
```

Roles:

- `admin_global`

Body:

```json
{
  "nombre": "Campo Norte",
  "ubicacion": "Ruta 1 km 10"
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `nombre` | string | Si | No vacio, maximo 150 caracteres |
| `ubicacion` | string | No | Maximo 300 caracteres |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "nombre": "Campo Norte",
    "ubicacion": "Ruta 1 km 10",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Notas:

- El backend asigna automaticamente `tenant_id` desde el contexto.
- `activo` queda en `true` por default.
- Se registra auditoria con accion `establecimiento_created`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.4. Actualizar establecimiento

```http
PATCH /establecimientos/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |

Body:

```json
{
  "nombre": "Campo Norte Actualizado",
  "ubicacion": "Ruta 1 km 11",
  "activo": true
}
```

Todos los campos son opcionales.

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `nombre` | string | No | Maximo 150 caracteres |
| `ubicacion` | string | No | Maximo 300 caracteres |
| `activo` | boolean | No | `true` o `false` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "nombre": "Campo Norte Actualizado",
    "ubicacion": "Ruta 1 km 11",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z",
    "deleted_at": null
  }
}
```

Notas:

- No se permite cambiar `tenant_id`.
- Se registra auditoria con accion `establecimiento_updated`.
- Si `activo` pasa de `true` a `false`, tambien se registra `establecimiento_deactivated`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `404 NOT_FOUND`: establecimiento inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.5. Desactivar establecimiento

No hay endpoint separado. Se usa `PATCH /establecimientos/:id` enviando:

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
    "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "nombre": "Campo Norte",
    "ubicacion": "Ruta 1 km 10",
    "activo": false,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:05:00.000Z",
    "deleted_at": null
  }
}
```

Recomendacion frontend:

- Para baja logica visible al usuario, preferir `activo=false`.
- Para borrado real del listado, usar `DELETE`, que hace soft delete.

### 10.6. Eliminar establecimiento

```http
DELETE /establecimientos/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |

Ejemplo:

```http
DELETE /establecimientos/1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731
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
- Se registra auditoria con accion `establecimiento_deleted`.

Errores comunes:

- `404 NOT_FOUND`: establecimiento inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.7. Asignar usuario a establecimiento

```http
POST /establecimientos/:id/usuarios/:userId
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |
| `userId` | uuid | Si | ID del usuario a asignar |

No requiere body.

Ejemplo:

```http
POST /establecimientos/1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731/usuarios/e4560fcf-423c-4ebb-adc1-4d4259dadefe
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "1fdd266f-2c63-4ca7-9421-d601f5fdf921",
    "user_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "assigned_at": "2026-06-04T22:10:00.000Z"
  }
}
```

Notas:

- El usuario debe existir en el tenant actual.
- No se puede duplicar la misma asignacion.
- Se registra auditoria con accion `usuario_asignado`.

Errores comunes:

- `404 NOT_FOUND`: usuario no encontrado en este tenant.
- `404 NOT_FOUND`: establecimiento no encontrado.
- `409 ASSIGNMENT_CONFLICT`: el usuario ya esta asignado.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.8. Quitar usuario de establecimiento

```http
DELETE /establecimientos/:id/usuarios/:userId
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |
| `userId` | uuid | Si | ID del usuario a quitar |

Ejemplo:

```http
DELETE /establecimientos/1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731/usuarios/e4560fcf-423c-4ebb-adc1-4d4259dadefe
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "removed": true
  }
}
```

Notas:

- Se registra auditoria con accion `usuario_removido`.

Errores comunes:

- `404 ASSIGNMENT_NOT_FOUND`: la asignacion no existe.
- `404 NOT_FOUND`: establecimiento no encontrado.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.9. Listar usuarios asignados a un establecimiento

```http
GET /establecimientos/:id/usuarios
```

Roles:

- `admin_global`
- `supervisor`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del establecimiento |

Ejemplo:

```http
GET /establecimientos/1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731/usuarios
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "1fdd266f-2c63-4ca7-9421-d601f5fdf921",
      "user_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "assigned_at": "2026-06-04T22:10:00.000Z"
    }
  ]
}
```

Notas:

- Ordena por `assigned_at ASC`.
- `admin_global` puede listar usuarios de cualquier establecimiento del tenant.
- `supervisor` debe tener acceso al establecimiento.
- `operario` no puede usar este endpoint.

Errores comunes:

- `404 ESTABLECIMIENTO_NOT_FOUND`: no existe o el usuario no tiene acceso.
- `403 AUTH_FORBIDDEN`: rol no permitido.

### 10.10. Admin - Listar establecimientos

```http
GET /admin/establecimientos
```

Roles:

- `admin_global`

Query params:

Usa los mismos que `GET /establecimientos`.

Ejemplo:

```http
GET /admin/establecimientos?page=1&limit=20&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "nombre": "Campo Norte",
      "ubicacion": "Ruta 1 km 10",
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

- Hoy tiene comportamiento muy parecido al listado comun para `admin_global`.
- Es util si el frontend separa pantallas administrativas bajo rutas `/admin`.

## 11. Flujos recomendados para frontend

### Flujo de carga de pantalla de listado

1. Verificar que exista `access_token`.
2. Enviar `GET /establecimientos?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Si hay `403`, mostrar mensaje de permisos insuficientes.
6. Si hay `401`, redirigir a login o intentar refresh.

### Flujo de creacion

1. Validar en cliente que `nombre` no este vacio.
2. Enviar `POST /establecimientos`.
3. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
4. Si responde `400`, mostrar errores de validacion.

### Flujo de edicion

1. Cargar detalle con `GET /establecimientos/:id`.
2. Enviar solo campos modificados con `PATCH /establecimientos/:id`.
3. Si `activo=false`, tratarlo como desactivacion.
4. Refrescar detalle/listado.

### Flujo de asignacion de usuarios

1. Tener `establecimientoId`.
2. Tener `userId` del usuario a asignar.
3. Enviar `POST /establecimientos/:id/usuarios/:userId`.
4. Si responde `409 ASSIGNMENT_CONFLICT`, informar que ya esta asignado.
5. Refrescar `GET /establecimientos/:id/usuarios`.

## 12. Consideraciones de UI/UX

- Ocultar acciones de crear, editar, eliminar, asignar y quitar usuarios si el usuario no tiene `admin_global`.
- Ocultar listado de usuarios asignados para `operario`.
- Si el usuario tiene solo rol `admin`, no asumir permisos sobre este modulo.
- Para filtros, enviar `activo=true` por defecto si la pantalla solo muestra activos.
- Para busqueda, usar `q`.
- Para ordenamiento, limitar UI a `nombre` y `created_at`.
- Para eliminacion, pedir confirmacion porque usa soft delete.
- Para desactivacion, usar `PATCH` con `activo=false`, que conserva el registro visible si se consulta sin filtro de activos.

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
  "/establecimientos?page=1&limit=10&activo=true&sortBy=created_at&sortOrder=DESC"
);

const establecimientos = response.data;
const meta = response.meta;
```

### Crear

```ts
const response = await apiFetch("/establecimientos", {
  method: "POST",
  body: JSON.stringify({
    nombre: "Campo Norte",
    ubicacion: "Ruta 1 km 10"
  })
});

const nuevoEstablecimiento = response.data;
```

### Actualizar

```ts
const response = await apiFetch(`/establecimientos/${establecimientoId}`, {
  method: "PATCH",
  body: JSON.stringify({
    nombre: "Campo Norte Actualizado",
    activo: true
  })
});

const establecimientoActualizado = response.data;
```

### Asignar usuario

```ts
const response = await apiFetch(
  `/establecimientos/${establecimientoId}/usuarios/${userId}`,
  { method: "POST" }
);

const asignacion = response.data;
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Acciones administrativas se muestran solo para `admin_global`.
- Los filtros usan query params validos.
- Los formularios respetan maximos de longitud.
- `activo` se envia como boolean real en JSON, no como string.
- `page` y `limit` se envian como numeros en query.

