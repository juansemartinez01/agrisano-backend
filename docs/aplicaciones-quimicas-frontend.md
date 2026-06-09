# Modulo Aplicaciones Quimicas - Guia para Frontend

## 1. Objetivo del modulo

El modulo de aplicaciones quimicas registra aplicaciones de productos quimicos sobre bandejas de nursery o mesas de invernadero.

Cada aplicacion:

- Pertenece a un tenant.
- Pertenece a un establecimiento.
- Tiene un contexto: `nursery` o `invernadero`.
- Tiene uno o mas productos quimicos aplicados.
- Descuenta stock de los quimicos usados.
- Registra el usuario que hizo la aplicacion.
- Se vincula a bandejas o mesas segun el contexto.

Desde frontend, este modulo sirve para:

- Registrar aplicaciones quimicas en nursery.
- Registrar aplicaciones quimicas en invernadero.
- Listar aplicaciones con filtros.
- Consultar el detalle completo de una aplicacion.
- Ver aplicaciones hechas sobre una mesa.
- Ver aplicaciones hechas sobre una bandeja.
- Mostrar warnings cuando una aplicacion deja stock proyectado negativo.

Controlador del modulo:

- `AplicacionesQuimicasController`: rutas bajo `/aplicaciones-quimicas`, `/mesas/:mesa_id/aplicaciones` y `/bandejas/:bandeja_id/aplicaciones`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/aplicaciones-quimicas
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de aplicaciones quimicas requieren JWT.

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
  "timestamp": "2026-06-06T12:00:00.000Z",
  "path": "/aplicaciones-quimicas"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /aplicaciones-quimicas` | Cualquier usuario autenticado |
| `GET /aplicaciones-quimicas/:id` | Cualquier usuario autenticado |
| `GET /mesas/:mesa_id/aplicaciones` | Cualquier usuario autenticado |
| `GET /bandejas/:bandeja_id/aplicaciones` | Cualquier usuario autenticado |
| `POST /aplicaciones-quimicas` | `operario`, `supervisor`, `admin_global` |

Notas:

- Listar y consultar aplicaciones no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- Crear aplicaciones requiere `operario`, `supervisor` o `admin_global`.
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
  "requestId": "73f4ee70-9f53-40ca-909b-ed202713b7e3",
  "statusCode": 422,
  "error": {
    "code": "APLICACION_TARGET_INVALIDO",
    "message": "La mesa no pertenece al establecimiento indicado"
  },
  "timestamp": "2026-06-06T12:00:00.000Z",
  "path": "/aplicaciones-quimicas"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `APLICACION_NOT_FOUND` | Aplicacion inexistente o fuera del tenant |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `404` | `BANDEJA_NOT_FOUND` | Bandeja inexistente o fuera del tenant |
| `404` | `QUIMICO_NOT_FOUND` | Quimico inexistente o fuera del tenant |
| `404` | `RECETA_NOT_FOUND` | Receta inexistente o fuera del tenant |
| `422` | `APLICACION_CONTEXTO_INVALIDO` | Se envio `receta_id` en contexto `invernadero` |
| `422` | `APLICACION_DETALLES_VACIOS` | No hay productos quimicos en `detalles` |
| `422` | `APLICACION_TARGETS_VACIOS` | Faltan bandejas o mesas segun contexto |
| `422` | `APLICACION_TARGET_INVALIDO` | Bandeja, mesa o quimico no corresponde al contexto/establecimiento |
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
    "message": "cantidad must be a positive number",
    "details": {
      "validationErrors": [
        {
          "message": "cantidad must be a positive number"
        }
      ]
    }
  },
  "timestamp": "2026-06-06T12:00:00.000Z",
  "path": "/aplicaciones-quimicas"
}
```

## 8. Modelo de datos

### Contextos

```ts
type AplicacionContexto = "nursery" | "invernadero";
```

### Aplicacion quimica

```ts
type AplicacionQuimica = {
  id: string;
  tenant_id: string | null;
  establecimiento_id: string;
  contexto: "nursery" | "invernadero";
  receta_id: string | null;
  observaciones: string | null;
  usuario_id: string;
  fecha_hora: string;
  created_at: string;
  updated_at: string;
};
```

### Detalle

```ts
type AplicacionQuimicaDetalle = {
  id: string;
  aplicacion_id: string;
  quimico_id: string;
  cantidad: number;
  unidad_medida: string;
};
```

Notas:

- `unidad_medida` no se envia desde frontend. El backend la copia desde el quimico.
- `cantidad` debe ser positiva.
- Cada detalle descuenta stock del quimico correspondiente.

### Respuesta de creacion

```ts
type StockWarning = {
  quimico_id: string;
  nombre: string;
  projected_stock: number;
};

type CreateAplicacionResult = {
  aplicacion: AplicacionQuimica;
  detalles: AplicacionQuimicaDetalle[];
  afectados: {
    bandeja_ids?: string[];
    mesa_ids?: string[];
  };
  warnings: StockWarning[];
};
```

`warnings` indica que el stock proyectado queda negativo. El backend no bloquea la operacion por stock negativo; solo devuelve la advertencia.

### Respuesta de detalle

```ts
type AplicacionConDetalle = {
  aplicacion: AplicacionQuimica;
  detalles: AplicacionQuimicaDetalle[];
  bandeja_ids?: string[];
  mesa_ids?: string[];
};
```

## 9. Reglas de negocio importantes

### Contexto nursery

Para `contexto: "nursery"`:

- Debe enviarse `bandeja_ids`.
- `bandeja_ids` debe tener al menos una bandeja.
- Cada bandeja debe estar en estado `en_nursery`.
- Cada bandeja debe pertenecer al `establecimiento_id` enviado.
- Puede enviarse `receta_id`.
- No es obligatorio enviar `mesa_ids`.

### Contexto invernadero

Para `contexto: "invernadero"`:

- Debe enviarse `mesa_ids`.
- `mesa_ids` debe tener al menos una mesa.
- Cada mesa debe estar en estado `activa` o `en_cosecha`.
- Cada mesa debe pertenecer al `establecimiento_id` enviado.
- No se puede enviar `receta_id`.
- No es obligatorio enviar `bandeja_ids`.

### Quimicos

Para cada item en `detalles`:

- `quimico_id` debe existir.
- El quimico debe pertenecer al mismo `establecimiento_id`.
- `cantidad` debe ser positiva.
- El backend descuenta `cantidad` de `stock_actual`.
- Si el stock proyectado queda negativo, la respuesta trae un item en `warnings`.

### Transaccion

La creacion de la aplicacion se ejecuta en transaccion:

- Inserta la aplicacion.
- Inserta detalles.
- Descuenta stock.
- Vincula bandejas o mesas.
- Si es invernadero, agrega evento al historial de mesa con tipo `aplicacion_quimica`.

Si algo falla, la transaccion se revierte.

## 10. Query params comunes

### Paginacion

```txt
page=1
limit=20
```

Notas:

- `page` arranca en `1`.
- `limit` tiene maximo efectivo `200`.
- La respuesta paginada devuelve `meta.page`, `meta.limit` y `meta.total`.

### Filtros de listado general

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `establecimiento_id` | UUID | Filtra por establecimiento |
| `contexto` | `nursery`, `invernadero` | Filtra por tipo de aplicacion |
| `receta_id` | UUID | Filtra por receta |
| `quimico_id` | UUID | Filtra aplicaciones que usaron ese quimico |
| `fecha_desde` | ISO 8601 | Filtra desde `fecha_hora` |
| `fecha_hasta` | ISO 8601 | Filtra hasta `fecha_hora` |
| `sortBy` | string | Permitidos: `fecha_hora`, `created_at` |
| `sortOrder` | `ASC`, `DESC` | Orden |

Ejemplo:

```http
GET /aplicaciones-quimicas?page=1&limit=20&contexto=nursery&quimico_id=7aab9d6e-a454-4135-9d7e-09973f33f801&sortBy=fecha_hora&sortOrder=DESC
```

## 11. Endpoints

### 11.1. Listar aplicaciones

```http
GET /aplicaciones-quimicas
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `establecimiento_id` | No | UUID del establecimiento |
| `contexto` | No | `nursery` o `invernadero` |
| `receta_id` | No | UUID de receta |
| `quimico_id` | No | UUID de quimico usado en detalle |
| `fecha_desde` | No | Fecha ISO 8601 |
| `fecha_hasta` | No | Fecha ISO 8601 |
| `sortBy` | No | `fecha_hora` o `created_at` |
| `sortOrder` | No | `ASC` o `DESC` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "contexto": "nursery",
      "receta_id": "7542954c-1c0f-4be2-b150-bb9233ed15e3",
      "observaciones": "Aplicacion preventiva",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "fecha_hora": "2026-06-06T12:00:00.000Z",
      "created_at": "2026-06-06T12:00:00.000Z",
      "updated_at": "2026-06-06T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### 11.2. Crear aplicacion nursery

```http
POST /aplicaciones-quimicas
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "contexto": "nursery",
  "receta_id": "7542954c-1c0f-4be2-b150-bb9233ed15e3",
  "observaciones": "Aplicacion preventiva en bandejas",
  "detalles": [
    {
      "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
      "cantidad": 1.5
    }
  ],
  "bandeja_ids": [
    "4c033b74-1f8d-4389-9457-51cd5d3e3940"
  ]
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `establecimiento_id` | Si | UUID | Debe existir en el tenant |
| `contexto` | Si | enum | Debe ser `nursery` |
| `receta_id` | No | UUID | Permitido solo en nursery |
| `observaciones` | No | string | Texto libre |
| `detalles` | Si | array | Minimo 1 item |
| `detalles[].quimico_id` | Si | UUID | Quimico del mismo establecimiento |
| `detalles[].cantidad` | Si | number | Positivo |
| `bandeja_ids` | Si | UUID[] | Minimo 1 bandeja en estado `en_nursery` |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "contexto": "nursery",
      "receta_id": "7542954c-1c0f-4be2-b150-bb9233ed15e3",
      "observaciones": "Aplicacion preventiva en bandejas",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "fecha_hora": "2026-06-06T12:00:00.000Z",
      "created_at": "2026-06-06T12:00:00.000Z",
      "updated_at": "2026-06-06T12:00:00.000Z"
    },
    "detalles": [
      {
        "id": "da814e36-031e-49f9-8db6-7d6c5d751b34",
        "aplicacion_id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
        "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "cantidad": "1.500",
        "unidad_medida": "litros"
      }
    ],
    "afectados": {
      "bandeja_ids": [
        "4c033b74-1f8d-4389-9457-51cd5d3e3940"
      ]
    },
    "warnings": []
  }
}
```

Notas:

- `cantidad` puede volver como string si TypeORM serializa decimal como string.
- El frontend debe leer `data.warnings` para avisos de stock negativo.

### 11.3. Crear aplicacion invernadero

```http
POST /aplicaciones-quimicas
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "contexto": "invernadero",
  "observaciones": "Aplicacion sobre mesas activas",
  "detalles": [
    {
      "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
      "cantidad": 2
    }
  ],
  "mesa_ids": [
    "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5"
  ]
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `establecimiento_id` | Si | UUID | Debe existir en el tenant |
| `contexto` | Si | enum | Debe ser `invernadero` |
| `receta_id` | No | UUID | No enviar en invernadero |
| `observaciones` | No | string | Texto libre |
| `detalles` | Si | array | Minimo 1 item |
| `detalles[].quimico_id` | Si | UUID | Quimico del mismo establecimiento |
| `detalles[].cantidad` | Si | number | Positivo |
| `mesa_ids` | Si | UUID[] | Minimo 1 mesa activa o en cosecha |

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "contexto": "invernadero",
      "receta_id": null,
      "observaciones": "Aplicacion sobre mesas activas",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "fecha_hora": "2026-06-06T12:00:00.000Z",
      "created_at": "2026-06-06T12:00:00.000Z",
      "updated_at": "2026-06-06T12:00:00.000Z"
    },
    "detalles": [
      {
        "id": "b0ebf981-5890-4130-9592-60c0e4b11c65",
        "aplicacion_id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
        "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "cantidad": "2.000",
        "unidad_medida": "litros"
      }
    ],
    "afectados": {
      "mesa_ids": [
        "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5"
      ]
    },
    "warnings": [
      {
        "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "nombre": "Producto X",
        "projected_stock": -1
      }
    ]
  }
}
```

Notas:

- Si hay `warnings`, la aplicacion igual fue creada.
- En contexto `invernadero`, el backend registra tambien historial de mesa con evento `aplicacion_quimica`.

### 11.4. Obtener aplicacion por ID

```http
GET /aplicaciones-quimicas/:id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /aplicaciones-quimicas/35f8083d-5a3f-4a8d-88f4-df36e7e2b32a
```

Respuesta `200` para nursery:

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
      "contexto": "nursery",
      "receta_id": "7542954c-1c0f-4be2-b150-bb9233ed15e3",
      "observaciones": "Aplicacion preventiva en bandejas",
      "fecha_hora": "2026-06-06T12:00:00.000Z"
    },
    "detalles": [
      {
        "id": "da814e36-031e-49f9-8db6-7d6c5d751b34",
        "aplicacion_id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
        "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "cantidad": "1.500",
        "unidad_medida": "litros"
      }
    ],
    "bandeja_ids": [
      "4c033b74-1f8d-4389-9457-51cd5d3e3940"
    ]
  }
}
```

Respuesta `200` para invernadero:

```json
{
  "ok": true,
  "data": {
    "aplicacion": {
      "id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
      "contexto": "invernadero",
      "receta_id": null,
      "observaciones": "Aplicacion sobre mesas activas",
      "fecha_hora": "2026-06-06T12:00:00.000Z"
    },
    "detalles": [
      {
        "id": "b0ebf981-5890-4130-9592-60c0e4b11c65",
        "aplicacion_id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
        "quimico_id": "7aab9d6e-a454-4135-9d7e-09973f33f801",
        "cantidad": "2.000",
        "unidad_medida": "litros"
      }
    ],
    "mesa_ids": [
      "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5"
    ]
  }
}
```

Errores comunes:

- `404 APLICACION_NOT_FOUND`: aplicacion inexistente o fuera del tenant.

### 11.5. Listar aplicaciones por mesa

```http
GET /mesas/:mesa_id/aplicaciones
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `sortOrder` | No | `ASC` o `DESC`; ordena por `fecha_hora` |

Ejemplo:

```http
GET /mesas/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5/aplicaciones?page=1&limit=20&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "35f8083d-5a3f-4a8d-88f4-df36e7e2b32a",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "contexto": "invernadero",
      "receta_id": null,
      "observaciones": "Aplicacion sobre mesas activas",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "fecha_hora": "2026-06-06T12:00:00.000Z",
      "created_at": "2026-06-06T12:00:00.000Z",
      "updated_at": "2026-06-06T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Errores comunes:

- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.

### 11.6. Listar aplicaciones por bandeja

```http
GET /bandejas/:bandeja_id/aplicaciones
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `sortOrder` | No | `ASC` o `DESC`; ordena por `fecha_hora` |

Ejemplo:

```http
GET /bandejas/4c033b74-1f8d-4389-9457-51cd5d3e3940/aplicaciones?page=1&limit=20&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "5af844c7-3f48-4eb1-b1f5-b545399c9658",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "contexto": "nursery",
      "receta_id": "7542954c-1c0f-4be2-b150-bb9233ed15e3",
      "observaciones": "Aplicacion preventiva en bandejas",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "fecha_hora": "2026-06-06T12:00:00.000Z",
      "created_at": "2026-06-06T12:00:00.000Z",
      "updated_at": "2026-06-06T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Errores comunes:

- `404 BANDEJA_NOT_FOUND`: bandeja inexistente o fuera del tenant.

## 12. Flujos recomendados para frontend

### Flujo de carga de listado

1. Verificar que exista `access_token`.
2. Enviar `GET /aplicaciones-quimicas?page=1&limit=20`.
3. Mostrar `data` como filas.
4. Usar `meta.total`, `meta.page` y `meta.limit` para paginacion.
5. Permitir filtros por establecimiento, contexto, receta, quimico y rango de fechas.
6. Si hay `401`, redirigir a login o intentar refresh.
7. Si hay `400 BAD_REQUEST`, revisar query params enviados.

### Flujo de creacion nursery

1. Cargar establecimientos disponibles.
2. Cargar bandejas del establecimiento.
3. Permitir seleccionar solo bandejas en estado `en_nursery`.
4. Cargar quimicos del establecimiento.
5. Opcionalmente cargar recetas disponibles.
6. Validar que haya al menos un quimico en `detalles`.
7. Validar que haya al menos una bandeja.
8. Enviar `POST /aplicaciones-quimicas` con `contexto: "nursery"`.
9. Si la respuesta trae `warnings`, mostrarlos como advertencia de stock.
10. Refrescar stock de quimicos usados.

### Flujo de creacion invernadero

1. Cargar establecimientos disponibles.
2. Cargar mesas del establecimiento.
3. Permitir seleccionar solo mesas con estado `activa` o `en_cosecha`.
4. Cargar quimicos del establecimiento.
5. No mostrar selector de receta para invernadero.
6. Validar que haya al menos un quimico en `detalles`.
7. Validar que haya al menos una mesa.
8. Enviar `POST /aplicaciones-quimicas` con `contexto: "invernadero"`.
9. Si la respuesta trae `warnings`, mostrarlos como advertencia de stock.
10. Refrescar stock de quimicos usados.
11. Si la UI muestra historial de mesa, refrescarlo.

### Flujo de detalle

1. Cargar aplicacion con `GET /aplicaciones-quimicas/:id`.
2. Mostrar datos principales desde `data.aplicacion`.
3. Mostrar productos desde `data.detalles`.
4. Si existe `data.bandeja_ids`, mostrar targets de nursery.
5. Si existe `data.mesa_ids`, mostrar targets de invernadero.

## 13. Consideraciones de UI/UX

- Mostrar crear solo para `operario`, `supervisor` o `admin_global`.
- Separar formulario por contexto: `nursery` e `invernadero`.
- Para `nursery`, mostrar selector de bandejas y permitir receta.
- Para `invernadero`, mostrar selector de mesas y ocultar receta.
- No enviar `receta_id` cuando `contexto` es `invernadero`.
- No enviar `unidad_medida`; la define el backend desde el quimico.
- Validar `cantidad` como numero positivo.
- Permitir multiples quimicos en `detalles`.
- Mostrar unidad de medida del quimico en UI antes de enviar, aunque no se envie.
- Mostrar `warnings` de stock negativo despues de crear.
- Si `warnings.length > 0`, no tratarlo como error: la aplicacion fue creada.
- En filtros de fecha, enviar valores ISO 8601.
- En listados, ordenar por defecto por `fecha_hora DESC`.

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

### Listar

```ts
const response = await apiFetch(
  "/aplicaciones-quimicas?page=1&limit=20&contexto=nursery&sortBy=fecha_hora&sortOrder=DESC"
);

const aplicaciones = response.data;
const meta = response.meta;
```

### Crear nursery

```ts
const response = await apiFetch("/aplicaciones-quimicas", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    contexto: "nursery",
    receta_id: recetaId,
    observaciones: "Aplicacion preventiva",
    detalles: [
      {
        quimico_id: quimicoId,
        cantidad: 1.5
      }
    ],
    bandeja_ids: [bandejaId]
  })
});

const result = response.data;
const warnings = result.warnings;
```

### Crear invernadero

```ts
const response = await apiFetch("/aplicaciones-quimicas", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    contexto: "invernadero",
    observaciones: "Aplicacion sobre mesa",
    detalles: [
      {
        quimico_id: quimicoId,
        cantidad: 2
      }
    ],
    mesa_ids: [mesaId]
  })
});

const result = response.data;
const warnings = result.warnings;
```

### Obtener por ID

```ts
const response = await apiFetch(`/aplicaciones-quimicas/${aplicacionId}`);
const detalle = response.data;
```

### Listar por mesa

```ts
const response = await apiFetch(
  `/mesas/${mesaId}/aplicaciones?page=1&limit=20&sortOrder=DESC`
);

const aplicaciones = response.data;
```

### Listar por bandeja

```ts
const response = await apiFetch(
  `/bandejas/${bandejaId}/aplicaciones?page=1&limit=20&sortOrder=DESC`
);

const aplicaciones = response.data;
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
- Crear aplicacion se muestra solo para `operario`, `supervisor` o `admin_global`.
- El formulario separa `nursery` e `invernadero`.
- `contexto` se envia como `nursery` o `invernadero`.
- En `nursery`, se envia `bandeja_ids`.
- En `nursery`, las bandejas seleccionables estan en estado `en_nursery`.
- En `nursery`, `receta_id` es opcional.
- En `invernadero`, se envia `mesa_ids`.
- En `invernadero`, las mesas seleccionables estan en estado `activa` o `en_cosecha`.
- En `invernadero`, no se envia `receta_id`.
- `detalles` tiene al menos un item.
- Cada detalle envia `quimico_id`.
- Cada detalle envia `cantidad` positiva.
- No se envia `unidad_medida`.
- Los quimicos seleccionables pertenecen al establecimiento.
- Si `warnings.length > 0`, mostrar advertencia de stock negativo.
- Despues de crear, refrescar stock de quimicos usados.
- Despues de crear invernadero, refrescar historial de mesas si la pantalla lo muestra.
- Fechas de filtros se envian como ISO 8601.
- Ordenamiento del listado general usa `fecha_hora` o `created_at`.



Cambios en el módulo de Aplicaciones Químicas (M09) — Dosis, carencia y múltiples mesas

POST /aplicaciones-quimicas — Campos nuevos requeridos

Se agregaron quimico_id y dosis como campos obligatorios en el body. Reemplazan el rol que tenía detalles[] para la mayoría de los casos simples.


{
  "establecimiento_id": "...",
  "contexto": "invernadero",
  "quimico_id": "uuid-del-quimico",
  "dosis": 2.5,
  "dosis_unidad": "ml/l",
  "mesa_ids": ["uuid-mesa-1", "uuid-mesa-2"],
  "observaciones": "Aplicación preventiva"
}
detalles[] ahora es opcional. Usalo solo si la aplicación involucra productos adicionales al primario (mezcla de tanque, coadyuvantes, etc.). Si lo enviás, no repitas en él el quimico_id principal para evitar doble descuento de stock.

Campo dosis_unidad — Validación en servidor

Si se envía dosis_unidad y no coincide con la rate_unidad configurada en el químico, la API devuelve 422:


{
  "code": "APLICACION_DOSIS_UNIDAD_MISMATCH",
  "message": "La dosis_unidad 'kg/l' no coincide con rate_unidad del químico ('ml/l'). Usá ml/l."
}
Si no se envía dosis_unidad, se usa automáticamente la del químico. Recomendado: enviarlo siempre para detectar errores de tipeo del operador.

GET /aplicaciones-quimicas/:id — Respuesta ampliada

El objeto aplicacion ahora incluye los campos snapshotteados al momento de la aplicación:


{
  "aplicacion": {
    "id": "...",
    "quimico_id": "...",
    "dosis": 2.5,
    "dosis_unidad": "ml/l",
    "batch": "BT-4421",
    "withholding_period_dias": 7,
    "contexto": "invernadero",
    ...
  }
}
batch y withholding_period_dias son el valor que tenía el químico en el momento de la aplicación — no cambian aunque el químico se actualice después.

Carencia (withholding_period_dias)

Cuando el químico tiene withholding_period_dias > 0, al registrar la aplicación:

Cada mesa afectada queda con carencia_hasta seteado (fecha_aplicacion + N días)
El historial de la mesa registra un evento en_carencia
El campo carencia_hasta es visible en la respuesta de GET /mesas/:id
Ejemplo: aplicación el 09/06/2026 con carencia de 7 días → carencia_hasta: "2026-06-16".

Sugerencia para el front: si mesa.carencia_hasta >= hoy, mostrar la mesa en rojo o con un badge de advertencia. Una vez pasada la fecha, la carencia vence automáticamente (no hay acción del backend, el front compara la fecha).

Stock — descuento automático

Al registrar una aplicación de tipo invernadero, el stock del químico principal se descuenta automáticamente:

descuento = dosis × cantidad_de_mesas

Si el stock resultante queda negativo, la operación igual se procesa pero la respuesta incluye un array warnings:


{
  "warnings": [
    {
      "quimico_id": "...",
      "nombre": "Fungicida X",
      "projected_stock": -1.5
    }
  ]
}
Valores válidos para dosis_unidad

"kg/l" · "g/l" · "ml/l" · "l/l"