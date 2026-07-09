# Modulo Quimicos y Principios Activos - Guia para Frontend

## 1. Objetivo del modulo

El modulo de quimicos administra productos quimicos disponibles por establecimiento. Cada quimico pertenece a:

- Un tenant.
- Un establecimiento.
- Cero, uno o varios principios activos.

Los principios activos son catalogos globales. No dependen de un tenant ni de un establecimiento. Se usan para clasificar o describir la composicion de los quimicos.

Desde frontend, este modulo sirve para:

- Listar quimicos.
- Consultar el detalle de un quimico con sus principios activos.
- Crear quimicos para un establecimiento.
- Editar nombre, unidad de medida, estado activo y principios activos asociados.
- Desactivar quimicos con `activo=false`.
- Eliminar quimicos, si el usuario tiene permisos.
- Listar, crear, editar y eliminar principios activos.

Controladores del modulo:

- `QuimicosController`: rutas bajo `/quimicos`.
- `PrincipiosActivosController`: rutas bajo `/principios-activos`.
- `AdminQuimicosController`: ruta administrativa bajo `/admin/quimicos`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/quimicos
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de quimicos y principios activos requieren JWT.

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

Los quimicos son tenant-scoped. Siempre se consultan y modifican dentro del tenant actual.

Los principios activos son globales, pero sus endpoints tambien requieren JWT.

El tenant puede venir:

- Dentro del JWT como `tenant_id`.
- Por header `x-tenant-id`.
- Opcionalmente por header `x-tenant-key`, segun configuracion del backend.

Headers recomendados:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si falta tenant en endpoints de quimicos, el backend puede responder:

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
  "path": "/quimicos"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /quimicos` | Cualquier usuario autenticado |
| `GET /quimicos/:id` | Cualquier usuario autenticado |
| `POST /quimicos` | `supervisor`, `admin_global` |
| `PATCH /quimicos/:id` | `supervisor`, `admin_global` |
| `DELETE /quimicos/:id` | `admin_global` |
| `GET /admin/quimicos` | `admin_global` |
| `GET /principios-activos` | Cualquier usuario autenticado |
| `POST /principios-activos` | `admin_global` |
| `PATCH /principios-activos/:id` | `admin_global` |
| `DELETE /principios-activos/:id` | `admin_global` |

Notas:

- Listar y obtener quimicos no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear y actualizar quimicos requieren `supervisor` o `admin_global`.
- Eliminar quimicos requiere `admin_global`.
- Crear, editar y eliminar principios activos requiere `admin_global`.
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
  "path": "/quimicos"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `QUIMICO_FIELD_IMMUTABLE` | Se intento modificar un campo no permitido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Quimico o establecimiento no encontrado |
| `404` | `PRINCIPIO_ACTIVO_NOT_FOUND` | Principio activo no encontrado |
| `409` | `QUIMICO_NOMBRE_DUPLICADO` | Ya existe un quimico con ese nombre en el establecimiento |
| `409` | `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO` | Ya existe un principio activo con ese nombre |
| `409` | `PRINCIPIO_ACTIVO_REFERENCIADO` | El principio activo esta asociado a uno o mas quimicos |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

Cuando se envia un ID de principio activo inexistente en `principios_activos`, el backend responde `400 BAD_REQUEST` con detalle:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Principios activos no encontrados",
    "details": {
      "unknown_ids": [
        "00000000-0000-4000-8000-000000000000"
      ]
    }
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/quimicos"
}
```

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
  "path": "/quimicos"
}
```

## 8. Modelos de datos

### PrincipioActivo

```ts
type PrincipioActivo = {
  id: string;
  nombre: string;
  created_at: string;
  updated_at: string;
};
```

Ejemplo:

```json
{
  "id": "7b930d86-6267-4602-9c40-96c89356c361",
  "nombre": "Azoxistrobina",
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z"
}
```

### Quimico

```ts
type Quimico = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  nombre: string;
  unidad_medida: string;
  stock_actual: string | number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  principios_activos?: PrincipioActivo[];
};
```

Nota: `stock_actual` es una columna decimal. Dependiendo de TypeORM/driver puede llegar como string. Frontend debe tratarlo con cuidado si necesita operar numericamente.

Ejemplo:

```json
{
  "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fungicida A",
  "unidad_medida": "ml",
  "stock_actual": "0.000",
  "activo": true,
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null,
  "principios_activos": [
    {
      "id": "7b930d86-6267-4602-9c40-96c89356c361",
      "nombre": "Azoxistrobina",
      "created_at": "2026-06-04T19:03:01.913Z",
      "updated_at": "2026-06-04T19:03:01.913Z"
    }
  ]
}
```

## 9. DTOs usados por frontend

### CreatePrincipioActivoDto

Body para crear:

```ts
type CreatePrincipioActivoDto = {
  nombre: string;
};
```

Validaciones:

- `nombre`: obligatorio, string no vacio, maximo 100 caracteres.
- `nombre`: unico globalmente.

Ejemplo:

```json
{
  "nombre": "Azoxistrobina"
}
```

### UpdatePrincipioActivoDto

Body para actualizar:

```ts
type UpdatePrincipioActivoDto = {
  nombre: string;
};
```

Validaciones:

- `nombre`: obligatorio, string no vacio, maximo 100 caracteres.
- No puede duplicar el nombre de otro principio activo.

Ejemplo:

```json
{
  "nombre": "Azoxistrobina Actualizada"
}
```

### CreateQuimicoDto

Body para crear:

```ts
type CreateQuimicoDto = {
  establecimiento_id: string;
  nombre: string;
  unidad_medida: string;
  principios_activos?: string[];
};
```

Validaciones:

- `establecimiento_id`: obligatorio, UUID.
- `nombre`: obligatorio, string no vacio, maximo 150 caracteres.
- `unidad_medida`: obligatorio, string no vacio, maximo 30 caracteres.
- `principios_activos`: opcional, array de UUIDs.

Reglas de negocio:

- El establecimiento debe existir dentro del tenant actual.
- No puede existir otro quimico con el mismo `nombre`, mismo `establecimiento_id` y mismo tenant.
- Si se envia `principios_activos`, todos los IDs deben existir.
- `stock_actual` se crea siempre en `0`.
- `activo` queda en `true` por default.

Ejemplo:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fungicida A",
  "unidad_medida": "ml",
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Ejemplo sin principios activos:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fertilizante B",
  "unidad_medida": "kg"
}
```

### UpdateQuimicoDto

Body para actualizar:

```ts
type UpdateQuimicoDto = {
  nombre?: string;
  unidad_medida?: string;
  activo?: boolean;
  principios_activos?: string[];
};
```

Validaciones:

- `nombre`: opcional, string no vacio, maximo 150 caracteres.
- `unidad_medida`: opcional, string no vacio, maximo 30 caracteres.
- `activo`: opcional, boolean.
- `principios_activos`: opcional, array de UUIDs.

Importante:

- Solo se pueden modificar `nombre`, `unidad_medida`, `activo` y `principios_activos`.
- `establecimiento_id`, `tenant_id` y `stock_actual` no se pueden modificar desde este endpoint.
- Si se envia `principios_activos`, reemplaza por completo la asociacion anterior.
- Para quitar todos los principios activos, enviar `principios_activos: []`.

Ejemplo:

```json
{
  "nombre": "Fungicida A Actualizado",
  "unidad_medida": "ml",
  "activo": true,
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Ejemplo para quitar asociaciones:

```json
{
  "principios_activos": []
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
    "code": "QUIMICO_FIELD_IMMUTABLE",
    "message": "Solo se pueden modificar: nombre, unidad_medida, activo, principios_activos"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/quimicos/f0c6de8c-513f-4a8d-b104-870d627325b8"
}
```

### QueryQuimicosDto

Query params para listados:

```ts
type QueryQuimicosDto = {
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
/quimicos?page=1&limit=10&q=fungicida&establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&activo=true&sortBy=nombre&sortOrder=ASC
```

## 10. Endpoints de principios activos

### 10.1. Listar principios activos

```http
GET /principios-activos
```

Roles:

- Cualquier usuario autenticado.

Headers:

```http
Authorization: Bearer <access_token>
x-tenant-id: <tenant_id>
```

No recibe query params.

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "7b930d86-6267-4602-9c40-96c89356c361",
      "nombre": "Azoxistrobina",
      "created_at": "2026-06-04T19:03:01.913Z",
      "updated_at": "2026-06-04T19:03:01.913Z"
    }
  ]
}
```

Notas:

- Devuelve todos los principios activos.
- Ordena por `nombre ASC`.
- No es paginado.

Errores comunes:

- `401 AUTH_INVALID`: token invalido o ausente.

### 10.2. Crear principio activo

```http
POST /principios-activos
```

Roles:

- `admin_global`

Body:

```json
{
  "nombre": "Azoxistrobina"
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "7b930d86-6267-4602-9c40-96c89356c361",
    "nombre": "Azoxistrobina",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z"
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.
- `409 PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`: nombre duplicado.

### 10.3. Actualizar principio activo

```http
PATCH /principios-activos/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del principio activo |

Body:

```json
{
  "nombre": "Azoxistrobina Actualizada"
}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "7b930d86-6267-4602-9c40-96c89356c361",
    "nombre": "Azoxistrobina Actualizada",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z"
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `404 PRINCIPIO_ACTIVO_NOT_FOUND`: no existe.
- `409 PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`: nombre duplicado.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.4. Eliminar principio activo

```http
DELETE /principios-activos/:id
```

Roles:

- `admin_global`

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

- Elimina fisicamente el principio activo.
- Si esta asociado a uno o mas quimicos, no permite eliminar.

Error por referencia:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "PRINCIPIO_ACTIVO_REFERENCIADO",
    "message": "No se puede eliminar: este principio activo esta siendo usado por uno o mas quimicos"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/principios-activos/7b930d86-6267-4602-9c40-96c89356c361"
}
```

## 11. Endpoints de quimicos

### 11.1. Listar quimicos

```http
GET /quimicos
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
GET /quimicos?page=1&limit=10&q=fungicida&activo=true&sortBy=nombre&sortOrder=ASC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Fungicida A",
      "unidad_medida": "ml",
      "stock_actual": "0.000",
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

Notas:

- El listado no incluye necesariamente `principios_activos`.
- Para ver principios asociados, usar `GET /quimicos/:id`.

Errores comunes:

- `401 AUTH_INVALID`: token invalido o ausente.
- `400 TENANT_REQUIRED`: falta tenant.
- `400 BAD_REQUEST`: query invalida.

### 11.2. Obtener quimico por ID

```http
GET /quimicos/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del quimico |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Fungicida A",
    "unidad_medida": "ml",
    "stock_actual": "0.000",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null,
    "principios_activos": [
      {
        "id": "7b930d86-6267-4602-9c40-96c89356c361",
        "nombre": "Azoxistrobina",
        "created_at": "2026-06-04T19:03:01.913Z",
        "updated_at": "2026-06-04T19:03:01.913Z"
      }
    ]
  }
}
```

Errores comunes:

- `404 NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 11.3. Crear quimico

```http
POST /quimicos
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fungicida A",
  "unidad_medida": "ml",
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `establecimiento_id` | uuid | Si | Debe existir en el tenant |
| `nombre` | string | Si | No vacio, maximo 150 caracteres |
| `unidad_medida` | string | Si | No vacio, maximo 30 caracteres |
| `principios_activos` | uuid[] | No | Todos los IDs deben existir |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Fungicida A",
    "unidad_medida": "ml",
    "stock_actual": "0.000",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null,
    "principios_activos": [
      {
        "id": "7b930d86-6267-4602-9c40-96c89356c361",
        "nombre": "Azoxistrobina",
        "created_at": "2026-06-04T19:03:01.913Z",
        "updated_at": "2026-06-04T19:03:01.913Z"
      }
    ]
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: body invalido o principios activos inexistentes.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 NOT_FOUND`: establecimiento inexistente o fuera del tenant.
- `409 QUIMICO_NOMBRE_DUPLICADO`: ya existe un quimico con ese nombre en ese establecimiento.

### 11.4. Actualizar quimico

```http
PATCH /quimicos/:id
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "nombre": "Fungicida A Actualizado",
  "unidad_medida": "ml",
  "activo": true,
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Todos los campos son opcionales.

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `nombre` | string | No | No vacio, maximo 150 caracteres |
| `unidad_medida` | string | No | No vacio, maximo 30 caracteres |
| `activo` | boolean | No | `true` o `false` |
| `principios_activos` | uuid[] | No | Todos los IDs deben existir |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Fungicida A Actualizado",
    "unidad_medida": "ml",
    "stock_actual": "0.000",
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z",
    "deleted_at": null,
    "principios_activos": []
  }
}
```

Reglas importantes:

- Solo se pueden modificar `nombre`, `unidad_medida`, `activo` y `principios_activos`.
- Si se envia `principios_activos`, reemplaza toda la lista asociada.
- Para borrar todas las asociaciones, enviar `principios_activos: []`.
- No se puede modificar `establecimiento_id`.
- No se puede modificar `stock_actual` desde este endpoint.
- Si cambia `nombre`, se valida duplicado dentro del mismo establecimiento y tenant.

Errores comunes:

- `400 BAD_REQUEST`: body invalido o principios activos inexistentes.
- `400 QUIMICO_FIELD_IMMUTABLE`: body contiene campos no permitidos.
- `404 NOT_FOUND`: quimico inexistente o fuera del tenant.
- `409 QUIMICO_NOMBRE_DUPLICADO`: nuevo nombre duplicado en el establecimiento.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 11.5. Desactivar quimico

No hay endpoint separado. Se usa:

```http
PATCH /quimicos/:id
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
    "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "nombre": "Fungicida A",
    "unidad_medida": "ml",
    "stock_actual": "0.000",
    "activo": false,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:05:00.000Z",
    "deleted_at": null,
    "principios_activos": []
  }
}
```

### 11.6. Eliminar quimico

```http
DELETE /quimicos/:id
```

Roles:

- `admin_global`

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
- Se registra auditoria con accion `quimico_deleted`.

Errores comunes:

- `404 NOT_FOUND`: quimico inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 11.7. Admin - Listar quimicos

```http
GET /admin/quimicos
```

Roles:

- `admin_global`

Query params:

Usa los mismos que `GET /quimicos`.

Ejemplo:

```http
GET /admin/quimicos?page=1&limit=20&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "nombre": "Fungicida A",
      "unidad_medida": "ml",
      "stock_actual": "0.000",
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

## 12. Flujos recomendados para frontend

### Flujo de carga de listado de quimicos

1. Verificar que exista `access_token`.
2. Enviar `GET /quimicos?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, activo y busqueda `q`.
6. Si se quieren ver solo activos, enviar `activo=true`.

### Flujo de creacion de quimico

1. Cargar establecimientos disponibles.
2. Cargar `GET /principios-activos`.
3. Validar `establecimiento_id`, `nombre` y `unidad_medida`.
4. Permitir seleccionar cero, uno o varios principios activos.
5. Enviar `POST /quimicos`.
6. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
7. Si responde `409 QUIMICO_NOMBRE_DUPLICADO`, mostrar que ya existe un quimico con ese nombre en el establecimiento.

### Flujo de edicion de quimico

1. Cargar detalle con `GET /quimicos/:id`.
2. Cargar catalogo con `GET /principios-activos`.
3. Permitir editar solo `nombre`, `unidad_medida`, `activo` y principios activos.
4. Enviar `PATCH /quimicos/:id`.
5. Recordar que `principios_activos` reemplaza la asociacion completa.
6. Nunca enviar `establecimiento_id`, `tenant_id` ni `stock_actual`.

### Flujo de principios activos

1. Listar con `GET /principios-activos`.
2. Para crear, enviar `POST /principios-activos`.
3. Para editar, enviar `PATCH /principios-activos/:id`.
4. Para eliminar, enviar `DELETE /principios-activos/:id`.
5. Si responde `PRINCIPIO_ACTIVO_REFERENCIADO`, informar que no puede eliminarse porque esta siendo usado por quimicos.

### Flujo de eliminacion de quimico

1. Mostrar confirmacion.
2. Enviar `DELETE /quimicos/:id`.
3. Si responde `200`, quitarlo del listado o refrescar.
4. Si responde `403`, ocultar esta accion para el rol actual.

## 13. Consideraciones de UI/UX

- Mostrar crear y editar quimicos solo para `supervisor` o `admin_global`.
- Mostrar eliminar quimico solo para `admin_global`.
- Mostrar crear, editar y eliminar principios activos solo para `admin_global`.
- Mostrar `stock_actual` como solo lectura.
- Mostrar `establecimiento_id` como seleccionable solo al crear quimico.
- En edicion, mostrar establecimiento como solo lectura o no mostrarlo como campo editable.
- En la edicion de principios activos de un quimico, usar un multiselect.
- Al guardar principios activos, enviar todos los seleccionados, no solo los cambios.
- Para quitar todos, enviar `principios_activos: []`.
- Si frontend no quiere mostrar inactivos por defecto, debe enviar `activo=true`, porque el backend no aplica ese filtro automaticamente.
- Mostrar mensajes especificos para `QUIMICO_NOMBRE_DUPLICADO`, `QUIMICO_FIELD_IMMUTABLE`, `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO` y `PRINCIPIO_ACTIVO_REFERENCIADO`.

## 14. Ejemplos con fetch

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

### Listar principios activos

```ts
const response = await apiFetch("/principios-activos");
const principiosActivos = response.data;
```

### Crear principio activo

```ts
const response = await apiFetch("/principios-activos", {
  method: "POST",
  body: JSON.stringify({
    nombre: "Azoxistrobina"
  })
});

const principioActivo = response.data;
```

### Listar quimicos

```ts
const response = await apiFetch(
  "/quimicos?page=1&limit=10&activo=true&sortBy=created_at&sortOrder=DESC"
);

const quimicos = response.data;
const meta = response.meta;
```

### Crear quimico

```ts
const response = await apiFetch("/quimicos", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    nombre: "Fungicida A",
    unidad_medida: "ml",
    principios_activos: [principioActivoId]
  })
});

const nuevoQuimico = response.data;
```

### Obtener quimico

```ts
const response = await apiFetch(`/quimicos/${quimicoId}`);
const quimico = response.data;
```

### Actualizar quimico

```ts
const response = await apiFetch(`/quimicos/${quimicoId}`, {
  method: "PATCH",
  body: JSON.stringify({
    nombre: "Fungicida A Actualizado",
    unidad_medida: "ml",
    activo: true,
    principios_activos: [principioActivoId]
  })
});

const quimicoActualizado = response.data;
```

### Quitar todos los principios activos

```ts
const response = await apiFetch(`/quimicos/${quimicoId}`, {
  method: "PATCH",
  body: JSON.stringify({
    principios_activos: []
  })
});

const quimicoActualizado = response.data;
```

### Desactivar quimico

```ts
const response = await apiFetch(`/quimicos/${quimicoId}`, {
  method: "PATCH",
  body: JSON.stringify({
    activo: false
  })
});

const quimicoDesactivado = response.data;
```

### Eliminar quimico

```ts
await apiFetch(`/quimicos/${quimicoId}`, {
  method: "DELETE"
});
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear quimico valida `establecimiento_id`.
- Crear quimico valida `nombre` obligatorio.
- Crear quimico valida `unidad_medida` obligatoria.
- `nombre` de quimico no supera 150 caracteres.
- `unidad_medida` no supera 30 caracteres.
- En PATCH de quimico solo se envian `nombre`, `unidad_medida`, `activo` y `principios_activos`.
- En PATCH de quimico no se envia `establecimiento_id`.
- En PATCH de quimico no se envia `stock_actual`.
- `activo` se envia como boolean real en JSON, no como string.
- Principios activos se cargan desde `GET /principios-activos`.
- `principios_activos` se envia como array de UUIDs.
- La UI maneja `QUIMICO_NOMBRE_DUPLICADO`.
- La UI maneja `QUIMICO_FIELD_IMMUTABLE`.
- La UI maneja `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`.
- La UI maneja `PRINCIPIO_ACTIVO_REFERENCIADO`.
- Crear/editar quimicos se muestran solo para `supervisor` o `admin_global`.
- Eliminar quimicos se muestra solo para `admin_global`.
- Crear/editar/eliminar principios activos se muestra solo para `admin_global`.
- Si se quieren listar solo activos, enviar `activo=true`.

Cambios en el módulo de Químicos (M05) — Nuevos campos en el modelo de Químico

Se agregaron 7 campos nuevos al endpoint de químicos.

Campos nuevos

Campo	Tipo	Obligatorio	Descripción
unidad_stock	enum	Sí	Unidad en que se mide el stock: kg, g, l, ml
rate_unidad	enum	Sí	Unidad de la dosis de aplicación: kg/l, g/l, ml/l, l/l
nombre_lista	boolean	No (default false)	true si el nombre fue elegido de una lista predefinida, false si fue escrito manualmente
withholding_period_dias	integer	No	Días de carencia tras aplicación. null = sin carencia
manufacture_date	date	No	Fecha de fabricación. Formato "YYYY-MM-DD"
dom	date	No	Fecha de vencimiento. Formato "YYYY-MM-DD"
supplier	string	No	Proveedor de compra del químico
POST /quimicos — Crear químico

unidad_stock y rate_unidad son requeridos. Si se omiten, la API devuelve 400.


{
  "establecimiento_id": "...",
  "nombre": "Fungicida X",
  "unidad_medida": "litros",
  "unidad_stock": "l",
  "rate_unidad": "mL/L",
  "nombre_lista": true,
  "withholding_period_dias": 7,
  "manufacture_date": "2024-03-01",
  "dom": "2026-03-01",
  "supplier": "AgroInsumos SA"
}
PATCH /quimicos/:id — Actualizar

Todos los campos nuevos son opcionales en el update. Solo enviá los que cambian.

GET /quimicos — Respuesta

Todos los registros devuelven los 7 campos nuevos. Los que no tengan valor vienen null (o false en el caso de nombre_lista).


{
  "id": "...",
  "nombre": "Fungicida X",
  "unidad_medida": "litros",
  "stock_actual": "2.500",
  "activo": true,
  "unidad_stock": "l",
  "rate_unidad": "mL/L",
  "nombre_lista": false,
  "withholding_period_dias": 7,
  "manufacture_date": "2024-03-01",
  "dom": "2026-03-01",
  "supplier": null
}
Valores válidos

unidad_stock: "kg" · "g" · "l" · "ml"

rate_unidad: "kg/L" · "g/L" · "mL/L" · "L/L" (actualizado — antes se aceptaba en minúsculas, ver sección "Cambios recientes" al final del documento)

Nota para M06 y M09

unidad_stock y rate_unidad van a ser consumidos por los módulos de movimientos de stock (M06) y aplicaciones químicas (M09) para mostrar las unidades correctas al registrar entradas/salidas y dosificaciones. Por ahora el front puede guardarlos sin lógica adicional — la integración viene en una query separada.

## Cambios recientes — Nomenclatura de `rate_unidad` (2026-07-08)

`rate_unidad` cambió de notación en minúsculas a notación estándar con "L" (litro) en mayúscula. Esto afecta a `Quimico.rate_unidad` y también a `AplicacionQuimica.dosis_unidad` (comparten el mismo enum en base de datos).

| Valor anterior | Valor nuevo |
| --- | --- |
| `kg/l` | `kg/L` |
| `g/l` | `g/L` |
| `ml/l` | `mL/L` |
| `l/l` | `L/L` |

- Los registros existentes se migraron automáticamente en el backend — no requiere backfill del front.
- Enviar los valores viejos (minúsculas) ahora devuelve `400 BAD_REQUEST`.
- `unidad_medida` (`kg`/`l`) **no** cambió — solo `rate_unidad`/`dosis_unidad`.

## Cambios recientes — Eliminación del módulo Recetas (2026-07-08)

El módulo de Recetas (`/recetas`, `/admin/recetas`) se eliminó por completo. Ya no existe ningún campo `receta_id` en ningún endpoint del backend. Si el front tenía pantallas o referencias a recetas, deben quitarse.