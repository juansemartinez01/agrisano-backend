# Modulo Stock Movimientos - Guia para Frontend

## 1. Objetivo del modulo

El modulo de movimientos de stock registra ingresos y egresos manuales de stock para quimicos.

Cada movimiento:

- Pertenece a un tenant.
- Esta asociado a un quimico.
- Copia el establecimiento del quimico.
- Copia la unidad de medida del quimico.
- Registra el usuario que realizo la operacion.
- Actualiza el `stock_actual` del quimico en la misma transaccion.

Desde frontend, este modulo sirve para:

- Registrar ingresos de stock.
- Registrar egresos manuales de stock.
- Listar movimientos de stock.
- Consultar el detalle de un movimiento.
- Listar movimientos de un quimico especifico.
- Mostrar el stock actualizado luego de cada movimiento.

Controlador del modulo:

- `StockMovimientosController`: rutas bajo `/stock-movimientos` y `/quimicos/:quimicoId/movimientos`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/stock-movimientos
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de movimientos de stock requieren JWT.

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
  "path": "/stock-movimientos"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `POST /stock-movimientos` | `supervisor`, `admin_global` |
| `GET /stock-movimientos` | Cualquier usuario autenticado |
| `GET /stock-movimientos/:id` | Cualquier usuario autenticado |
| `GET /quimicos/:quimicoId/movimientos` | Cualquier usuario autenticado |

Notas:

- Crear movimientos requiere `supervisor` o `admin_global`.
- Listar y obtener movimientos no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- El rol `admin` no habilita automaticamente la creacion si no esta listado arriba.

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
  "path": "/stock-movimientos"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `MOVIMIENTO_NOT_FOUND` | Movimiento no encontrado o fuera del tenant |
| `404` | `NOT_FOUND` | Quimico no encontrado o fuera del tenant |
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
    "message": "cantidad must not be less than 0.001",
    "details": {
      "validationErrors": [
        {
          "message": "cantidad must not be less than 0.001"
        }
      ]
    }
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/stock-movimientos"
}
```

## 8. Modelos de datos

### MovimientoStock

```ts
type MovimientoTipo = "ingreso" | "egreso_manual";

type MovimientoStock = {
  id: string;
  tenant_id: string | null;
  quimico_id: string;
  establecimiento_id: string;
  tipo: MovimientoTipo;
  cantidad: string | number;
  unidad_medida: string;
  numero_remito: string | null;
  observaciones: string | null;
  usuario_id: string;
  fecha: string;
  created_at: string;
  updated_at: string;
};
```

Nota: `cantidad` es una columna decimal. Dependiendo de TypeORM/driver puede llegar como string. Frontend debe tratarlo con cuidado si necesita operar numericamente.

Ejemplo:

```json
{
  "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "tipo": "ingreso",
  "cantidad": "10.500",
  "unidad_medida": "ml",
  "numero_remito": "REM-001",
  "observaciones": "Ingreso inicial",
  "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
  "fecha": "2026-06-05",
  "created_at": "2026-06-05T19:03:01.913Z",
  "updated_at": "2026-06-05T19:03:01.913Z"
}
```

### Respuesta de creacion

`POST /stock-movimientos` no devuelve solamente el movimiento. Devuelve tambien el stock actualizado del quimico.

```ts
type CreateMovimientoResponse = {
  movimiento: MovimientoStock;
  quimico_stock_actual: number;
  warning?: string;
};
```

Ejemplo:

```json
{
  "ok": true,
  "data": {
    "movimiento": {
      "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tipo": "ingreso",
      "cantidad": "10.500",
      "unidad_medida": "ml",
      "numero_remito": "REM-001",
      "observaciones": "Ingreso inicial",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "fecha": "2026-06-05",
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z"
    },
    "quimico_stock_actual": 10.5
  }
}
```

## 9. DTOs usados por frontend

### CreateMovimientoDto

Body para crear:

```ts
type CreateMovimientoDto = {
  quimico_id: string;
  tipo: "ingreso" | "egreso_manual";
  cantidad: number;
  numero_remito?: string;
  observaciones?: string;
  fecha?: string;
};
```

Validaciones:

- `quimico_id`: obligatorio, UUID.
- `tipo`: obligatorio. Valores permitidos: `ingreso`, `egreso_manual`.
- `cantidad`: obligatorio, number, minimo `0.001`.
- `numero_remito`: opcional, string, maximo 100 caracteres.
- `observaciones`: opcional, string.
- `fecha`: opcional, fecha ISO. Recomendado `YYYY-MM-DD`.

Reglas de negocio:

- El quimico debe existir dentro del tenant.
- `unidad_medida` se copia desde el quimico. Frontend no la envia.
- `establecimiento_id` se copia desde el quimico. Frontend no lo envia.
- `usuario_id` se toma del JWT. Frontend no lo envia.
- Si no se envia `fecha`, el backend usa la fecha actual del servidor en formato `YYYY-MM-DD`.
- Si `tipo=ingreso`, suma stock.
- Si `tipo=egreso_manual`, resta stock.
- Si el stock resultante queda negativo, el backend igual permite el movimiento y devuelve `warning`.

Ejemplo ingreso:

```json
{
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tipo": "ingreso",
  "cantidad": 10.5,
  "numero_remito": "REM-001",
  "observaciones": "Ingreso inicial",
  "fecha": "2026-06-05"
}
```

Ejemplo egreso:

```json
{
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tipo": "egreso_manual",
  "cantidad": 2.25,
  "observaciones": "Ajuste manual",
  "fecha": "2026-06-05"
}
```

### QueryMovimientosDto

Query params para listados:

```ts
type QueryMovimientosDto = {
  page?: number;
  limit?: number;
  quimico_id?: string;
  establecimiento_id?: string;
  tipo?: "ingreso" | "egreso_manual";
  fecha_desde?: string;
  fecha_hasta?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
};
```

Validaciones y comportamiento:

- `page`: opcional, entero, minimo 1. Default: `1`.
- `limit`: opcional, entero, minimo 1, maximo 200. Default: `20`.
- `quimico_id`: opcional, UUID.
- `establecimiento_id`: opcional, UUID.
- `tipo`: opcional. Valores permitidos: `ingreso`, `egreso_manual`.
- `fecha_desde`: opcional, fecha ISO.
- `fecha_hasta`: opcional, fecha ISO.
- `sortBy`: opcional. Valores permitidos reales: `fecha`, `created_at`.
- `sortOrder`: opcional. Valores permitidos: `ASC`, `DESC`.
- Si `sortBy` no es permitido, el backend ordena por `fecha DESC`.

Ejemplo:

```txt
/stock-movimientos?page=1&limit=10&quimico_id=f0c6de8c-513f-4a8d-b104-870d627325b8&tipo=ingreso&fecha_desde=2026-01-01&fecha_hasta=2026-12-31&sortBy=fecha&sortOrder=DESC
```

## 10. Endpoints

### 10.1. Crear movimiento de stock

```http
POST /stock-movimientos
```

Roles:

- `supervisor`
- `admin_global`

Headers:

```http
Authorization: Bearer <access_token>
x-tenant-id: <tenant_id>
```

Body ingreso:

```json
{
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tipo": "ingreso",
  "cantidad": 10.5,
  "numero_remito": "REM-001",
  "observaciones": "Ingreso inicial",
  "fecha": "2026-06-05"
}
```

Body egreso manual:

```json
{
  "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
  "tipo": "egreso_manual",
  "cantidad": 2.25,
  "observaciones": "Ajuste manual",
  "fecha": "2026-06-05"
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "movimiento": {
      "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tipo": "ingreso",
      "cantidad": "10.500",
      "unidad_medida": "ml",
      "numero_remito": "REM-001",
      "observaciones": "Ingreso inicial",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "fecha": "2026-06-05",
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z"
    },
    "quimico_stock_actual": 10.5
  }
}
```

Notas:

- La creacion del movimiento y la actualizacion del stock ocurren en una transaccion.
- Se registra auditoria con accion `stock_movimiento_ingreso` o `stock_movimiento_egreso_manual`.
- El endpoint no recibe `unidad_medida`, `establecimiento_id` ni `usuario_id`.

Errores comunes:

- `400 BAD_REQUEST`: body invalido.
- `400 TENANT_REQUIRED`: falta tenant.
- `403 AUTH_FORBIDDEN`: rol insuficiente.
- `404 NOT_FOUND`: quimico inexistente o fuera del tenant.

### 10.2. Warning por stock negativo

El backend permite que un egreso deje stock negativo. En ese caso responde `201`, pero agrega `warning`.

Ejemplo respuesta:

```json
{
  "ok": true,
  "data": {
    "movimiento": {
      "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tipo": "egreso_manual",
      "cantidad": "999.000",
      "unidad_medida": "ml",
      "numero_remito": null,
      "observaciones": "Ajuste manual",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "fecha": "2026-06-05",
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z"
    },
    "quimico_stock_actual": -988.5,
    "warning": "Stock resultante negativo"
  }
}
```

Recomendacion frontend:

- Si viene `data.warning`, mostrar una alerta no bloqueante.
- Si se quiere evitar stock negativo desde UI, validar contra stock actual antes de enviar.
- Backend no bloquea el egreso por stock negativo.

### 10.3. Listar movimientos

```http
GET /stock-movimientos
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Tipo | Requerido | Default | Descripcion |
| --- | --- | --- | --- | --- |
| `page` | number | No | `1` | Pagina actual |
| `limit` | number | No | `20` | Cantidad por pagina, maximo `200` |
| `quimico_id` | uuid | No | - | Filtra por quimico |
| `establecimiento_id` | uuid | No | - | Filtra por establecimiento |
| `tipo` | string | No | - | `ingreso` o `egreso_manual` |
| `fecha_desde` | string | No | - | Fecha minima |
| `fecha_hasta` | string | No | - | Fecha maxima |
| `sortBy` | string | No | `fecha` | `fecha` o `created_at` |
| `sortOrder` | string | No | `DESC` | `ASC` o `DESC` |

Ejemplo:

```http
GET /stock-movimientos?page=1&limit=10&tipo=ingreso&fecha_desde=2026-01-01&fecha_hasta=2026-12-31&sortBy=fecha&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tipo": "ingreso",
      "cantidad": "10.500",
      "unidad_medida": "ml",
      "numero_remito": "REM-001",
      "observaciones": "Ingreso inicial",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "fecha": "2026-06-05",
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z"
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

### 10.4. Obtener movimiento por ID

```http
GET /stock-movimientos/:id
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `id` | uuid | Si | ID del movimiento |

Ejemplo:

```http
GET /stock-movimientos/f710216a-3c7f-469b-b1e9-169f0e8e840a
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tipo": "ingreso",
    "cantidad": "10.500",
    "unidad_medida": "ml",
    "numero_remito": "REM-001",
    "observaciones": "Ingreso inicial",
    "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
    "fecha": "2026-06-05",
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T19:03:01.913Z"
  }
}
```

Errores comunes:

- `404 MOVIMIENTO_NOT_FOUND`: no existe o esta fuera del tenant.
- `401 AUTH_INVALID`: token invalido o ausente.

### 10.5. Listar movimientos por quimico

```http
GET /quimicos/:quimicoId/movimientos
```

Roles:

- Cualquier usuario autenticado.

Path params:

| Param | Tipo | Requerido | Descripcion |
| --- | --- | --- | --- |
| `quimicoId` | uuid | Si | ID del quimico |

Query params:

Acepta los mismos filtros que `GET /stock-movimientos`, excepto que `quimico_id` se toma del path.

Ejemplo:

```http
GET /quimicos/f0c6de8c-513f-4a8d-b104-870d627325b8/movimientos?page=1&limit=10&sortBy=fecha&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "f710216a-3c7f-469b-b1e9-169f0e8e840a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "quimico_id": "f0c6de8c-513f-4a8d-b104-870d627325b8",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tipo": "ingreso",
      "cantidad": "10.500",
      "unidad_medida": "ml",
      "numero_remito": "REM-001",
      "observaciones": "Ingreso inicial",
      "usuario_id": "e4560fcf-423c-4ebb-adc1-4d4259dadefe",
      "fecha": "2026-06-05",
      "created_at": "2026-06-05T19:03:01.913Z",
      "updated_at": "2026-06-05T19:03:01.913Z"
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

- Primero valida que el quimico exista dentro del tenant.
- Luego lista movimientos de ese quimico.

Errores comunes:

- `404 NOT_FOUND`: quimico inexistente o fuera del tenant.
- `400 BAD_REQUEST`: query invalida.

## 11. Flujos recomendados para frontend

### Flujo de ingreso de stock

1. Cargar o seleccionar un quimico.
2. Mostrar `stock_actual` y `unidad_medida` del quimico.
3. Validar `cantidad >= 0.001`.
4. Enviar `POST /stock-movimientos` con `tipo=ingreso`.
5. Si responde `201`, actualizar en UI el stock con `data.quimico_stock_actual`.
6. Registrar o mostrar el movimiento creado.

### Flujo de egreso manual

1. Cargar o seleccionar un quimico.
2. Mostrar `stock_actual` y `unidad_medida`.
3. Validar `cantidad >= 0.001`.
4. Opcionalmente advertir si el egreso supera el stock actual.
5. Enviar `POST /stock-movimientos` con `tipo=egreso_manual`.
6. Si responde `201`, actualizar stock con `data.quimico_stock_actual`.
7. Si viene `data.warning`, mostrar alerta no bloqueante.

### Flujo de historial general

1. Enviar `GET /stock-movimientos?page=1&limit=10`.
2. Permitir filtros por quimico, establecimiento, tipo y rango de fechas.
3. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
4. Abrir detalle con `GET /stock-movimientos/:id`.

### Flujo de historial por quimico

1. Cargar detalle del quimico.
2. Enviar `GET /quimicos/:quimicoId/movimientos`.
3. Mostrar movimientos vinculados a ese quimico.
4. Usar filtros por tipo y fecha si corresponde.

## 12. Consideraciones de UI/UX

- Mostrar crear movimiento solo para `supervisor` o `admin_global`.
- Mostrar historial para cualquier usuario autenticado.
- Mostrar `unidad_medida` desde el quimico, no pedirla en el formulario.
- Mostrar `establecimiento` desde el quimico, no pedirlo en el formulario.
- Para egresos, mostrar una advertencia si la cantidad supera el stock actual.
- Si el backend devuelve `warning`, mostrarlo aunque la request haya sido exitosa.
- No asumir que `cantidad` o `stock_actual` llegan siempre como number; pueden llegar como string decimal.
- Para filtros de tipo, usar opciones `ingreso` y `egreso_manual`.
- Para fechas, usar formato `YYYY-MM-DD`.
- No hay endpoint de update/delete de movimientos; los movimientos son registros de auditoria operativa.

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

### Crear ingreso

```ts
const response = await apiFetch("/stock-movimientos", {
  method: "POST",
  body: JSON.stringify({
    quimico_id: quimicoId,
    tipo: "ingreso",
    cantidad: 10.5,
    numero_remito: "REM-001",
    observaciones: "Ingreso inicial",
    fecha: "2026-06-05"
  })
});

const movimiento = response.data.movimiento;
const stockActual = response.data.quimico_stock_actual;
```

### Crear egreso manual

```ts
const response = await apiFetch("/stock-movimientos", {
  method: "POST",
  body: JSON.stringify({
    quimico_id: quimicoId,
    tipo: "egreso_manual",
    cantidad: 2.25,
    observaciones: "Ajuste manual",
    fecha: "2026-06-05"
  })
});

const stockActual = response.data.quimico_stock_actual;
const warning = response.data.warning;
```

### Listar movimientos

```ts
const response = await apiFetch(
  "/stock-movimientos?page=1&limit=10&sortBy=fecha&sortOrder=DESC"
);

const movimientos = response.data;
const meta = response.meta;
```

### Obtener movimiento

```ts
const response = await apiFetch(`/stock-movimientos/${movimientoId}`);
const movimiento = response.data;
```

### Listar movimientos por quimico

```ts
const response = await apiFetch(
  `/quimicos/${quimicoId}/movimientos?page=1&limit=10&sortBy=fecha&sortOrder=DESC`
);

const movimientos = response.data;
const meta = response.meta;
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear movimiento valida `quimico_id`.
- Crear movimiento valida `tipo` como `ingreso` o `egreso_manual`.
- Crear movimiento valida `cantidad >= 0.001`.
- `fecha` se envia como `YYYY-MM-DD`.
- `numero_remito` no supera 100 caracteres.
- El formulario no envia `unidad_medida`.
- El formulario no envia `establecimiento_id`.
- El formulario no envia `usuario_id`.
- Despues de crear, UI actualiza stock con `quimico_stock_actual`.
- UI maneja `warning: Stock resultante negativo`.
- Crear movimiento se muestra solo para `supervisor` o `admin_global`.
- Historial se muestra para cualquier usuario autenticado.
- No se implementa editar/eliminar movimientos porque no existen endpoints para eso.

