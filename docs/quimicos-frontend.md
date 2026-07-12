# Modulo Quimicos y Principios Activos - Guia para Frontend

## 1. Objetivo del modulo

El modulo de quimicos administra el catalogo de productos quimicos disponibles por establecimiento (fertilizantes, fitosanitarios, etc.). Cada quimico pertenece a:

- Un tenant.
- Un establecimiento.
- Opcionalmente una marca (`marca_id`).
- Cero, uno o varios principios activos.

El **stock** de un quimico ya no vive en el propio quimico: se administra por lotes en el modulo `lotes-quimicos` (ver seccion 12). Un quimico puede tener varios lotes activos, cada uno con su propia `cantidad_inicial`/`cantidad_actual`, proveedor y fechas.

Los principios activos son catalogos globales. No dependen de un tenant ni de un establecimiento. Se usan para clasificar o describir la composicion de los quimicos.

Desde frontend, este modulo sirve para:

- Listar quimicos.
- Consultar el detalle de un quimico con sus principios activos.
- Crear quimicos para un establecimiento.
- Editar nombre, unidad de medida, dosis, carencia, marca, estado activo y principios activos asociados.
- Desactivar quimicos con `activo=false`.
- Eliminar quimicos, si el usuario tiene permisos.
- Listar, crear, editar y eliminar principios activos.
- Administrar lotes de stock de cada quimico (`lotes-quimicos`).

Controladores del modulo:

- `QuimicosController`: rutas bajo `/quimicos`.
- `PrincipiosActivosController`: rutas bajo `/principios-activos`.
- `AdminQuimicosController`: ruta administrativa bajo `/admin/quimicos`.
- `LotesQuimicosController`: rutas bajo `/lotes-quimicos` y `/quimicos/:quimicoId/lotes`.

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

Todos los endpoints de quimicos, principios activos y lotes de quimicos requieren JWT.

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

Los quimicos y sus lotes son tenant-scoped. Siempre se consultan y modifican dentro del tenant actual.

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
| `GET /lotes-quimicos` | Cualquier usuario autenticado |
| `GET /lotes-quimicos/:id` | Cualquier usuario autenticado |
| `GET /quimicos/:quimicoId/lotes` | Cualquier usuario autenticado |
| `POST /lotes-quimicos` | `supervisor`, `admin_global` |
| `PATCH /lotes-quimicos/:id` | `supervisor`, `admin_global` |
| `POST /lotes-quimicos/:id/ajuste` | `supervisor`, `admin_global` |
| `DELETE /lotes-quimicos/:id` | `admin_global` |

Notas:

- Listar y obtener quimicos (y lotes) no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear y actualizar quimicos/lotes requieren `supervisor` o `admin_global`.
- Eliminar quimicos/lotes requiere `admin_global`.
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
| `400` | `QUIMICO_FIELD_IMMUTABLE` | Se intento modificar un campo no permitido en `PATCH /quimicos/:id` |
| `400` | `LOTE_QUIMICO_FIELD_IMMUTABLE` | Se intento modificar un campo no permitido en `PATCH /lotes-quimicos/:id` |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `NOT_FOUND` | Quimico, establecimiento o lote de quimico no encontrado (codigo generico) |
| `404` | `PRINCIPIO_ACTIVO_NOT_FOUND` | Principio activo no encontrado |
| `404` | `PROVEEDOR_NOT_FOUND` | `proveedor_id` de un lote no existe o es de otro tenant |
| `404` | `MARCA_NOT_FOUND` | `marca_id` no existe o es de otro tenant |
| `409` | `QUIMICO_NOMBRE_DUPLICADO` | Ya existe un quimico con ese nombre en el establecimiento |
| `409` | `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO` | Ya existe un principio activo con ese nombre |
| `409` | `PRINCIPIO_ACTIVO_REFERENCIADO` | El principio activo esta asociado a uno o mas quimicos |
| `409` | `LOTE_QUIMICO_NUMERO_DUPLICADO` | Ya existe un lote con ese `numero_lote` para ese quimico |
| `409` | `LOTE_QUIMICO_REFERENCED` | El lote esta referenciado por aplicaciones quimicas |
| `422` | `PROVEEDOR_ESTABLECIMIENTO_MISMATCH` | El `proveedor_id` del lote no pertenece al establecimiento del quimico |
| `422` | `LOTE_QUIMICO_STOCK_INSUFICIENTE` | El ajuste de stock supera la cantidad disponible en el lote |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

Nota: `LOTE_QUIMICO_NOT_FOUND` existe declarado en `error-codes.ts` pero nunca se lanza — buscar un lote/quimico inexistente siempre devuelve el codigo generico `NOT_FOUND` (via `mustFindById`).

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

### Enum `QuimicoUnidadMedida`

```ts
enum QuimicoUnidadMedida {
  KG = 'kg',
  L = 'l',
}
```

`unidad_medida` es un enum de **solo 2 valores** (`kg`, `l`), no un string libre.

### Enum `QuimicoRateUnidad` (para `rate_unidad`)

```ts
enum QuimicoRateUnidad {
  KG_L = 'kg/L',
  G_L = 'g/L',
  ML_L = 'mL/L',
  L_L = 'L/L',
}
```

Estos son los valores actuales, con esta capitalizacion exacta (antes del 2026-07-08 se aceptaban en minusculas; ver nota al final de la seccion 9). Este mismo enum es usado por `AplicacionQuimica.dosis_unidad` — ver [aplicaciones-quimicas-frontend.md](aplicaciones-quimicas-frontend.md).

### Quimico

```ts
type Quimico = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  nombre: string;
  unidad_medida: QuimicoUnidadMedida;
  rate_unidad: QuimicoRateUnidad;
  withholding_period_dias: number | null;   // dias de carencia tras aplicacion; null = sin carencia
  marca_id: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  principios_activos?: PrincipioActivo[];
};
```

Nota: **no existe** el campo `stock_actual` en `Quimico`. El stock se administra por lote en `lotes-quimicos` (seccion 12) — para saber el stock total de un quimico, sumar `cantidad_actual` de sus lotes via `GET /quimicos/:quimicoId/lotes`.

Ejemplo:

```json
{
  "id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fungicida A",
  "unidad_medida": "l",
  "rate_unidad": "mL/L",
  "withholding_period_dias": 7,
  "marca_id": null,
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

### LoteQuimico

```ts
type LoteQuimico = {
  id: string;
  tenant_id: string | null;
  quimico_id: string;
  establecimiento_id: string;    // copiado del quimico al crear el lote
  proveedor_id: string;
  numero_lote: string;
  cantidad_inicial: string | number;  // decimal, puede llegar como string segun el driver
  cantidad_actual: string | number;
  dom: string | null;                 // fecha de fabricacion/origen, "YYYY-MM-DD"
  fecha_vencimiento: string | null;   // "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

Ejemplo:

```json
{
  "id": "c2a1b3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "numero_lote": "LQ-2026-001",
  "cantidad_inicial": "10.000",
  "cantidad_actual": "6.500",
  "dom": "2026-01-15",
  "fecha_vencimiento": "2027-01-15",
  "created_at": "2026-06-04T19:03:01.913Z",
  "updated_at": "2026-06-04T19:03:01.913Z",
  "deleted_at": null
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
  unidad_medida: QuimicoUnidadMedida;      // "kg" | "l"
  rate_unidad: QuimicoRateUnidad;          // requerido
  withholding_period_dias?: number;        // opcional, entero >= 0
  marca_id?: string;                       // opcional, uuid
  principios_activos?: string[];
};
```

Validaciones:

- `establecimiento_id`: obligatorio, UUID.
- `nombre`: obligatorio, string no vacio, maximo 150 caracteres.
- `unidad_medida`: obligatorio, valor del enum `QuimicoUnidadMedida` (`kg` o `l`).
- `rate_unidad`: obligatorio, valor del enum `QuimicoRateUnidad`.
- `withholding_period_dias`: opcional, entero, minimo `0`.
- `marca_id`: opcional, UUID. Si se envia, debe existir en el tenant (`404 MARCA_NOT_FOUND`).
- `principios_activos`: opcional, array de UUIDs.

Reglas de negocio:

- El establecimiento debe existir dentro del tenant actual.
- No puede existir otro quimico con el mismo `nombre`, mismo `establecimiento_id` y mismo tenant.
- Si se envia `principios_activos`, todos los IDs deben existir.
- `activo` queda en `true` por default.
- El quimico se crea sin stock propio; el stock se carga despues creando uno o mas lotes con `POST /lotes-quimicos` (seccion 12).

Ejemplo:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fungicida A",
  "unidad_medida": "l",
  "rate_unidad": "mL/L",
  "withholding_period_dias": 7,
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Ejemplo minimo (sin campos opcionales):

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "nombre": "Fertilizante B",
  "unidad_medida": "kg",
  "rate_unidad": "kg/L"
}
```

### UpdateQuimicoDto

Body para actualizar:

```ts
type UpdateQuimicoDto = {
  nombre?: string;
  unidad_medida?: QuimicoUnidadMedida;
  activo?: boolean;
  principios_activos?: string[];
  rate_unidad?: QuimicoRateUnidad;
  withholding_period_dias?: number;
  marca_id?: string;
};
```

Validaciones: mismas reglas de formato que en `CreateQuimicoDto`, todos los campos opcionales.

Importante:

- Los unicos campos que el controller permite en el body de `PATCH /quimicos/:id` son: `nombre`, `unidad_medida`, `activo`, `principios_activos`, `rate_unidad`, `withholding_period_dias`, `marca_id`.
- `establecimiento_id` y `tenant_id` no se pueden modificar desde este endpoint (son los unicos campos que el mensaje de error menciona explicitamente como inmutables).
- Si se envia `principios_activos`, reemplaza por completo la asociacion anterior.
- Para quitar todos los principios activos, enviar `principios_activos: []`.
- Si se envia `marca_id`, se revalida contra el catalogo de marcas (`404 MARCA_NOT_FOUND` si no existe). No hay forma de "limpiar" una `marca_id` ya asignada enviando `null` — el campo es `@IsUUID()` opcional, no acepta `null`.

Ejemplo:

```json
{
  "nombre": "Fungicida A Actualizado",
  "withholding_period_dias": 10,
  "activo": true,
  "principios_activos": [
    "7b930d86-6267-4602-9c40-96c89356c361"
  ]
}
```

Ejemplo para quitar asociaciones de principios activos:

```json
{
  "principios_activos": []
}
```

Ejemplo invalido (campo no permitido):

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
    "message": "Campo no permitido. Los campos inmutables son: id, tenant_id, establecimiento_id"
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

### Nomenclatura de `rate_unidad` (historico, 2026-07-08)

`rate_unidad` (y `AplicacionQuimica.dosis_unidad`, que comparte el mismo enum) cambio de notacion en minusculas a notacion estandar con "L" (litro) en mayuscula:

| Valor anterior | Valor nuevo |
| --- | --- |
| `kg/l` | `kg/L` |
| `g/l` | `g/L` |
| `ml/l` | `mL/L` |
| `l/l` | `L/L` |

Los registros existentes se migraron automaticamente en el backend. Enviar los valores viejos (minusculas) ahora devuelve `400 BAD_REQUEST`. `unidad_medida` (`kg`/`l`) no se vio afectada por este cambio.

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
      "unidad_medida": "l",
      "rate_unidad": "mL/L",
      "withholding_period_dias": 7,
      "marca_id": null,
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
    "unidad_medida": "l",
    "rate_unidad": "mL/L",
    "withholding_period_dias": 7,
    "marca_id": null,
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
  "unidad_medida": "l",
  "rate_unidad": "mL/L",
  "withholding_period_dias": 7,
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
| `unidad_medida` | enum | Si | `kg` o `l` |
| `rate_unidad` | enum | Si | `kg/L`, `g/L`, `mL/L` o `L/L` |
| `withholding_period_dias` | int | No | Minimo `0` |
| `marca_id` | uuid | No | Debe existir en el tenant |
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
    "unidad_medida": "l",
    "rate_unidad": "mL/L",
    "withholding_period_dias": 7,
    "marca_id": null,
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
- `404 MARCA_NOT_FOUND`: `marca_id` inexistente o fuera del tenant.
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
  "withholding_period_dias": 10,
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
| `unidad_medida` | enum | No | `kg` o `l` |
| `rate_unidad` | enum | No | `kg/L`, `g/L`, `mL/L` o `L/L` |
| `withholding_period_dias` | int | No | Minimo `0` |
| `marca_id` | uuid | No | Debe existir en el tenant |
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
    "unidad_medida": "l",
    "rate_unidad": "mL/L",
    "withholding_period_dias": 10,
    "marca_id": null,
    "activo": true,
    "created_at": "2026-06-04T19:03:01.913Z",
    "updated_at": "2026-06-04T20:00:00.000Z",
    "deleted_at": null,
    "principios_activos": []
  }
}
```

Reglas importantes:

- Solo se pueden enviar `nombre`, `unidad_medida`, `rate_unidad`, `withholding_period_dias`, `marca_id`, `activo` y `principios_activos`.
- Si se envia `principios_activos`, reemplaza toda la lista asociada.
- Para borrar todas las asociaciones, enviar `principios_activos: []`.
- No se puede modificar `establecimiento_id` ni `tenant_id`.
- Si cambia `nombre`, se valida duplicado dentro del mismo establecimiento y tenant.

Errores comunes:

- `400 BAD_REQUEST`: body invalido o principios activos inexistentes.
- `400 QUIMICO_FIELD_IMMUTABLE`: body contiene campos no permitidos.
- `404 NOT_FOUND`: quimico inexistente o fuera del tenant.
- `404 MARCA_NOT_FOUND`: `marca_id` inexistente o fuera del tenant.
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
    "unidad_medida": "l",
    "rate_unidad": "mL/L",
    "withholding_period_dias": 7,
    "marca_id": null,
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
      "unidad_medida": "l",
      "rate_unidad": "mL/L",
      "withholding_period_dias": 7,
      "marca_id": null,
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

## 12. Endpoints de lotes de quimicos (`lotes-quimicos`)

Cada lote representa una entrada de stock de un quimico especifico: numero de lote, proveedor, cantidad inicial/actual y fechas. El stock de un quimico es la suma de `cantidad_actual` de todos sus lotes.

### 12.1. Listar lotes

```http
GET /lotes-quimicos
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Tipo | Requerido | Default | Descripcion |
| --- | --- | --- | --- | --- |
| `page` | number | No | `1` | Pagina actual |
| `limit` | number | No | `20` | Cantidad por pagina, maximo `200` |
| `q` | string | No | - | Busca por `numero_lote` |
| `quimico_id` | uuid | No | - | Filtra por quimico |
| `establecimiento_id` | uuid | No | - | Filtra por establecimiento |
| `con_stock` | boolean | No | - | Si es `true`, solo lotes con `cantidad_actual > 0` |
| `sortBy` | string | No | `created_at` | `numero_lote`, `fecha_vencimiento` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Respuesta `200`: paginada, con objetos `LoteQuimico` (seccion 8).

### 12.2. Obtener lote por ID

```http
GET /lotes-quimicos/:id
```

Roles: cualquier usuario autenticado. Devuelve `404 NOT_FOUND` si no existe o esta fuera del tenant.

### 12.3. Lotes de un quimico especifico

```http
GET /quimicos/:quimicoId/lotes
```

Roles: cualquier usuario autenticado. Mismos query params que `GET /lotes-quimicos` (el `quimico_id` se toma del path, no hace falta repetirlo en query). Util para calcular el stock total sumando `cantidad_actual` de todos los items.

### 12.4. Crear lote

```http
POST /lotes-quimicos
```

Roles: `supervisor`, `admin_global`.

Body:

```json
{
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "proveedor_id": "7c1e2b4a-6f2d-4b5a-8e3f-1a2b3c4d5e6f",
  "numero_lote": "LQ-2026-001",
  "cantidad_inicial": 10,
  "dom": "2026-01-15",
  "fecha_vencimiento": "2027-01-15"
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `quimico_id` | uuid | Si | Debe existir en el tenant |
| `proveedor_id` | uuid | Si | Debe existir en el tenant y pertenecer al mismo establecimiento del quimico |
| `numero_lote` | string | Si | No vacio, maximo 100 caracteres |
| `cantidad_inicial` | number | Si | Minimo `0.001` |
| `dom` | date | No | Formato `YYYY-MM-DD` |
| `fecha_vencimiento` | date | No | Formato `YYYY-MM-DD` |

Reglas de negocio:

- `establecimiento_id` del lote se copia automaticamente del quimico (no se envia en el body).
- `cantidad_actual` se inicializa igual a `cantidad_inicial`.
- El `proveedor_id` debe pertenecer al mismo `establecimiento_id` que el quimico; si no, `422 PROVEEDOR_ESTABLECIMIENTO_MISMATCH`.
- No puede existir otro lote con el mismo `numero_lote` para el mismo `quimico_id` y tenant (`409 LOTE_QUIMICO_NUMERO_DUPLICADO`).

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `404 NOT_FOUND`: `quimico_id` inexistente o fuera del tenant.
- `404 PROVEEDOR_NOT_FOUND`: `proveedor_id` inexistente o fuera del tenant.
- `422 PROVEEDOR_ESTABLECIMIENTO_MISMATCH`: el proveedor no pertenece al establecimiento del quimico.
- `409 LOTE_QUIMICO_NUMERO_DUPLICADO`: `numero_lote` duplicado para ese quimico.
- `403 AUTH_FORBIDDEN`: rol insuficiente.

### 12.5. Actualizar lote

```http
PATCH /lotes-quimicos/:id
```

Roles: `supervisor`, `admin_global`.

Solo se permiten estos campos en el body: `numero_lote`, `proveedor_id`, `dom`, `fecha_vencimiento`. Cualquier otro campo (incluida `cantidad_actual`) responde `400 LOTE_QUIMICO_FIELD_IMMUTABLE` con el mensaje `"Solo se pueden modificar numero_lote, proveedor_id, dom y fecha_vencimiento"`.

Si se cambia `proveedor_id`, se revalida contra el establecimiento del lote (`422 PROVEEDOR_ESTABLECIMIENTO_MISMATCH` si no coincide). Si se cambia `numero_lote`, se revalida unicidad (`409 LOTE_QUIMICO_NUMERO_DUPLICADO`).

Para modificar la cantidad de stock, usar el endpoint de ajuste (seccion 12.6), no este PATCH.

### 12.6. Ajustar stock de un lote

```http
POST /lotes-quimicos/:id/ajuste
```

Roles: `supervisor`, `admin_global`.

Body:

```json
{
  "cantidad": 2.5,
  "observaciones": "Merma por derrame"
}
```

Campos:

| Campo | Tipo | Requerido | Validacion |
| --- | --- | --- | --- |
| `cantidad` | number | Si | Minimo `0.001` |
| `observaciones` | string | No | Maximo 2000 caracteres |

Importante: este endpoint **siempre resta** `cantidad` de `cantidad_actual` (no existe un modo de sumar/reponer stock via este endpoint). Si `cantidad_actual` es menor que `cantidad`, la operacion se rechaza atomicamente con `422 LOTE_QUIMICO_STOCK_INSUFICIENTE` (la resta se hace en un solo `UPDATE` condicionado, no hay lectura-luego-escritura).

Respuesta `200`: el `LoteQuimico` actualizado.

### 12.7. Eliminar lote

```http
DELETE /lotes-quimicos/:id
```

Roles: `admin_global`.

Antes de eliminar, el backend verifica que el lote no este referenciado por `aplicaciones_quimicas_detalle`. Si lo esta, responde `409 LOTE_QUIMICO_REFERENCED`. Hace soft delete.

## 13. Flujos recomendados para frontend

### Flujo de carga de listado de quimicos

1. Verificar que exista `access_token`.
2. Enviar `GET /quimicos?page=1&limit=10`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, activo y busqueda `q`.
6. Si se quieren ver solo activos, enviar `activo=true`.
7. Para mostrar stock total por quimico, hacer una llamada adicional a `GET /quimicos/:quimicoId/lotes` y sumar `cantidad_actual` (el listado de quimicos no trae stock embebido).

### Flujo de creacion de quimico

1. Cargar establecimientos disponibles.
2. Cargar `GET /principios-activos`.
3. Validar `establecimiento_id`, `nombre`, `unidad_medida` y `rate_unidad`.
4. Permitir seleccionar cero, uno o varios principios activos, y opcionalmente `marca_id`/`withholding_period_dias`.
5. Enviar `POST /quimicos`.
6. Si responde `201`, guardar `data.id` y navegar al detalle o refrescar listado.
7. Si responde `409 QUIMICO_NOMBRE_DUPLICADO`, mostrar que ya existe un quimico con ese nombre en el establecimiento.
8. Si el quimico necesita stock inicial, encadenar un `POST /lotes-quimicos` con ese `quimico_id`.

### Flujo de edicion de quimico

1. Cargar detalle con `GET /quimicos/:id`.
2. Cargar catalogo con `GET /principios-activos`.
3. Permitir editar solo `nombre`, `unidad_medida`, `rate_unidad`, `withholding_period_dias`, `marca_id`, `activo` y principios activos.
4. Enviar `PATCH /quimicos/:id`.
5. Recordar que `principios_activos` reemplaza la asociacion completa.
6. Nunca enviar `establecimiento_id` ni `tenant_id`.

### Flujo de principios activos

1. Listar con `GET /principios-activos`.
2. Para crear, enviar `POST /principios-activos`.
3. Para editar, enviar `PATCH /principios-activos/:id`.
4. Para eliminar, enviar `DELETE /principios-activos/:id`.
5. Si responde `PRINCIPIO_ACTIVO_REFERENCIADO`, informar que no puede eliminarse porque esta siendo usado por quimicos.

### Flujo de manejo de stock (lotes)

1. Desde el detalle de un quimico, listar sus lotes con `GET /quimicos/:quimicoId/lotes`.
2. Para cargar stock nuevo, enviar `POST /lotes-quimicos` con `quimico_id`, `proveedor_id`, `numero_lote` y `cantidad_inicial`.
3. Para descontar stock (uso manual, merma, ajuste de inventario), enviar `POST /lotes-quimicos/:id/ajuste` con la `cantidad` a restar.
4. El descuento automatico de stock al registrar una aplicacion quimica ocurre en el modulo de aplicaciones, no aca — ver [aplicaciones-quimicas-frontend.md](aplicaciones-quimicas-frontend.md).
5. Si un ajuste responde `422 LOTE_QUIMICO_STOCK_INSUFICIENTE`, refrescar el lote para mostrar el stock real disponible.

### Flujo de eliminacion de quimico

1. Mostrar confirmacion.
2. Enviar `DELETE /quimicos/:id`.
3. Si responde `200`, quitarlo del listado o refrescar.
4. Si responde `403`, ocultar esta accion para el rol actual.

## 14. Consideraciones de UI/UX

- Mostrar crear y editar quimicos solo para `supervisor` o `admin_global`.
- Mostrar eliminar quimico solo para `admin_global`.
- Mostrar crear, editar y eliminar principios activos solo para `admin_global`.
- Mostrar crear/editar lotes solo para `supervisor` o `admin_global`; eliminar lote solo para `admin_global`.
- El stock ya no es un campo de solo lectura del quimico: se muestra/gestiona a nivel de lote.
- Mostrar `establecimiento_id` como seleccionable solo al crear quimico.
- En edicion, mostrar establecimiento como solo lectura o no mostrarlo como campo editable.
- En la edicion de principios activos de un quimico, usar un multiselect.
- Al guardar principios activos, enviar todos los seleccionados, no solo los cambios.
- Para quitar todos, enviar `principios_activos: []`.
- Si frontend no quiere mostrar inactivos por defecto, debe enviar `activo=true`, porque el backend no aplica ese filtro automaticamente.
- Mostrar `withholding_period_dias` como "dias de carencia" en la UI, en la misma pantalla donde se elige `rate_unidad`.
- Mostrar mensajes especificos para `QUIMICO_NOMBRE_DUPLICADO`, `QUIMICO_FIELD_IMMUTABLE`, `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`, `PRINCIPIO_ACTIVO_REFERENCIADO`, `LOTE_QUIMICO_NUMERO_DUPLICADO`, `LOTE_QUIMICO_STOCK_INSUFICIENTE`, `LOTE_QUIMICO_REFERENCED` y `PROVEEDOR_ESTABLECIMIENTO_MISMATCH`.

## 15. Ejemplos con fetch

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
    unidad_medida: "l",
    rate_unidad: "mL/L",
    withholding_period_dias: 7,
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
    withholding_period_dias: 10,
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

### Crear lote de quimico

```ts
const response = await apiFetch("/lotes-quimicos", {
  method: "POST",
  body: JSON.stringify({
    quimico_id: quimicoId,
    proveedor_id: proveedorId,
    numero_lote: "LQ-2026-001",
    cantidad_inicial: 10
  })
});

const nuevoLote = response.data;
```

### Ajustar stock de un lote

```ts
const response = await apiFetch(`/lotes-quimicos/${loteId}/ajuste`, {
  method: "POST",
  body: JSON.stringify({
    cantidad: 2.5,
    observaciones: "Merma por derrame"
  })
});

const loteActualizado = response.data;
```

## 16. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear quimico valida `establecimiento_id`, `nombre`, `unidad_medida` y `rate_unidad`.
- `nombre` de quimico no supera 150 caracteres.
- `unidad_medida` solo acepta `kg` o `l` (no es texto libre).
- `rate_unidad` solo acepta `kg/L`, `g/L`, `mL/L` o `L/L`.
- En PATCH de quimico solo se envian `nombre`, `unidad_medida`, `rate_unidad`, `withholding_period_dias`, `marca_id`, `activo` y `principios_activos`.
- En PATCH de quimico no se envia `establecimiento_id` ni `tenant_id`.
- No existe `stock_actual` en el modelo de Quimico; el stock se lee/gestiona via `lotes-quimicos`.
- `activo` se envia como boolean real en JSON, no como string.
- Principios activos se cargan desde `GET /principios-activos`.
- `principios_activos` se envia como array de UUIDs.
- La UI maneja `QUIMICO_NOMBRE_DUPLICADO`.
- La UI maneja `QUIMICO_FIELD_IMMUTABLE`.
- La UI maneja `PRINCIPIO_ACTIVO_NOMBRE_DUPLICADO`.
- La UI maneja `PRINCIPIO_ACTIVO_REFERENCIADO`.
- La UI maneja `LOTE_QUIMICO_NUMERO_DUPLICADO`, `LOTE_QUIMICO_STOCK_INSUFICIENTE`, `LOTE_QUIMICO_REFERENCED` y `PROVEEDOR_ESTABLECIMIENTO_MISMATCH` para lotes.
- El ajuste de stock (`POST /lotes-quimicos/:id/ajuste`) siempre resta; no hay endpoint para sumar stock salvo crear un lote nuevo.
- Crear/editar quimicos y lotes se muestran solo para `supervisor` o `admin_global`.
- Eliminar quimicos y lotes se muestra solo para `admin_global`.
- Crear/editar/eliminar principios activos se muestra solo para `admin_global`.
- Si se quieren listar solo activos, enviar `activo=true`.

## 17. Modulo Recetas — eliminado

El modulo de Recetas (`/recetas`, `/admin/recetas`) se elimino por completo del backend. No existe ningun campo `receta_id` en ningun endpoint de este documento ni de aplicaciones quimicas. Si el frontend conservaba pantallas o referencias a recetas, deben quitarse.
