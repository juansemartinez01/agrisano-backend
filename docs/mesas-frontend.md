# Modulo Mesas - Guia para Frontend

## 1. Objetivo del modulo

El modulo de mesas administra las mesas productivas ubicadas dentro de tuneles.

Una mesa:

- Pertenece a un tenant.
- Pertenece a un establecimiento.
- Pertenece a un tunel.
- Tiene un codigo QR unico.
- Puede estar activa, en cosecha o dada de baja.
- Puede tener historial de eventos operativos.

Desde frontend, este modulo sirve para:

- Listar mesas con filtros.
- Crear mesas dentro de un tunel.
- Consultar una mesa por ID.
- Consultar una mesa por codigo QR.
- Editar datos permitidos de una mesa.
- Dar de baja una mesa.
- Reactivar una mesa dada de baja.
- Eliminar una mesa dada de baja.
- Ver el historial de eventos de una mesa.
- Listar mesas posicionadas dentro de un tunel.

Controlador del modulo:

- `MesasController`: rutas bajo `/mesas` y `/tuneles/:tunel_id/mesas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/mesas
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de mesas requieren JWT.

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
  "path": "/mesas"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /mesas` | Cualquier usuario autenticado |
| `GET /mesas/:id` | Cualquier usuario autenticado |
| `GET /mesas/qr/:codigoQr` | Cualquier usuario autenticado |
| `GET /mesas/:id/historial` | Cualquier usuario autenticado |
| `GET /tuneles/:tunel_id/mesas` | Cualquier usuario autenticado |
| `POST /mesas` | `supervisor`, `admin_global` |
| `PATCH /mesas/:id` | `supervisor`, `admin_global` |
| `POST /mesas/:id/dar-de-baja` | `supervisor`, `admin_global` |
| `POST /mesas/:id/reactivar` | `supervisor`, `admin_global` |
| `DELETE /mesas/:id` | `admin_global` |

Notas:

- Listar, obtener, consultar por QR, historial y listado por tunel no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear, actualizar, dar de baja y reactivar requieren `supervisor` o `admin_global`.
- Eliminar requiere `admin_global`.
- El rol `admin` no habilita automaticamente las acciones de escritura si no esta listado arriba.

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
  "path": "/mesas"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `MESA_FIELD_IMMUTABLE` | Se intento editar un campo no permitido |
| `400` | `MESA_ESTADO_INVALIDO` | La accion no corresponde al estado actual |
| `400` | `MESA_SOLO_BAJA_DELETE` | Se intento eliminar una mesa que no esta dada de baja |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `404` | `MESA_QR_NOT_FOUND` | No existe mesa con ese codigo QR |
| `404` | `TUNEL_NOT_FOUND` | Tunel inexistente o fuera del tenant |
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
    "message": "plantas_estimadas must not be less than 1",
    "details": {
      "validationErrors": [
        {
          "message": "plantas_estimadas must not be less than 1"
        }
      ]
    }
  },
  "timestamp": "2026-06-05T22:00:00.000Z",
  "path": "/mesas"
}
```

## 8. Modelo de datos

### Mesa

Campos principales:

```ts
type MesaEstado = "activa" | "en_cosecha" | "baja";

type Mesa = {
  id: string;
  tenant_id: string;
  establecimiento_id: string;
  tunel_id: string;
  codigo_qr: string;
  posicion_actual: number | null;
  estado: MesaEstado;
  fecha_ultimo_trasplante: string | null;
  plantas_estimadas: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tunel?: {
    nombre: string;
    capacidad_maxima: number;
  };
};
```

Notas:

- `codigo_qr` lo genera el backend al crear la mesa.
- `posicion_actual` lo calcula el backend al crear la mesa dentro del tunel.
- `estado` no se edita con `PATCH`; cambia con acciones especificas.
- `establecimiento_id` y `tunel_id` se definen solo al crear.
- `plantas_estimadas` por defecto es `450` si no se envia.
- `activo` es un flag editable, independiente de `estado`.

### Historial de mesa

Tipos de evento conocidos:

```ts
type HistorialTipoEvento =
  | "trasplante"
  | "cosecha"
  | "cambio_posicion"
  | "aplicacion_quimica"
  | "reactivacion"
  | "baja";
```

Estructura esperada:

```ts
type HistorialMesa = {
  id: string;
  tenant_id: string;
  mesa_id: string;
  tipo_evento: HistorialTipoEvento;
  fecha_hora: string;
  usuario_id: string | null;
  datos: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
```

## 9. Query params comunes

### Paginacion

```txt
page=1
limit=20
```

Notas:

- `page` arranca en `1`.
- `limit` define cantidad por pagina.
- La respuesta paginada devuelve `meta.page`, `meta.limit` y `meta.total`.

### Ordenamiento

En `GET /mesas`:

| Param | Valores |
| --- | --- |
| `sortBy` | `created_at`, `posicion_actual`, `estado` |
| `sortOrder` | `ASC`, `DESC` |

Si no se envia un campo permitido, el backend ordena por `created_at DESC`.

En `GET /mesas/:id/historial`:

| Param | Valores |
| --- | --- |
| `sortBy` | `fecha_hora`, `created_at` |
| `sortOrder` | `ASC`, `DESC` |

Si no se envia un campo permitido, el backend ordena por `fecha_hora DESC`.

### Filtros de mesas

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `establecimiento_id` | UUID | Filtra mesas por establecimiento |
| `tunel_id` | UUID | Filtra mesas por tunel |
| `estado` | `activa`, `en_cosecha`, `baja` | Filtra por estado operativo |
| `activo` | boolean | Filtra por flag activo |
| `q` | string | Busca por `codigo_qr` |

Ejemplo:

```http
GET /mesas?page=1&limit=20&tunel_id=9e314fed-4062-4563-913f-a66f2fbb422e&estado=activa&activo=true&sortBy=posicion_actual&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar mesas

```http
GET /mesas
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `establecimiento_id` | No | UUID del establecimiento |
| `tunel_id` | No | UUID del tunel |
| `estado` | No | `activa`, `en_cosecha`, `baja` |
| `activo` | No | `true` o `false` |
| `q` | No | Busqueda por codigo QR |
| `sortBy` | No | `created_at`, `posicion_actual`, `estado` |
| `sortOrder` | No | `ASC` o `DESC` |

Ejemplo:

```http
GET /mesas?page=1&limit=20&estado=activa&activo=true&sortBy=created_at&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
      "posicion_actual": 1,
      "estado": "activa",
      "fecha_ultimo_trasplante": null,
      "plantas_estimadas": 450,
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

### 10.2. Crear mesa

```http
POST /mesas
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
  "plantas_estimadas": 450
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `establecimiento_id` | Si | UUID | Debe existir en el tenant |
| `tunel_id` | Si | UUID | Debe existir y pertenecer al establecimiento |
| `plantas_estimadas` | No | number | Entero mayor o igual a `1`; default `450` |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
    "posicion_actual": 1,
    "estado": "activa",
    "fecha_ultimo_trasplante": null,
    "plantas_estimadas": 450,
    "activo": true,
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Notas:

- El frontend no debe enviar `codigo_qr`, `posicion_actual`, `estado`, `tenant_id` ni `activo` al crear.
- La posicion se calcula como la siguiente posicion disponible dentro del tunel.
- Si el tunel no existe o no corresponde al establecimiento, la creacion falla.

### 10.3. Obtener mesa por ID

```http
GET /mesas/:id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /mesas/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
    "posicion_actual": 1,
    "estado": "activa",
    "fecha_ultimo_trasplante": null,
    "plantas_estimadas": 450,
    "activo": true,
    "tunel": {
      "nombre": "Tunel Norte",
      "capacidad_maxima": 100
    },
    "created_at": "2026-06-05T19:03:01.913Z",
    "updated_at": "2026-06-05T19:03:01.913Z",
    "deleted_at": null
  }
}
```

Errores comunes:

- `404 MESA_NOT_FOUND`: mesa inexistente, eliminada o fuera del tenant.

### 10.4. Obtener mesa por codigo QR

```http
GET /mesas/qr/:codigoQr
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /mesas/qr/7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
    "estado": "activa",
    "posicion_actual": 1,
    "plantas_estimadas": 450,
    "activo": true,
    "tunel": {
      "nombre": "Tunel Norte",
      "capacidad_maxima": 100
    }
  }
}
```

Errores comunes:

- `404 MESA_QR_NOT_FOUND`: no existe una mesa con ese QR en el tenant.

Notas:

- Esta ruta debe usarse para pantallas de escaneo.
- La ruta correcta es `/mesas/qr/:codigoQr`, no `/mesas/:codigoQr`.

### 10.5. Actualizar mesa

```http
PATCH /mesas/:id
```

Roles:

- `supervisor`
- `admin_global`

Body permitido:

```json
{
  "plantas_estimadas": 500,
  "activo": true
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `plantas_estimadas` | No | number | Entero mayor o igual a `1` |
| `activo` | No | boolean | Debe ser boolean real, no string |

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "plantas_estimadas": 500,
    "activo": true,
    "estado": "activa",
    "updated_at": "2026-06-05T20:10:00.000Z"
  }
}
```

Campos que no se pueden modificar por PATCH:

- `tenant_id`
- `establecimiento_id`
- `tunel_id`
- `codigo_qr`
- `posicion_actual`
- `estado`
- `fecha_ultimo_trasplante`
- `created_at`
- `updated_at`
- `deleted_at`

Errores comunes:

- `400 MESA_FIELD_IMMUTABLE`: se envio algun campo no permitido.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.
- `403 AUTH_FORBIDDEN`: usuario sin rol `supervisor` o `admin_global`.

### 10.6. Dar de baja mesa

```http
POST /mesas/:id/dar-de-baja
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "estado": "baja",
    "posicion_actual": null,
    "activo": true,
    "updated_at": "2026-06-05T20:20:00.000Z"
  }
}
```

Efectos:

- Cambia `estado` a `baja`.
- Setea `posicion_actual` en `null`.
- Crea un evento de historial con `tipo_evento: "baja"`.
- Registra auditoria de la accion.

Errores comunes:

- `400 MESA_ESTADO_INVALIDO`: la mesa ya esta dada de baja o no admite esta accion.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.

### 10.7. Reactivar mesa

```http
POST /mesas/:id/reactivar
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "estado": "activa",
    "posicion_actual": null,
    "activo": true,
    "updated_at": "2026-06-05T20:30:00.000Z"
  }
}
```

Efectos:

- Cambia `estado` a `activa`.
- Mantiene `posicion_actual` en `null`.
- Crea un evento de historial con `tipo_evento: "reactivacion"`.
- Registra auditoria de la accion.

Errores comunes:

- `400 MESA_ESTADO_INVALIDO`: solo se pueden reactivar mesas con `estado: "baja"`.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.

### 10.8. Eliminar mesa

```http
DELETE /mesas/:id
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

Regla importante:

- Solo se pueden eliminar mesas con `estado: "baja"`.

Errores comunes:

- `400 MESA_SOLO_BAJA_DELETE`: se intento eliminar una mesa activa o en cosecha.
- `403 AUTH_FORBIDDEN`: el usuario no es `admin_global`.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.

### 10.9. Obtener historial de mesa

```http
GET /mesas/:id/historial
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `sortBy` | No | `fecha_hora` o `created_at` |
| `sortOrder` | No | `ASC` o `DESC` |

Ejemplo:

```http
GET /mesas/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5/historial?page=1&limit=20&sortBy=fecha_hora&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "c9aa1049-7a35-4e33-9c01-8ffbdadbe43b",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tipo_evento": "baja",
      "fecha_hora": "2026-06-05T20:20:00.000Z",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "datos": null,
      "created_at": "2026-06-05T20:20:00.000Z",
      "updated_at": "2026-06-05T20:20:00.000Z",
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

### 10.10. Listar mesas por tunel

```http
GET /tuneles/:tunel_id/mesas
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /tuneles/9e314fed-4062-4563-913f-a66f2fbb422e/mesas
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "codigo_qr": "7ff2b0f5-56c3-4fd2-8a75-a05e59c2d305",
      "posicion_actual": 1,
      "estado": "activa",
      "plantas_estimadas": 450,
      "activo": true
    }
  ]
}
```

Notas:

- Este endpoint no es paginado.
- Devuelve mesas del tunel ordenadas por `posicion_actual ASC`.
- Solo devuelve mesas con `posicion_actual` distinto de `null`.
- Es util para vista de distribucion o mapa de tunel.

Errores comunes:

- `404 TUNEL_NOT_FOUND`: tunel inexistente o fuera del tenant.

## 11. Flujos recomendados para frontend

### Flujo de carga de listado

1. Verificar que exista `access_token`.
2. Enviar `GET /mesas?page=1&limit=20`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, tunel, estado, activo y QR.
6. Si hay `401`, redirigir a login o intentar refresh.
7. Si hay `400 BAD_REQUEST`, revisar query params enviados.

### Flujo de creacion

1. Cargar establecimientos disponibles.
2. Cargar tuneles del establecimiento seleccionado.
3. Validar `establecimiento_id` y `tunel_id`.
4. Validar `plantas_estimadas` solo si el usuario lo edita.
5. Enviar `POST /mesas`.
6. Si responde `201`, guardar `data.id` y `data.codigo_qr`.
7. Mostrar o imprimir el QR usando `codigo_qr`.

### Flujo de escaneo QR

1. Obtener el valor escaneado.
2. Enviar `GET /mesas/qr/:codigoQr`.
3. Si responde `200`, navegar al detalle de la mesa o mostrar resumen.
4. Si responde `404 MESA_QR_NOT_FOUND`, mostrar que el QR no corresponde a una mesa valida.

### Flujo de edicion

1. Cargar detalle con `GET /mesas/:id`.
2. Permitir editar solo `plantas_estimadas` y `activo`.
3. Enviar `PATCH /mesas/:id`.
4. Nunca incluir `estado`, `posicion_actual`, `codigo_qr`, `tunel_id` o `establecimiento_id`.
5. Si hay `MESA_FIELD_IMMUTABLE`, revisar el payload enviado.

### Flujo de baja y reactivacion

1. Cargar detalle de mesa.
2. Si `estado !== "baja"`, mostrar accion "Dar de baja".
3. Enviar `POST /mesas/:id/dar-de-baja`.
4. Si `estado === "baja"`, mostrar accion "Reactivar".
5. Enviar `POST /mesas/:id/reactivar`.
6. Refrescar detalle e historial despues de cada accion.

### Flujo de eliminacion

1. Permitir eliminar solo a `admin_global`.
2. Permitir la accion solo si `estado === "baja"`.
3. Mostrar confirmacion.
4. Enviar `DELETE /mesas/:id`.
5. Si responde `200`, quitar del listado o refrescar.
6. Si responde `MESA_SOLO_BAJA_DELETE`, indicar que primero debe darse de baja.

### Flujo de vista por tunel

1. Cargar tuneles disponibles.
2. Enviar `GET /tuneles/:tunel_id/mesas`.
3. Ordenar o renderizar usando `posicion_actual`.
4. Considerar que mesas reactivadas pueden volver con `posicion_actual: null` y no aparecer en este endpoint.

## 12. Consideraciones de UI/UX

- Mostrar crear, editar, baja y reactivar solo para `supervisor` o `admin_global`.
- Mostrar eliminar solo para `admin_global`.
- En el formulario de creacion, seleccionar primero establecimiento y luego tunel.
- No pedir `codigo_qr`; el backend lo genera.
- No permitir editar `estado` directamente.
- No permitir editar `posicion_actual` directamente desde este modulo.
- Mostrar `estado` con variantes claras: `activa`, `en_cosecha`, `baja`.
- Para busqueda por QR en listados, usar query param `q`.
- Para escaneo QR directo, usar `/mesas/qr/:codigoQr`.
- Si la UI quiere ocultar mesas inactivas, enviar `activo=true`.
- Si la UI quiere ocultar dadas de baja, enviar `estado=activa` o excluir `baja` desde frontend.
- Al dar de baja, explicar que la mesa pierde `posicion_actual`.
- Al reactivar, considerar que `posicion_actual` vuelve como `null`.
- En historial, mostrar eventos ordenados por fecha descendente.

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
  "/mesas?page=1&limit=20&estado=activa&activo=true&sortBy=created_at&sortOrder=DESC"
);

const mesas = response.data;
const meta = response.meta;
```

### Crear

```ts
const response = await apiFetch("/mesas", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    tunel_id: tunelId,
    plantas_estimadas: 450
  })
});

const mesa = response.data;
const codigoQr = mesa.codigo_qr;
```

### Obtener por ID

```ts
const response = await apiFetch(`/mesas/${mesaId}`);
const mesa = response.data;
```

### Obtener por QR

```ts
const response = await apiFetch(`/mesas/qr/${encodeURIComponent(codigoQr)}`);
const mesa = response.data;
```

### Actualizar

```ts
const response = await apiFetch(`/mesas/${mesaId}`, {
  method: "PATCH",
  body: JSON.stringify({
    plantas_estimadas: 500,
    activo: true
  })
});

const mesaActualizada = response.data;
```

### Dar de baja

```ts
const response = await apiFetch(`/mesas/${mesaId}/dar-de-baja`, {
  method: "POST",
  body: JSON.stringify({})
});

const mesaBaja = response.data;
```

### Reactivar

```ts
const response = await apiFetch(`/mesas/${mesaId}/reactivar`, {
  method: "POST",
  body: JSON.stringify({})
});

const mesaReactivada = response.data;
```

### Eliminar

```ts
await apiFetch(`/mesas/${mesaId}`, {
  method: "DELETE"
});
```

### Historial

```ts
const response = await apiFetch(
  `/mesas/${mesaId}/historial?page=1&limit=20&sortBy=fecha_hora&sortOrder=DESC`
);

const historial = response.data;
const meta = response.meta;
```

### Mesas por tunel

```ts
const response = await apiFetch(`/tuneles/${tunelId}/mesas`);
const mesasDelTunel = response.data;
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear mesa valida `establecimiento_id`.
- Crear mesa valida `tunel_id`.
- Crear mesa valida que `plantas_estimadas` sea entero mayor o igual a `1`.
- Crear mesa no envia `codigo_qr`.
- Crear mesa no envia `posicion_actual`.
- Crear mesa no envia `estado`.
- PATCH solo envia `plantas_estimadas` y `activo`.
- PATCH no envia `establecimiento_id`.
- PATCH no envia `tunel_id`.
- PATCH no envia `codigo_qr`.
- PATCH no envia `posicion_actual`.
- PATCH no envia `estado`.
- `activo` se envia como boolean real en JSON, no como string.
- La UI maneja `MESA_FIELD_IMMUTABLE`.
- La UI maneja `MESA_ESTADO_INVALIDO`.
- La UI maneja `MESA_SOLO_BAJA_DELETE`.
- La UI maneja `MESA_QR_NOT_FOUND`.
- Crear/editar/baja/reactivar se muestran solo para `supervisor` o `admin_global`.
- Eliminar se muestra solo para `admin_global`.
- Eliminar se habilita solo cuando `estado === "baja"`.
- Si se quieren listar solo activas, enviar `estado=activa`.
- Si se quieren listar solo con flag activo, enviar `activo=true`.
- Para escaneo QR se usa `/mesas/qr/:codigoQr`.
- Para distribucion de tunel se usa `/tuneles/:tunel_id/mesas`.
