# Modulo Siembra y Bandejas - Guia para Frontend

## 1. Objetivo del modulo

El modulo de siembra registra una siembra realizada en un establecimiento y genera automaticamente sus bandejas asociadas.

Una siembra representa el evento principal:

- En que establecimiento se realizo.
- En que fecha.
- Que usuario la creo.
- Que observaciones tiene.
- Que bandejas se generaron.

Una bandeja representa una unidad generada por la siembra. Cada bandeja queda asociada a:

- Una siembra.
- Un lote de semilla.
- Un lote de sustrato.
- Un establecimiento.
- Un estado operativo.

Actualmente, las bandejas de este modulo son de solo lectura desde estos endpoints. Se crean automaticamente al crear una siembra.

Controladores del modulo:

- `SiembraController`: rutas bajo `/siembras`.
- `BandejaController`: rutas bajo `/bandejas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/siembras
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de siembras y bandejas requieren JWT.

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
  "path": "/siembras"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /siembras` | Cualquier usuario autenticado |
| `GET /siembras/:id` | Cualquier usuario autenticado |
| `POST /siembras` | `operario`, `supervisor`, `admin_global` |
| `PATCH /siembras/:id` | `supervisor`, `admin_global` |
| `DELETE /siembras/:id` | `admin_global` |
| `GET /bandejas` | Cualquier usuario autenticado |
| `GET /bandejas/:id` | Cualquier usuario autenticado |

Notas:

- Listar y obtener siembras/bandejas no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear siembra requiere `operario`, `supervisor` o `admin_global`.
- Actualizar siembra solo permite modificar `observaciones` y requiere `supervisor` o `admin_global`.
- Eliminar siembra requiere `admin_global`.
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
  "path": "/siembras"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `SIEMBRA_FIELD_IMMUTABLE` | Se intento modificar un campo distinto de `observaciones` |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `SIEMBRA_NOT_FOUND` | Siembra no encontrada o fuera del tenant |
| `404` | `BANDEJA_NOT_FOUND` | Bandeja no encontrada o fuera del tenant |
| `404` | `NOT_FOUND` | Establecimiento o lote no encontrado |
| `409` | `SIEMBRA_HAS_TRASPLANTADAS` | No se puede eliminar una siembra con bandejas trasplantadas |
| `422` | `LOTE_TIPO_INCORRECTO` | Lote de semilla/sustrato con tipo incorrecto |
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
    "message": "bandejas must contain at least 1 elements",
    "details": {
      "validationErrors": [
        {
          "message": "bandejas must contain at least 1 elements"
        }
      ]
    }
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/siembras"
}
```

## 8. Modelos de datos

### Siembra

```ts
type Siembra = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  fecha: string;
  observaciones: string | null;
  usuario_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "fecha": "2026-06-04",
  "observaciones": "Siembra de prueba",
  "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
}
```

### Bandeja

```ts
type BandejaEstado = "en_nursery" | "trasplantada";

type Bandeja = {
  id: string;
  tenant_id: string | null;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: BandejaEstado;
  fecha_entrada_nursery: string;
  fecha_trasplante: string | null;
  mesa_id: string | null;
  observaciones: string | null;
  codigo: string | null;
  establecimiento_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "b8f0ca94-e4da-4b43-83f4-0916990c14d2",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "siembra_id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
  "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
  "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
  "estado": "en_nursery",
  "fecha_entrada_nursery": "2026-06-04T22:00:00.000Z",
  "fecha_trasplante": null,
  "mesa_id": null,
  "observaciones": null,
  "codigo": null,
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "created_at": "2026-06-04T22:00:00.000Z",
  "updated_at": "2026-06-04T22:00:00.000Z",
  "deleted_at": null
}
```

### Siembra con bandejas

`GET /siembras/:id` y `POST /siembras` devuelven la siembra con arreglo `bandejas`.

Cada bandeja puede incluir referencias basicas a lote:

```ts
type LoteRef = {
  id: string;
  numero_lote: string;
  tipo: "semilla" | "sustrato";
};

type BandejaWithRefs = Bandeja & {
  lote_semilla?: LoteRef;
  lote_sustrato?: LoteRef;
};

type SiembraWithBandejas = Siembra & {
  bandejas: BandejaWithRefs[];
};
```

## 9. DTOs usados por frontend

### CreateSiembraDto

Body para crear:

```ts
type CreateSiembraDto = {
  establecimiento_id: string;
  fecha?: string;
  observaciones?: string;
  bandejas: BandejaGroupDto[];
};

type BandejaGroupDto = {
  lote_semilla_id: string;
  lote_sustrato_id: string;
  cantidad: number;
};
```

Validaciones:

- `establecimiento_id`: obligatorio, UUID.
- `fecha`: opcional, fecha ISO. Recomendado `YYYY-MM-DD`.
- `observaciones`: opcional, string.
- `bandejas`: obligatorio, array con al menos un elemento.
- `bandejas[].lote_semilla_id`: obligatorio, UUID, debe apuntar a un lote tipo `semilla`.
- `bandejas[].lote_sustrato_id`: obligatorio, UUID, debe apuntar a un lote tipo `sustrato`.
- `bandejas[].cantidad`: obligatorio, entero, minimo `1`.

Ejemplo:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "fecha": "2026-06-04",
  "observaciones": "Siembra generada desde frontend",
  "bandejas": [
    {
      "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
      "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
      "cantidad": 10
    }
  ]
}
```

Reglas de negocio:

- El establecimiento debe existir dentro del tenant.
- `lote_semilla_id` debe existir y ser `tipo=semilla`.
- `lote_sustrato_id` debe existir y ser `tipo=sustrato`.
- Si no se envia `fecha`, el backend usa la fecha actual del servidor en formato `YYYY-MM-DD`.
- Por cada grupo, se crean `cantidad` bandejas.
- Todas las bandejas se crean con estado inicial `en_nursery`.
- Todas las bandejas toman `establecimiento_id` de la siembra.

### UpdateSiembraDto

Body para actualizar:

```ts
type UpdateSiembraDto = {
  observaciones?: string;
};
```

Validaciones:

- Solo se puede enviar `observaciones`.
- Si se envia cualquier otro campo, el backend responde `400 SIEMBRA_FIELD_IMMUTABLE`.

Ejemplo valido:

```json
{
  "observaciones": "Observaciones actualizadas"
}
```

Ejemplo invalido:

```json
{
  "fecha": "2026-06-05"
}
```

Respuesta del ejemplo invalido:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "SIEMBRA_FIELD_IMMUTABLE",
    "message": "Solo se puede modificar el campo observaciones"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/siembras/b6a87174-056c-4d2a-b1fd-46a93d7a9763"
}
```

### QuerySiembrasDto

Query params para listar siembras:

```ts
type QuerySiembrasDto = {
  page?: number;
  limit?: number;
  establecimiento_id?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `establecimiento_id`: opcional, UUID.
- `fecha_desde`: opcional, fecha ISO.
- `fecha_hasta`: opcional, fecha ISO.
- `sortBy`: opcional. Valores permitidos reales: `fecha`, `created_at`.
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.
- Si `sortBy` no es permitido, el backend ordena por `created_at DESC`.

Ejemplo:

```txt
/siembras?page=1&limit=10&establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&fecha_desde=2026-01-01&fecha_hasta=2026-12-31&sortBy=fecha&sortOrder=DESC
```

### QueryBandejasDto

Query params para listar bandejas:

```ts
type QueryBandejasDto = {
  page?: number;
  limit?: number;
  establecimiento_id?: string;
  siembra_id?: string;
  lote_semilla_id?: string;
  estado?: "en_nursery" | "trasplantada";
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `establecimiento_id`: opcional, UUID.
- `siembra_id`: opcional, UUID.
- `lote_semilla_id`: opcional, UUID.
- `estado`: opcional. Valores permitidos: `en_nursery`, `trasplantada`.
- `sortBy`: opcional. Valores permitidos reales: `fecha_entrada_nursery`, `created_at`.
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.

Importante:

- Si `estado` no se envia, el backend filtra por `en_nursery` por default.
- Para ver bandejas trasplantadas, enviar explicitamente `estado=trasplantada`.

Ejemplo:

```txt
/bandejas?page=1&limit=20&estado=en_nursery&sortBy=created_at&sortOrder=DESC
```

## 10. Endpoints de siembras

### 10.1. Listar siembras

```http
GET /siembras
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
| `establecimiento_id` | uuid | No | - | Filtra por establecimiento |
| `fecha_desde` | string | No | - | Fecha minima |
| `fecha_hasta` | string | No | - | Fecha maxima |
| `sortBy` | string | No | `created_at` | `fecha` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /siembras?page=1&limit=10&fecha_desde=2026-01-01&fecha_hasta=2026-12-31&sortBy=fecha&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "fecha": "2026-06-04",
      "observaciones": "Siembra de prueba",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
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

### 10.2. Crear siembra con bandejas

```http
POST /siembras
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "fecha": "2026-06-04",
  "observaciones": "Siembra generada desde frontend",
  "bandejas": [
    {
      "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
      "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
      "cantidad": 2
    }
  ]
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "fecha": "2026-06-04",
    "observaciones": "Siembra generada desde frontend",
    "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
    "created_at": "2026-06-04T22:00:00.000Z",
    "updated_at": "2026-06-04T22:00:00.000Z",
    "deleted_at": null,
    "bandejas": [
      {
        "id": "b8f0ca94-e4da-4b43-83f4-0916990c14d2",
        "siembra_id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
        "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
        "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
        "estado": "en_nursery",
        "fecha_entrada_nursery": "2026-06-04T22:00:00.000Z",
        "fecha_trasplante": null,
        "mesa_id": null,
        "observaciones": null,
        "codigo": null,
        "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
        "created_at": "2026-06-04T22:00:00.000Z",
        "updated_at": "2026-06-04T22:00:00.000Z"
      }
    ]
  }
}
```

Notas:

- Se crea una sola siembra.
- Se crean tantas bandejas como indique la suma de `cantidad` de cada grupo.
- La operacion es transaccional: si falla una parte, no se guarda nada.
- Se registra auditoria con accion `siembra_created`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 NOT_FOUND`: establecimiento o lote no encontrado.
- `422 LOTE_TIPO_INCORRECTO`: lote de semilla/sustrato con tipo incorrecto.

Ejemplo `422 LOTE_TIPO_INCORRECTO`:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 422,
  "error": {
    "code": "LOTE_TIPO_INCORRECTO",
    "message": "lote_semilla_id 'c2534647-5f8f-4542-8109-39c106ec7b17' debe ser tipo semilla"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/siembras"
}
```

### 10.3. Obtener siembra por ID

```http
GET /siembras/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la siembra |

Ejemplo:

```http
GET /siembras/b6a87174-056c-4d2a-b1fd-46a93d7a9763
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "fecha": "2026-06-04",
    "observaciones": "Siembra generada desde frontend",
    "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
    "created_at": "2026-06-04T22:00:00.000Z",
    "updated_at": "2026-06-04T22:00:00.000Z",
    "deleted_at": null,
    "bandejas": []
  }
}
```

Notas:

- Devuelve la siembra con sus bandejas.
- Las bandejas pueden incluir `lote_semilla` y `lote_sustrato` con `id`, `numero_lote` y `tipo`.

Errores comunes:

- `404 SIEMBRA_NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 10.4. Actualizar observaciones de siembra

```http
PATCH /siembras/:id
```

Roles:

- `supervisor`
- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la siembra |

Body valido:

```json
{
  "observaciones": "Observaciones actualizadas"
}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "fecha": "2026-06-04",
    "observaciones": "Observaciones actualizadas",
    "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
    "created_at": "2026-06-04T22:00:00.000Z",
    "updated_at": "2026-06-04T22:10:00.000Z",
    "deleted_at": null
  }
}
```

Reglas importantes:

- Solo se puede modificar `observaciones`.
- Si se envia `fecha`, `establecimiento_id`, `usuario_id`, `bandejas` o cualquier otro campo, responde `400 SIEMBRA_FIELD_IMMUTABLE`.
- Se registra auditoria con accion `siembra_updated`.

Errores comunes:

- `400 SIEMBRA_FIELD_IMMUTABLE`: body contiene campos no permitidos.
- `404 SIEMBRA_NOT_FOUND`: no existe o esta fuera del tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 10.5. Eliminar siembra

```http
DELETE /siembras/:id
```

Roles:

- `admin_global`

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la siembra |

Ejemplo:

```http
DELETE /siembras/b6a87174-056c-4d2a-b1fd-46a93d7a9763
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

- Hace soft delete de la siembra.
- Tambien hace soft delete de sus bandejas asociadas.
- Si la siembra tiene una o mas bandejas con estado `trasplantada`, no permite eliminar.
- Se registra auditoria con accion `siembra_deleted`.

Error por bandejas trasplantadas:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 409,
  "error": {
    "code": "SIEMBRA_HAS_TRASPLANTADAS",
    "message": "No se puede eliminar una siembra con bandejas trasplantadas"
  },
  "timestamp": "2026-06-04T22:00:00.000Z",
  "path": "/siembras/b6a87174-056c-4d2a-b1fd-46a93d7a9763"
}
```

Errores comunes:

- `404 SIEMBRA_NOT_FOUND`: siembra inexistente o fuera del tenant.
- `409 SIEMBRA_HAS_TRASPLANTADAS`: tiene bandejas trasplantadas.
- `403 AUTH_FORBIDDEN`: no es `admin_global`.

## 11. Endpoints de bandejas

### 11.1. Listar bandejas

```http
GET /bandejas
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
| `establecimiento_id` | uuid | No | - | Filtra por establecimiento |
| `siembra_id` | uuid | No | - | Filtra por siembra |
| `lote_semilla_id` | uuid | No | - | Filtra por lote de semilla |
| `estado` | string | No | `en_nursery` | `en_nursery` o `trasplantada` |
| `sortBy` | string | No | `created_at` | `fecha_entrada_nursery` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /bandejas?page=1&limit=20&estado=en_nursery&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "b8f0ca94-e4da-4b43-83f4-0916990c14d2",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "siembra_id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
      "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
      "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
      "estado": "en_nursery",
      "fecha_entrada_nursery": "2026-06-04T22:00:00.000Z",
      "fecha_trasplante": null,
      "mesa_id": null,
      "observaciones": null,
      "codigo": null,
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "created_at": "2026-06-04T22:00:00.000Z",
      "updated_at": "2026-06-04T22:00:00.000Z",
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

Importante:

- Si no se envia `estado`, solo devuelve bandejas `en_nursery`.
- Para mostrar todas por separado, frontend debe hacer filtros por estado o permitir selector de estado.

Errores comunes:

- `400 BAD_REQUEST`: query invalida.
- `400 TENANT_REQUIRED`: falta tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 11.2. Obtener bandeja por ID

```http
GET /bandejas/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID de la bandeja |

Ejemplo:

```http
GET /bandejas/b8f0ca94-e4da-4b43-83f4-0916990c14d2
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "b8f0ca94-e4da-4b43-83f4-0916990c14d2",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "siembra_id": "b6a87174-056c-4d2a-b1fd-46a93d7a9763",
    "lote_semilla_id": "f5c43121-22b4-43e8-9a85-e4f4bbcf97bb",
    "lote_sustrato_id": "c2534647-5f8f-4542-8109-39c106ec7b17",
    "estado": "en_nursery",
    "fecha_entrada_nursery": "2026-06-04T22:00:00.000Z",
    "fecha_trasplante": null,
    "mesa_id": null,
    "observaciones": null,
    "codigo": null,
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "created_at": "2026-06-04T22:00:00.000Z",
    "updated_at": "2026-06-04T22:00:00.000Z",
    "deleted_at": null
  }
}
```

Errores comunes:

- `404 BANDEJA_NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

## 12. Flujos recomendados para frontend

### Flujo de alta de siembra

1. Cargar establecimientos disponibles.
2. Cargar lotes activos de tipo `semilla`.
3. Cargar lotes activos de tipo `sustrato`.
4. El usuario selecciona establecimiento, fecha, lotes y cantidad de bandejas.
5. Validar que `cantidad >= 1`.
6. Enviar `POST /siembras`.
7. Si responde `201`, guardar `data.id` y mostrar detalle con bandejas generadas.
8. Si responde `422 LOTE_TIPO_INCORRECTO`, revisar que el selector de semilla solo use lotes `semilla` y el de sustrato solo use lotes `sustrato`.

### Flujo de listado de siembras

1. Enviar `GET /siembras?page=1&limit=10`.
2. Aplicar filtros por establecimiento y rango de fechas si corresponde.
3. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
4. Al seleccionar una siembra, abrir detalle con `GET /siembras/:id`.

### Flujo de detalle de siembra

1. Cargar `GET /siembras/:id`.
2. Mostrar datos de la siembra.
3. Mostrar `bandejas` en tabla.
4. Usar `lote_semilla.numero_lote` y `lote_sustrato.numero_lote` si vienen en la respuesta.
5. Para detalle completo de una bandeja, usar `GET /bandejas/:id`.

### Flujo de edicion de siembra

1. Permitir editar solo `observaciones`.
2. Enviar `PATCH /siembras/:id`.
3. No enviar `fecha`, `establecimiento_id`, `usuario_id` ni `bandejas`.
4. Si responde `SIEMBRA_FIELD_IMMUTABLE`, corregir el body enviado por frontend.

### Flujo de eliminacion de siembra

1. Mostrar confirmacion.
2. Enviar `DELETE /siembras/:id`.
3. Si responde `200`, refrescar listado.
4. Si responde `409 SIEMBRA_HAS_TRASPLANTADAS`, informar que no se puede eliminar porque tiene bandejas trasplantadas.

### Flujo de listado de bandejas

1. Enviar `GET /bandejas?estado=en_nursery`.
2. Permitir filtros por establecimiento, siembra y lote de semilla.
3. Si se quiere ver bandejas trasplantadas, enviar `estado=trasplantada`.
4. Usar `meta` para paginacion.

## 13. Consideraciones de UI/UX

- Mostrar crear siembra solo para `operario`, `supervisor` o `admin_global`.
- Mostrar editar observaciones solo para `supervisor` o `admin_global`.
- Mostrar eliminar siembra solo para `admin_global`.
- En formulario de siembra, separar claramente lote de semilla y lote de sustrato.
- El selector de semilla debe consultar/mostrar solo lotes `tipo=semilla`.
- El selector de sustrato debe consultar/mostrar solo lotes `tipo=sustrato`.
- En bandejas, recordar que el default del backend es `estado=en_nursery` si no se envia estado.
- Mostrar mensajes especificos para `LOTE_TIPO_INCORRECTO`, `SIEMBRA_FIELD_IMMUTABLE` y `SIEMBRA_HAS_TRASPLANTADAS`.
- Despues de crear una siembra, usar la respuesta para capturar los IDs de bandejas sin hacer otro request inmediato.

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

### Listar siembras

```ts
const response = await apiFetch(
  "/siembras?page=1&limit=10&sortBy=created_at&sortOrder=DESC"
);

const siembras = response.data;
const meta = response.meta;
```

### Crear siembra

```ts
const response = await apiFetch("/siembras", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    fecha: "2026-06-04",
    observaciones: "Siembra generada desde frontend",
    bandejas: [
      {
        lote_semilla_id: loteSemillaId,
        lote_sustrato_id: loteSustratoId,
        cantidad: 10
      }
    ]
  })
});

const siembra = response.data;
const bandejasGeneradas = response.data.bandejas;
```

### Obtener siembra

```ts
const response = await apiFetch(`/siembras/${siembraId}`);
const siembraConBandejas = response.data;
```

### Actualizar observaciones

```ts
const response = await apiFetch(`/siembras/${siembraId}`, {
  method: "PATCH",
  body: JSON.stringify({
    observaciones: "Observaciones actualizadas"
  })
});

const siembraActualizada = response.data;
```

### Eliminar siembra

```ts
await apiFetch(`/siembras/${siembraId}`, {
  method: "DELETE"
});
```

### Listar bandejas

```ts
const response = await apiFetch(
  "/bandejas?page=1&limit=20&estado=en_nursery&sortBy=created_at&sortOrder=DESC"
);

const bandejas = response.data;
const meta = response.meta;
```

### Obtener bandeja

```ts
const response = await apiFetch(`/bandejas/${bandejaId}`);
const bandeja = response.data;
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear siembra valida `establecimiento_id`.
- Crear siembra valida que haya al menos un grupo de bandejas.
- Cada grupo valida `lote_semilla_id`, `lote_sustrato_id` y `cantidad >= 1`.
- El selector de semilla solo permite lotes `semilla`.
- El selector de sustrato solo permite lotes `sustrato`.
- `fecha` se envia como `YYYY-MM-DD`.
- PATCH de siembra solo envia `observaciones`.
- La UI maneja `SIEMBRA_FIELD_IMMUTABLE`.
- La UI maneja `LOTE_TIPO_INCORRECTO`.
- La UI maneja `SIEMBRA_HAS_TRASPLANTADAS`.
- En listado de bandejas, enviar `estado` explicitamente si no se quiere usar el default `en_nursery`.
- Crear siembra se muestra solo para `operario`, `supervisor` o `admin_global`.
- Editar observaciones se muestra solo para `supervisor` o `admin_global`.
- Eliminar siembra se muestra solo para `admin_global`.

