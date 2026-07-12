# Modulo Trasplante - Guia para Frontend

## 1. Objetivo del modulo

El modulo de trasplante ejecuta el movimiento de bandejas desde nursery hacia una mesa de produccion dentro de un tunel.

Un trasplante:

- Pertenece al tenant actual.
- Toma una mesa disponible para recibir bandejas.
- Toma una o mas bandejas en estado `en_nursery`.
- Asigna la mesa a un tunel.
- Calcula la siguiente `posicion_actual` de la mesa dentro del tunel.
- Cambia las bandejas a estado `trasplantada`.
- Registra la relacion `mesa_bandeja`.
- Registra historial de mesa con evento `trasplante`.
- Registra auditoria.

Desde frontend, este modulo sirve para:

- Ejecutar trasplantes.
- Listar trasplantes asociados a una mesa.
- Mostrar la posicion asignada luego del trasplante.
- Mostrar que bandejas fueron trasplantadas.

Controlador del modulo:

- `TrasplanteController`: rutas bajo `/trasplante` y `/mesas/:mesa_id/trasplantes`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/trasplante
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de trasplante requieren JWT.

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
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/trasplante"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `POST /trasplante` | `operario`, `supervisor`, `admin_global` |
| `GET /mesas/:mesa_id/trasplantes` | Cualquier usuario autenticado |

Notas:

- Ejecutar trasplantes requiere `operario`, `supervisor` o `admin_global`.
- Listar trasplantes por mesa no tiene decorador `@Roles`, pero sigue requiriendo JWT.
- El rol `admin` no habilita automaticamente la ejecucion si no esta listado arriba.

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
    "code": "TRASPLANTE_MESA_ESTADO_INVALIDO",
    "message": "La mesa no esta en un estado valido para trasplante"
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/trasplante"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `404` | `TUNEL_NOT_FOUND` | Tunel inexistente o fuera del tenant |
| `404` | `BANDEJA_NOT_FOUND` | Bandeja inexistente o fuera del tenant |
| `422` | `TRASPLANTE_MESA_ESTADO_INVALIDO` | La mesa no esta disponible para trasplante |
| `422` | `TRASPLANTE_BANDEJA_INVALIDA` | Bandeja no disponible para trasplante |
| `422` | `TRASPLANTE_ESTABLECIMIENTO_MISMATCH` | Tunel y mesa no pertenecen al mismo establecimiento |
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
    "message": "bandeja_ids must contain at least 1 elements",
    "details": {
      "validationErrors": [
        {
          "message": "bandeja_ids must contain at least 1 elements"
        }
      ]
    }
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/trasplante"
}
```

## 8. Modelo de datos

### Body de trasplante

```ts
type CreateTrasplanteDto = {
  mesa_id: string;
  tunel_id: string;
  bandeja_ids: string[];
  observaciones?: string;
};
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `mesa_id` | Si | UUID | Mesa destino del trasplante |
| `tunel_id` | Si | UUID | Tunel donde queda posicionada la mesa |
| `bandeja_ids` | Si | UUID[] | Minimo 1 bandeja |
| `observaciones` | No | string | Texto libre, maximo 2000 caracteres |

### Resultado de trasplante

```ts
type ExecuteTrasplanteResult = {
  mesa_id: string;
  tunel_id: string;
  posicion_actual: number;
  bandejas_trasplantadas: string[];
};
```

### Relacion mesa-bandeja

```ts
type MesaBandeja = {
  mesa_id: string;
  bandeja_id: string;
  fecha_trasplante: string;
};
```

## 9. Reglas de negocio importantes

### Mesa trasplantable

La mesa solo puede recibir trasplante si cumple una de estas condiciones:

- `estado === "en_cosecha"`.
- `estado === "activa"` y `posicion_actual === null`.

Si la mesa esta `activa` con posicion asignada, o esta en otro estado no permitido, el backend responde:

```json
{
  "ok": false,
  "statusCode": 422,
  "error": {
    "code": "TRASPLANTE_MESA_ESTADO_INVALIDO"
  }
}
```

### Tunel

El tunel debe:

- Existir en el tenant.
- Pertenecer al mismo establecimiento que la mesa.

Si el tunel pertenece a otro establecimiento, el backend responde `TRASPLANTE_ESTABLECIMIENTO_MISMATCH`.

### Bandejas

Cada bandeja debe:

- Existir.
- Estar en estado `en_nursery`.
- Pertenecer al mismo establecimiento que la mesa.

Si una bandeja no cumple, el backend responde `TRASPLANTE_BANDEJA_INVALIDA`.

### Posicion FIFO

El backend calcula la nueva posicion de la mesa con:

```txt
MAX(posicion_actual del tunel) + 1
```

Solo considera mesas del mismo `tunel_id`, no eliminadas y con `posicion_actual` distinto de `null`.

El frontend no debe calcular ni enviar `posicion_actual`.

### Efectos del trasplante

Cuando el trasplante se ejecuta correctamente:

- Cada bandeja pasa a `estado = "trasplantada"`.
- Cada bandeja queda asociada a `mesa_id`.
- Cada bandeja recibe `fecha_trasplante`.
- Se inserta relacion en `mesa_bandeja`.
- La mesa pasa a `estado = "activa"`.
- La mesa recibe `tunel_id`.
- La mesa recibe `posicion_actual` calculada por backend.
- La mesa recibe `fecha_ultimo_trasplante`.
- Se crea historial de mesa con `tipo_evento = "trasplante"`.
- Se registra auditoria `trasplante_ejecutado`.

La operacion corre dentro de una transaccion. Si algo falla, no deberian quedar cambios parciales.

## 10. Query params

### Paginacion

```txt
page=1
limit=20
```

Notas:

- `page` arranca en `1`.
- `limit` tiene maximo efectivo `200`.
- La respuesta paginada devuelve `meta.page`, `meta.limit` y `meta.total`.

### Ordenamiento de trasplantes por mesa

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `sortOrder` | `ASC`, `DESC` | Ordena por `fecha_trasplante` |

El DTO tambien acepta `sortBy`, pero el service ordena siempre por `fecha_trasplante`.

## 11. Endpoints

### 11.1. Ejecutar trasplante

```http
POST /trasplante
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
  "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
  "bandeja_ids": [
    "4c033b74-1f8d-4389-9457-51cd5d3e3940"
  ],
  "observaciones": "Trasplante desde nursery a tunel norte"
}
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "posicion_actual": 7,
    "bandejas_trasplantadas": [
      "4c033b74-1f8d-4389-9457-51cd5d3e3940"
    ]
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: UUID invalido o `bandeja_ids` vacio.
- `403 AUTH_FORBIDDEN`: usuario sin rol permitido.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.
- `404 TUNEL_NOT_FOUND`: tunel inexistente o fuera del tenant.
- `404 BANDEJA_NOT_FOUND`: bandeja inexistente o fuera del tenant.
- `422 TRASPLANTE_MESA_ESTADO_INVALIDO`: la mesa no esta disponible.
- `422 TRASPLANTE_BANDEJA_INVALIDA`: alguna bandeja no esta disponible.
- `422 TRASPLANTE_ESTABLECIMIENTO_MISMATCH`: mesa y tunel no pertenecen al mismo establecimiento.

Notas:

- El endpoint responde `200`, no `201`.
- El frontend no debe enviar `posicion_actual`.
- El frontend no debe cambiar manualmente estados de mesa o bandejas; lo hace el backend.

### 11.2. Listar trasplantes por mesa

```http
GET /mesas/:mesa_id/trasplantes
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `sortOrder` | No | `ASC` o `DESC` |

Ejemplo:

```http
GET /mesas/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5/trasplantes?page=1&limit=20&sortOrder=DESC
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "bandeja_id": "4c033b74-1f8d-4389-9457-51cd5d3e3940",
      "fecha_trasplante": "2026-06-09T12:00:00.000Z"
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

## 12. Flujos recomendados para frontend

### Flujo de preparacion

1. Verificar que exista `access_token`.
2. Cargar establecimientos disponibles.
3. Cargar tuneles del establecimiento.
4. Cargar mesas candidatas del establecimiento.
5. Filtrar mesas trasplantables: `estado === "en_cosecha"` o `estado === "activa" && posicion_actual === null`.
6. Cargar bandejas del establecimiento.
7. Filtrar bandejas disponibles: `estado === "en_nursery"`.

### Flujo de ejecucion

1. Seleccionar una mesa trasplantable.
2. Seleccionar un tunel del mismo establecimiento.
3. Seleccionar una o mas bandejas disponibles.
4. Validar que `bandeja_ids.length > 0`.
5. Enviar `POST /trasplante`.
6. Mostrar `posicion_actual` devuelta por backend.
7. Mostrar `bandejas_trasplantadas`.
8. Refrescar detalle de mesa.
9. Refrescar listado de bandejas.
10. Refrescar historial de mesa si la pantalla lo muestra.

### Flujo de consulta por mesa

1. Cargar detalle de mesa.
2. Enviar `GET /mesas/:mesa_id/trasplantes?page=1&limit=20&sortOrder=DESC`.
3. Mostrar bandejas trasplantadas y fecha.
4. Usar `meta` para paginacion.

## 13. Consideraciones de UI/UX

- Mostrar accion de trasplante solo para `operario`, `supervisor` o `admin_global`.
- No mostrar accion para mesas que no cumplen estado trasplantable.
- Mostrar solo bandejas `en_nursery` como seleccionables.
- Usar selector multiple para `bandeja_ids`.
- Mostrar mensaje claro si no hay bandejas disponibles.
- Mostrar mensaje claro si no hay mesas disponibles.
- No pedir `posicion_actual`; la calcula el backend.
- Despues de ejecutar, mostrar la posicion asignada.
- Deshabilitar el boton de enviar mientras corre la request, porque la operacion cambia varios estados.
- Ante `TRASPLANTE_MESA_ESTADO_INVALIDO`, refrescar la mesa porque otro usuario pudo haberla modificado.
- Ante `TRASPLANTE_BANDEJA_INVALIDA`, refrescar bandejas porque alguna pudo haber sido usada.
- Ante `TRASPLANTE_ESTABLECIMIENTO_MISMATCH`, revisar filtros de establecimiento en los selects.

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

### Ejecutar trasplante

```ts
const response = await apiFetch("/trasplante", {
  method: "POST",
  body: JSON.stringify({
    mesa_id: mesaId,
    tunel_id: tunelId,
    bandeja_ids: bandejaIds,
    observaciones: "Trasplante desde frontend"
  })
});

const result = response.data;
const posicionActual = result.posicion_actual;
const bandejasTrasplantadas = result.bandejas_trasplantadas;
```

### Listar trasplantes por mesa

```ts
const response = await apiFetch(
  `/mesas/${mesaId}/trasplantes?page=1&limit=20&sortOrder=DESC`
);

const trasplantes = response.data;
const meta = response.meta;
```

### Manejo de errores especificos

```ts
try {
  await apiFetch("/trasplante", {
    method: "POST",
    body: JSON.stringify({
      mesa_id: mesaId,
      tunel_id: tunelId,
      bandeja_ids: bandejaIds
    })
  });
} catch (err: any) {
  const code = err?.error?.code;

  if (code === "TRASPLANTE_MESA_ESTADO_INVALIDO") {
    // Refrescar mesa y mostrar que ya no esta disponible.
  }

  if (code === "TRASPLANTE_BANDEJA_INVALIDA") {
    // Refrescar bandejas y pedir nueva seleccion.
  }

  if (code === "TRASPLANTE_ESTABLECIMIENTO_MISMATCH") {
    // Revisar seleccion de tunel/mesa.
  }
}
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Ejecutar trasplante se muestra solo para `operario`, `supervisor` o `admin_global`.
- El formulario pide `mesa_id`.
- El formulario pide `tunel_id`.
- El formulario pide al menos una bandeja.
- `bandeja_ids` se envia como array de UUIDs.
- `observaciones` es opcional.
- La UI filtra mesas trasplantables.
- La UI filtra bandejas `en_nursery`.
- La UI filtra tuneles del mismo establecimiento.
- No se envia `posicion_actual`.
- La respuesta `POST /trasplante` se trata como `200`.
- Al terminar, se muestra `posicion_actual`.
- Al terminar, se refresca mesa.
- Al terminar, se refrescan bandejas.
- Al terminar, se refresca historial/trasplantes si la pantalla lo muestra.
- La UI maneja `TRASPLANTE_MESA_ESTADO_INVALIDO`.
- La UI maneja `TRASPLANTE_BANDEJA_INVALIDA`.
- La UI maneja `TRASPLANTE_ESTABLECIMIENTO_MISMATCH`.
- El listado por mesa lee `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
