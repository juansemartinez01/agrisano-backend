# Modulo Lotes - Guia para Frontend

## 1. Objetivo del modulo

El modulo de lotes administra los lotes de insumos usados por el sistema. Actualmente contempla dos tipos:

- `semilla`
- `sustrato`

Cada lote pertenece a un tenant y puede ser usado por otros modulos, por ejemplo bandejas. Por eso el backend impide eliminar un lote si esta referenciado por una o mas bandejas.

Desde frontend, este modulo sirve para:

- Listar lotes del tenant actual.
- Consultar el detalle de un lote.
- Crear lotes de semilla o sustrato.
- Editar datos de un lote.
- Desactivar lotes con `activo=false`.
- Eliminar lotes, si el usuario tiene permisos y el lote no esta en uso.

El modulo esta dividido en dos controladores:

- `LotesController`: rutas bajo `/lotes`.
- `AdminLotesController`: ruta administrativa bajo `/admin/lotes`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/lotes
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de lotes requieren JWT.

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

El sistema es multi-tenant. Los lotes siempre se consultan y modifican dentro del tenant actual.

El tenant puede venir:

- Dentro del JWT como `tenant_id`.
- Por header `x-tenant-id`.
- Opcionalmente por header `x-tenant-key`, segun configuracion del backend.

Headers recomendados:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si falta tenant en endpoints que usan `strictTenant`, el backend puede responder:

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
  "path": "/lotes"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /lotes` | Cualquier usuario autenticado |
| `GET /lotes/:id` | Cualquier usuario autenticado |
| `POST /lotes` | `supervisor`, `admin_global` |
| `PATCH /lotes/:id` | `supervisor`, `admin_global` |
| `DELETE /lotes/:id` | `admin_global` |
| `GET /admin/lotes` | `admin_global` |

Notas:

- Listar y obtener lote no tienen decorador `@Roles`, pero siguen requiriendo JWT.
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
  "path": "/lotes?page=1&limit=10"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `LOTE_TIPO_IMMUTABLE` | Se intento modificar `tipo` en PATCH |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Lote no encontrado o fuera del tenant |
| `404` | `PROVEEDOR_NOT_FOUND` | `proveedor_id` (o `proveedor_semilla_id`) no existe o es de otro tenant |
| `404` | `MARCA_NOT_FOUND` | `marca_id` no existe o es de otro tenant |
| `404` | `PRODUCTO_NOT_FOUND` / `VARIEDAD_NOT_FOUND` | `producto_id`/`variedad_id` no existe o es de otro tenant |
| `422` | `VARIEDAD_PRODUCTO_MISMATCH` | La `variedad_id` indicada no pertenece al `producto_id` indicado |
| `422` | `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` | Se envio `proveedor_semilla_id` en un lote de tipo `sustrato` |
| `422` | `LOTE_PRODUCTO_NO_PERMITIDO` | Se envio `producto_id`/`variedad_id` en un lote de tipo `sustrato` |
| `409` | `LOTE_NUMERO_DUPLICADO` | Ya existe un lote con ese `numero_lote` para ese `tipo` |
| `409` | `LOTE_REFERENCED_BY_BANDEJA` | El lote esta referenciado por bandejas |
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
    "message": "numero_lote should not be empty",
    "details": {
      "validationErrors": [
        {
          "message": "numero_lote should not be empty"
        }
      ]
    }
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/lotes"
}
```

## 8. Modelo de datos

### Lote

```ts
type LoteTipo = "semilla" | "sustrato";

type Lote = {
  id: string;
  tenant_id: string | null;
  tipo: LoteTipo;
  numero_lote: string;
  establecimiento_id: string | null;
  proveedor_id: string | null;       // uuid — proveedor del lote (proveedores)
  marca_id: string | null;           // uuid — marca del insumo (marcas)
  observaciones: string | null;      // maximo 2000 caracteres
  activo: boolean;
  // Campos exclusivos de tipo "semilla" — quedan null en lotes de tipo "sustrato"
  producto_id: string | null;        // uuid — catalogo productos
  variedad_id: string | null;        // uuid — catalogo variedades, debe pertenecer a producto_id
  batch: string | null;
  proveedor_semilla_id: string | null; // uuid — proveedor especifico de la semilla
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo (lote de semilla):

```json
{
  "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "tipo": "semilla",
  "numero_lote": "SEM-2026-001",
  "establecimiento_id": null,
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "marca_id": null,
  "observaciones": "Lote inicial de prueba",
  "activo": true,
  "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
  "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
  "batch": "BT-4421",
  "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
}
```

Ejemplo (lote de sustrato — campos de semilla en `null`):

```json
{
  "id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "tipo": "sustrato",
  "numero_lote": "SUS-2026-001",
  "establecimiento_id": null,
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "marca_id": null,
  "observaciones": null,
  "activo": true,
  "producto_id": null,
  "variedad_id": null,
  "batch": null,
  "proveedor_semilla_id": null,
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
}
```

## 9. DTOs usados por frontend

### CreateLoteDto

Body para crear:

```ts
type CreateLoteDto = {
  tipo: "semilla" | "sustrato";
  numero_lote: string;
  establecimiento_id?: string;      // uuid
  proveedor_id: string;             // uuid — requerido siempre, sin importar tipo
  marca_id?: string;                // uuid
  observaciones?: string;           // maximo 2000 caracteres
  // Solo si tipo = "semilla" (obligatorios en ese caso; rechazados con 422 si tipo = "sustrato")
  producto_id?: string;             // uuid
  variedad_id?: string;             // uuid, debe pertenecer a producto_id
  proveedor_semilla_id?: string;    // uuid
  batch?: string;                   // opcional incluso para semilla, maximo 100 caracteres
};
```

Validaciones:

- `tipo`: obligatorio. Valores permitidos: `semilla`, `sustrato`.
- `numero_lote`: obligatorio, string no vacio, maximo 100 caracteres.
- `establecimiento_id`: opcional, uuid.
- `proveedor_id`: **obligatorio** (uuid), sin importar el `tipo`. No es opcional pese a que la columna en base permite `null`.
- `marca_id`: opcional, uuid.
- `observaciones`: opcional, string, maximo 2000 caracteres.
- `producto_id`, `variedad_id`, `proveedor_semilla_id`: obligatorios (uuid) unicamente cuando `tipo === "semilla"`. Si se envian con `tipo === "sustrato"`, el backend los **rechaza** con `422` (no los ignora silenciosamente).
- `batch`: opcional, string, maximo 100 caracteres (aplica a cualquier `tipo`, aunque en la practica solo tiene sentido para semilla).
- Cruce de validacion: `variedad_id` debe pertenecer a `producto_id` (mismo `producto_id` en la fila de `variedades`), sino `422 VARIEDAD_PRODUCTO_MISMATCH`.

Ejemplo (semilla):

```json
{
  "tipo": "semilla",
  "numero_lote": "SEM-2026-001",
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
  "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
  "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
  "batch": "BT-4421",
  "observaciones": "Lote inicial de prueba"
}
```

Ejemplo (sustrato — los campos de semilla NO deben enviarse):

```json
{
  "tipo": "sustrato",
  "numero_lote": "SUS-2026-001",
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f"
}
```

Regla de unicidad:

- No puede existir otro lote con el mismo `numero_lote`, mismo `tipo` y mismo tenant.
- Puede existir el mismo `numero_lote` si el `tipo` es distinto.

### UpdateLoteDto

Body para actualizar:

```ts
type UpdateLoteDto = {
  numero_lote?: string;
  establecimiento_id?: string;
  proveedor_id?: string;
  marca_id?: string;
  observaciones?: string;
  activo?: boolean;
  producto_id?: string;
  variedad_id?: string;
  proveedor_semilla_id?: string;
  batch?: string;
};
```

Validaciones: mismas reglas de tipo/formato que en `CreateLoteDto`, pero todos los campos son opcionales (incluido `proveedor_id`, que en update no es obligatorio). La misma regla de "semilla-only" aplica: si el lote es de `tipo === "sustrato"`, enviar `producto_id`/`variedad_id`/`proveedor_semilla_id` sigue siendo rechazado con `422`.

Importante: `tipo` no se puede actualizar. Si frontend envia `tipo` en un `PATCH`, el backend responde:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "LOTE_TIPO_IMMUTABLE",
    "message": "El campo tipo no puede ser modificado"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/lotes/f5c43121-22b4-43e8-9a85-e4f4bbcf97bb"
}
```

Ejemplo valido:

```json
{
  "numero_lote": "SEM-2026-001-A",
  "observaciones": "Actualizado desde frontend",
  "activo": true
}
```

### QueryLotesDto

Query params para listados:

```ts
type QueryLotesDto = {
  page?: number;
  limit?: number;
  q?: string;
  tipo?: "semilla" | "sustrato";
  activo?: boolean;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `q`: opcional, string. Busca solo por `numero_lote` (`ILIKE`). No busca por proveedor ni ningun otro campo.
- `tipo`: opcional. Valores permitidos: `semilla`, `sustrato`.
- `activo`: opcional, boolean. Acepta `true` o `false`.
- `sortBy`: opcional. Valores realmente permitidos por el servicio: `numero_lote`, `created_at`. (`proveedor` NO es un campo de ordenamiento valido; ya no existe como campo del modelo.)
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.
- Si `sortBy` no es permitido, el backend ordena por `created_at DESC`.

Ejemplo:

```txt
/lotes?page=1&limit=10&q=SEM&tipo=semilla&activo=true&sortBy=numero_lote&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar lotes

```http
GET /lotes
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
| `q` | string | No | - | Busca solo por `numero_lote` (ILIKE) |
| `tipo` | string | No | - | `semilla` o `sustrato` |
| `activo` | boolean | No | - | Filtra activos/inactivos |
| `sortBy` | string | No | `created_at` | `numero_lote` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /lotes?page=1&limit=10&q=SEM&tipo=semilla&activo=true&sortBy=numero_lote&sortOrder=ASC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "tipo": "semilla",
      "numero_lote": "SEM-2026-001",
      "establecimiento_id": null,
      "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
      "marca_id": null,
      "observaciones": "Lote inicial de prueba",
      "activo": true,
      "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
      "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
      "batch": "BT-4421",
      "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
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
- `400 BAD_REQUEST`: query invalida, por ejemplo `tipo=otro`.

### 10.2. Obtener lote por ID

```http
GET /lotes/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del lote |

Ejemplo:

```http
GET /lotes/f5c43121-22b4-43e8-9a85-e4f4bbcf97bb
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tipo": "semilla",
    "numero_lote": "SEM-2026-001",
    "establecimiento_id": null,
    "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
    "marca_id": null,
    "observaciones": "Lote inicial de prueba",
    "activo": true,
    "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
    "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
    "batch": "BT-4421",
    "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Errores comunes:

- `404 NOT_FOUND`: no existe o no pertenece al tenant actual.
- `401 AUTH_INVALID`: token invalido o ausente.
- `400 TENANT_REQUIRED`: falta tenant.

### 10.3. Crear lote

```http
POST /lotes
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "tipo": "semilla",
  "numero_lote": "SEM-2026-001",
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
  "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
  "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
  "batch": "BT-4421",
  "observaciones": "Lote inicial de prueba"
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `tipo` | string | Si | `semilla` o `sustrato` |
| `numero_lote` | string | Si | No vacio, maximo 100 caracteres |
| `establecimiento_id` | uuid | No | - |
| `proveedor_id` | uuid | Si | Siempre requerido, sin importar `tipo` |
| `marca_id` | uuid | No | - |
| `observaciones` | string | No | Maximo 2000 caracteres |
| `producto_id` | uuid | Si, solo si `tipo=semilla` | Rechazado (422) si `tipo=sustrato` |
| `variedad_id` | uuid | Si, solo si `tipo=semilla` | Debe pertenecer a `producto_id`; rechazado (422) si `tipo=sustrato` |
| `proveedor_semilla_id` | uuid | Si, solo si `tipo=semilla` | Rechazado (422) si `tipo=sustrato` |
| `batch` | string | No | Maximo 100 caracteres |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tipo": "semilla",
    "numero_lote": "SEM-2026-001",
    "establecimiento_id": null,
    "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
    "marca_id": null,
    "observaciones": "Lote inicial de prueba",
    "activo": true,
    "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
    "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
    "batch": "BT-4421",
    "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Notas:

- El backend asigna automaticamente `tenant_id` desde el contexto.
- `activo` queda en `true` por default.
- Se registra auditoria con accion `lote_created`.
- Antes de crear, valida que no exista otro lote con mismo `tenant_id`, `tipo` y `numero_lote`.
- `proveedor_id` se valida contra el catalogo `proveedores` (`404 PROVEEDOR_NOT_FOUND` si no existe). Igual para `marca_id` (`404 MARCA_NOT_FOUND`) y `producto_id`/`variedad_id` (`404 PRODUCTO_NOT_FOUND` / `VARIEDAD_NOT_FOUND`).

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 PROVEEDOR_NOT_FOUND` / `MARCA_NOT_FOUND` / `PRODUCTO_NOT_FOUND` / `VARIEDAD_NOT_FOUND`: catalogo referenciado inexistente.
- `422 VARIEDAD_PRODUCTO_MISMATCH`: `variedad_id` no pertenece a `producto_id`.
- `422 LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` / `LOTE_PRODUCTO_NO_PERMITIDO`: se enviaron campos de semilla en un lote `sustrato`.
- `409 LOTE_NUMERO_DUPLICADO`: lote duplicado para ese tipo.

Ejemplo de duplicado:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "LOTE_NUMERO_DUPLICADO",
    "message": "Ya existe un lote con numero_lote 'SEM-2026-001' para tipo 'semilla'"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/lotes"
}
```

### 10.4. Actualizar lote

```http
PATCH /lotes/:id
```

Roles:

- `supervisor`
- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del lote |

Body:

```json
{
  "numero_lote": "SEM-2026-001-A",
  "observaciones": "Actualizado desde frontend",
  "activo": true
}
```

Todos los campos son opcionales, pero si se envia `numero_lote` no puede ser string vacio.

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `numero_lote` | string | No | No vacio, maximo 100 caracteres |
| `establecimiento_id` | uuid | No | - |
| `proveedor_id` | uuid | No | - |
| `marca_id` | uuid | No | - |
| `observaciones` | string | No | Maximo 2000 caracteres |
| `producto_id` / `variedad_id` / `proveedor_semilla_id` | uuid | No | Solo validos si el lote es `tipo=semilla`; rechazados (422) si el lote es `tipo=sustrato` |
| `batch` | string | No | Maximo 100 caracteres |
| `activo` | boolean | No | `true` o `false` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tipo": "semilla",
    "numero_lote": "SEM-2026-001-A",
    "establecimiento_id": null,
    "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
    "marca_id": null,
    "observaciones": "Actualizado desde frontend",
    "activo": true,
    "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
    "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
    "batch": "BT-4421",
    "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z",
    "deleted_at": null
  }
}
```

Reglas importantes:

- `tipo` es inmutable. No enviarlo en PATCH.
- Si se cambia `numero_lote`, el backend valida unicidad contra lotes del mismo tenant y mismo tipo.
- No se permite cambiar `tenant_id`.
- Se registra auditoria con accion `lote_updated`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 LOTE_TIPO_IMMUTABLE`: se envio `tipo`.
- `404 NOT_FOUND`: lote inexistente o fuera del tenant.
- `404 PROVEEDOR_NOT_FOUND` / `MARCA_NOT_FOUND` / `PRODUCTO_NOT_FOUND` / `VARIEDAD_NOT_FOUND`: catalogo referenciado inexistente.
- `422 VARIEDAD_PRODUCTO_MISMATCH`: `variedad_id` no pertenece a `producto_id`.
- `422 LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` / `LOTE_PRODUCTO_NO_PERMITIDO`: se enviaron campos de semilla en un lote `sustrato`.
- `409 LOTE_NUMERO_DUPLICADO`: nuevo numero duplicado para ese tipo.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 10.5. Desactivar lote

No hay endpoint separado. Se usa:

```http
PATCH /lotes/:id
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
    "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tipo": "semilla",
    "numero_lote": "SEM-2026-001",
    "establecimiento_id": null,
    "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
    "marca_id": null,
    "observaciones": "Lote desactivado desde frontend",
    "activo": false,
    "producto_id": "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
    "variedad_id": "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
    "batch": "BT-4421",
    "proveedor_semilla_id": "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:05:00.000Z",
    "deleted_at": null
  }
}
```

Recomendacion frontend:

- Usar `activo=false` para baja logica.
- Usar `DELETE` solo cuando se quiera soft delete y el usuario tenga `admin_global`.

### 10.6. Eliminar lote

```http
DELETE /lotes/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del lote |

Ejemplo:

```http
DELETE /lotes/f5c43121-22b4-43e8-9a85-e4f4bbcf97bb
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
- Antes de eliminar, el backend consulta si el lote esta usado en `bandejas` como `lote_semilla_id` o `lote_sustrato_id`.
- Si esta referenciado, no lo elimina.
- Se registra auditoria con accion `lote_deleted`.

Error por lote referenciado:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "LOTE_REFERENCED_BY_BANDEJA",
    "message": "El lote esta referenciado por una o mas bandejas y no puede ser eliminado"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/lotes/f5c43121-22b4-43e8-9a85-e4f4bbcf97bb"
}
```

Errores comunes:

- `404 NOT_FOUND`: lote inexistente o fuera del tenant.
- `409 LOTE_REFERENCED_BY_BANDEJA`: lote en uso.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

### 10.7. Admin - Listar lotes

```http
GET /admin/lotes
```

Roles:

- `admin_global`

Query params:

Usa los mismos que `GET /lotes`.

Ejemplo:

```http
GET /admin/lotes?page=1&limit=20&tipo=sustrato&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "tipo": "sustrato",
      "numero_lote": "SUS-2026-001",
      "establecimiento_id": null,
      "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
      "marca_id": null,
      "observaciones": null,
      "activo": true,
      "producto_id": null,
      "variedad_id": null,
      "batch": null,
      "proveedor_semilla_id": null,
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
2. Enviar `GET /lotes?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por `tipo`, `activo` y busqueda `q`.
6. Si hay `401`, redirigir a login o intentar refresh.
7. Si hay `400 BAD_REQUEST`, revisar query params enviados.

### Flujo de creacion

1. Validar en cliente que `tipo` sea `semilla` o `sustrato`.
2. Validar que `numero_lote` no este vacio y no supere 100 caracteres.
3. Enviar `POST /lotes`.
4. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
5. Si responde `409 LOTE_NUMERO_DUPLICADO`, mostrar que el numero ya existe para ese tipo.

### Flujo de edicion

1. Cargar detalle con `GET /lotes/:id`.
2. Mostrar `tipo` como solo lectura.
3. Enviar solo campos modificados con `PATCH /lotes/:id`.
4. Nunca incluir `tipo` en el body de PATCH.
5. Si `activo=false`, tratarlo como desactivacion.
6. Refrescar detalle/listado.

### Flujo de eliminacion

1. Mostrar confirmacion antes de eliminar.
2. Enviar `DELETE /lotes/:id`.
3. Si responde `200`, quitarlo del listado o refrescar.
4. Si responde `409 LOTE_REFERENCED_BY_BANDEJA`, informar que el lote esta en uso y sugerir desactivarlo.

## 12. Consideraciones de UI/UX

- Mostrar acciones de crear y editar solo para `supervisor` o `admin_global`.
- Mostrar eliminar solo para `admin_global`.
- Mostrar `tipo` como campo bloqueado en edicion.
- Para filtros, ofrecer un selector con `Todos`, `Semilla`, `Sustrato`.
- Para `activo`, ofrecer `Todos`, `Activos`, `Inactivos`.
- Para ordenamiento, limitar UI a `numero_lote`, `created_at`.
- Si un lote esta en uso, preferir desactivarlo antes que eliminarlo.
- Mostrar mensajes especificos para `LOTE_NUMERO_DUPLICADO`, `LOTE_TIPO_IMMUTABLE` y `LOTE_REFERENCED_BY_BANDEJA`.

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
  "/lotes?page=1&limit=10&tipo=semilla&activo=true&sortBy=created_at&sortOrder=DESC"
);

const lotes = response.data;
const meta = response.meta;
```

### Crear

```ts
const response = await apiFetch("/lotes", {
  method: "POST",
  body: JSON.stringify({
    tipo: "semilla",
    numero_lote: "SEM-2026-001",
    proveedor_id: "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
    producto_id: "3b2a7e2a-9f0a-4a3d-8a9d-6a9f0b6a2c1e",
    variedad_id: "5c1d8f3b-2e4a-4b7c-9d1e-8a3f2b6c4d5e",
    proveedor_semilla_id: "9e1c2d3b-4a5f-4b6c-8d7e-1f2a3b4c5d6e",
    observaciones: "Lote inicial de prueba"
  })
});

const nuevoLote = response.data;
```

### Actualizar

```ts
const response = await apiFetch(`/lotes/${loteId}`, {
  method: "PATCH",
  body: JSON.stringify({
    numero_lote: "SEM-2026-001-A",
    observaciones: "Actualizado desde frontend",
    activo: true
  })
});

const loteActualizado = response.data;
```

### Desactivar

```ts
const response = await apiFetch(`/lotes/${loteId}`, {
  method: "PATCH",
  body: JSON.stringify({
    activo: false
  })
});

const loteDesactivado = response.data;
```

### Eliminar

```ts
await apiFetch(`/lotes/${loteId}`, {
  method: "DELETE"
});
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- `tipo` solo puede ser `semilla` o `sustrato`.
- `tipo` no se envia en PATCH.
- `numero_lote` se valida como obligatorio en creacion.
- `numero_lote` no supera 100 caracteres.
- `proveedor_id` se envia siempre en creacion (uuid, obligatorio sin importar `tipo`).
- `producto_id`, `variedad_id` y `proveedor_semilla_id` solo se envian cuando `tipo === "semilla"`; nunca para `tipo === "sustrato"` (el backend los rechaza con 422, no los ignora).
- `activo` se envia como boolean real en JSON, no como string.
- Los filtros `page` y `limit` se envian como numeros en query.
- La UI maneja `LOTE_NUMERO_DUPLICADO`.
- La UI maneja `LOTE_REFERENCED_BY_BANDEJA`.
- La UI maneja `VARIEDAD_PRODUCTO_MISMATCH`, `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` y `LOTE_PRODUCTO_NO_PERMITIDO`.
- Crear/editar se muestran solo para `supervisor` o `admin_global`.
- Eliminar se muestra solo para `admin_global`.

