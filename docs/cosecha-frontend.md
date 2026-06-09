# Modulo Cosecha - Guia para Frontend

## 1. Objetivo del modulo

El modulo de cosecha registra la cosecha de una mesa productiva.

Una cosecha:

- Pertenece al tenant actual.
- Se registra sobre una mesa.
- Toma automaticamente el tunel actual de la mesa.
- Guarda el peso cosechado en kilogramos.
- Guarda la posicion de la mesa al momento de cosechar.
- Cambia la mesa a estado `en_cosecha`.
- Libera la posicion actual de la mesa.
- Recalcula el FIFO del tunel.
- Registra historial de mesa con evento `cosecha`.
- Registra auditoria.

Desde frontend, este modulo sirve para:

- Registrar cosechas.
- Listar cosechas con filtros.
- Consultar el detalle de una cosecha.
- Listar cosechas de una mesa.
- Refrescar el tablero FIFO despues de cosechar.

Controlador del modulo:

- `CosechaController`: rutas bajo `/cosecha` y `/mesas/:mesa_id/cosechas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/cosecha
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de cosecha requieren JWT.

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
  "path": "/cosecha"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `POST /cosecha` | `operario`, `supervisor`, `admin_global` |
| `GET /cosecha` | Cualquier usuario autenticado |
| `GET /cosecha/:id` | Cualquier usuario autenticado |
| `GET /mesas/:mesa_id/cosechas` | Cualquier usuario autenticado |

Notas:

- Registrar cosecha requiere `operario`, `supervisor` o `admin_global`.
- Listar y consultar cosechas no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- El rol `admin` no habilita automaticamente la registracion si no esta listado arriba.

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
    "code": "COSECHA_MESA_NO_DISPONIBLE",
    "message": "La mesa no esta disponible para cosecha"
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/cosecha"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | El usuario no tiene rol permitido |
| `404` | `COSECHA_NOT_FOUND` | Cosecha inexistente o fuera del tenant |
| `404` | `MESA_NOT_FOUND` | Mesa inexistente o fuera del tenant |
| `422` | `COSECHA_MESA_NO_DISPONIBLE` | La mesa no esta activa en posicion 1 |
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
    "message": "peso_kg must not be less than 0.001",
    "details": {
      "validationErrors": [
        {
          "message": "peso_kg must not be less than 0.001"
        }
      ]
    }
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/cosecha"
}
```

## 8. Modelo de datos

### Body de cosecha

```ts
type CreateCosechaDto = {
  mesa_id: string;
  peso_kg: number;
  observaciones?: string;
};
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `mesa_id` | Si | UUID | Mesa a cosechar |
| `peso_kg` | Si | number | Minimo `0.001`, maximo `9999999.999` |
| `observaciones` | No | string | Maximo 2000 caracteres |

### Cosecha

```ts
type Cosecha = {
  id: string;
  tenant_id: string | null;
  mesa_id: string;
  tunel_id: string;
  posicion_al_momento: number;
  fecha_hora: string;
  peso_kg: number | string;
  usuario_id: string;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
};
```

Notas:

- `peso_kg` puede volver como string si TypeORM serializa decimal como string.
- `tunel_id` lo toma el backend desde la mesa.
- `posicion_al_momento` queda fijo en `1` porque solo se puede cosechar la primera mesa del FIFO.

### Resultado de registrar cosecha

```ts
type RegistrarCosechaResult = {
  cosecha: Cosecha;
  mesa_id: string;
  tunel_id: string;
  posicion_recalculada: boolean;
};
```

## 9. Reglas de negocio importantes

### Mesa disponible para cosecha

La mesa solo puede cosecharse si cumple ambas condiciones:

- `estado === "activa"`.
- `posicion_actual === 1`.

Si no cumple, el backend responde:

```json
{
  "ok": false,
  "statusCode": 422,
  "error": {
    "code": "COSECHA_MESA_NO_DISPONIBLE"
  }
}
```

### Efectos de registrar cosecha

Cuando la cosecha se registra correctamente:

- Se crea un registro en `cosechas`.
- Se guarda `mesa_id`.
- Se guarda `tunel_id` desde la mesa.
- Se guarda `posicion_al_momento = 1`.
- Se guarda `peso_kg`.
- Se guarda `usuario_id`.
- La mesa pasa a `estado = "en_cosecha"`.
- La mesa pasa a `posicion_actual = null`.
- Las mesas restantes del mismo tunel con `posicion_actual > 1` bajan una posicion.
- Se crea historial de mesa con `tipo_evento = "cosecha"`.
- Se registra auditoria `cosecha_registrada`.

La operacion corre dentro de una transaccion. Si algo falla, no deberian quedar cambios parciales.

### FIFO

La cosecha libera la posicion 1 del tunel. Luego el backend recalcula:

```txt
posicion_actual = posicion_actual - 1
```

para las mesas restantes del mismo tunel.

El frontend no debe recalcular posiciones manualmente. Debe refrescar datos despues de registrar cosecha.

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

### Filtros de listado general

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `mesa_id` | UUID | Filtra por mesa |
| `tunel_id` | UUID | Filtra por tunel |
| `fecha_desde` | ISO 8601 | Filtra desde `fecha_hora` |
| `fecha_hasta` | ISO 8601 | Filtra hasta `fecha_hora` |
| `sortOrder` | `ASC`, `DESC` | Ordena por `fecha_hora` |

El DTO tambien acepta `sortBy`, pero el service ordena siempre por `fecha_hora`.

Ejemplo:

```http
GET /cosecha?page=1&limit=20&tunel_id=9e314fed-4062-4563-913f-a66f2fbb422e&fecha_desde=2026-06-01T00:00:00.000Z&sortOrder=DESC
```

## 11. Endpoints

### 11.1. Registrar cosecha

```http
POST /cosecha
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
  "peso_kg": 12.5,
  "observaciones": "Cosecha lote mañana"
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "cosecha": {
      "id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Cosecha lote mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "posicion_recalculada": true
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: UUID invalido, `peso_kg` invalido u observaciones demasiado largas.
- `403 AUTH_FORBIDDEN`: usuario sin rol permitido.
- `404 MESA_NOT_FOUND`: mesa inexistente o fuera del tenant.
- `422 COSECHA_MESA_NO_DISPONIBLE`: mesa no activa o no esta en posicion 1.

Notas:

- El endpoint responde `201`.
- El frontend no debe enviar `tunel_id`.
- El frontend no debe enviar `posicion_al_momento`.
- El frontend no debe cambiar manualmente estado ni posicion de la mesa.

### 11.2. Listar cosechas

```http
GET /cosecha
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `mesa_id` | No | UUID de mesa |
| `tunel_id` | No | UUID de tunel |
| `fecha_desde` | No | Fecha ISO 8601 |
| `fecha_hasta` | No | Fecha ISO 8601 |
| `sortOrder` | No | `ASC` o `DESC` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Cosecha lote mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### 11.3. Obtener cosecha por ID

```http
GET /cosecha/:id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /cosecha/a6765e17-b76d-43dd-8236-d22675d1ed57
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
    "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
    "posicion_al_momento": 1,
    "fecha_hora": "2026-06-09T12:00:00.000Z",
    "peso_kg": "12.500",
    "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
    "observaciones": "Cosecha lote mañana",
    "created_at": "2026-06-09T12:00:00.000Z",
    "updated_at": "2026-06-09T12:00:00.000Z"
  }
}
```

Errores comunes:

- `404 COSECHA_NOT_FOUND`: cosecha inexistente o fuera del tenant.

### 11.4. Listar cosechas por mesa

```http
GET /mesas/:mesa_id/cosechas
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |

Ejemplo:

```http
GET /mesas/1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5/cosechas?page=1&limit=20
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "mesa_id": "1d64fcbb-47d4-4e9b-81e4-5ddf9f9650b5",
      "tunel_id": "9e314fed-4062-4563-913f-a66f2fbb422e",
      "posicion_al_momento": 1,
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Cosecha lote mañana"
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
2. Cargar tuneles.
3. Cargar mesas del tunel.
4. Filtrar mesa cosechable: `estado === "activa" && posicion_actual === 1`.
5. Mostrar accion de cosecha solo sobre esa mesa.
6. Pedir `peso_kg`.
7. Permitir `observaciones` opcionales.

### Flujo de registrar cosecha

1. Validar que `peso_kg >= 0.001`.
2. Validar que `peso_kg <= 9999999.999`.
3. Enviar `POST /cosecha`.
4. Mostrar confirmacion.
5. Guardar o navegar a `data.cosecha.id`.
6. Refrescar mesa cosechada.
7. Refrescar mesas del tunel para ver FIFO recalculado.
8. Refrescar historial de mesa si la pantalla lo muestra.

### Flujo de listado

1. Enviar `GET /cosecha?page=1&limit=20`.
2. Aplicar filtros por mesa, tunel o fechas si corresponde.
3. Mostrar `peso_kg`, `fecha_hora`, `mesa_id`, `tunel_id` y `observaciones`.
4. Usar `meta` para paginacion.

### Flujo de detalle

1. Enviar `GET /cosecha/:id`.
2. Mostrar datos principales de la cosecha.
3. Si se necesita informacion rica de mesa o tunel, consultarla con los modulos correspondientes.

## 13. Consideraciones de UI/UX

- Mostrar registrar cosecha solo para `operario`, `supervisor` o `admin_global`.
- No mostrar accion si la mesa no esta `activa`.
- No mostrar accion si la mesa no esta en `posicion_actual = 1`.
- Mostrar el peso como input numerico decimal.
- Evitar enviar coma decimal; enviar numero JSON con punto decimal.
- No pedir `tunel_id`; lo resuelve el backend desde la mesa.
- No pedir `posicion_al_momento`; lo resuelve el backend.
- Deshabilitar el boton de enviar mientras corre la request.
- Ante `COSECHA_MESA_NO_DISPONIBLE`, refrescar las mesas porque pudo cambiar el FIFO.
- Despues de registrar, refrescar tablero de tunel.
- En listados, ordenar por defecto con `sortOrder=DESC`.

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

### Registrar cosecha

```ts
const response = await apiFetch("/cosecha", {
  method: "POST",
  body: JSON.stringify({
    mesa_id: mesaId,
    peso_kg: 12.5,
    observaciones: "Cosecha desde frontend"
  })
});

const result = response.data;
const cosecha = result.cosecha;
```

### Listar cosechas

```ts
const response = await apiFetch(
  "/cosecha?page=1&limit=20&sortOrder=DESC"
);

const cosechas = response.data;
const meta = response.meta;
```

### Listar cosechas filtradas

```ts
const response = await apiFetch(
  `/cosecha?page=1&limit=20&tunel_id=${tunelId}&fecha_desde=2026-06-01T00:00:00.000Z&sortOrder=DESC`
);

const cosechas = response.data;
```

### Obtener cosecha por ID

```ts
const response = await apiFetch(`/cosecha/${cosechaId}`);
const cosecha = response.data;
```

### Listar cosechas por mesa

```ts
const response = await apiFetch(
  `/mesas/${mesaId}/cosechas?page=1&limit=20`
);

const cosechas = response.data;
const meta = response.meta;
```

### Manejo de errores especificos

```ts
try {
  await apiFetch("/cosecha", {
    method: "POST",
    body: JSON.stringify({
      mesa_id: mesaId,
      peso_kg: pesoKg
    })
  });
} catch (err: any) {
  const code = err?.error?.code;

  if (code === "COSECHA_MESA_NO_DISPONIBLE") {
    // Refrescar mesas del tunel y mostrar que la mesa ya no esta disponible.
  }
}
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Registrar cosecha se muestra solo para `operario`, `supervisor` o `admin_global`.
- La UI permite cosechar solo mesas `activa`.
- La UI permite cosechar solo mesas con `posicion_actual === 1`.
- El formulario pide `mesa_id`.
- El formulario pide `peso_kg`.
- `peso_kg` se envia como numero JSON.
- `peso_kg` es mayor o igual a `0.001`.
- `peso_kg` es menor o igual a `9999999.999`.
- `observaciones` es opcional.
- `observaciones` no supera 2000 caracteres.
- No se envia `tunel_id`.
- No se envia `posicion_al_momento`.
- La respuesta `POST /cosecha` se trata como `201`.
- Al terminar, se refresca mesa cosechada.
- Al terminar, se refrescan mesas del tunel.
- Al terminar, se refresca historial si la pantalla lo muestra.
- La UI maneja `COSECHA_MESA_NO_DISPONIBLE`.
- El listado general lee `data` y `meta`.
- El listado por mesa lee `data` y `meta`.
- Los errores leen `error.code` y `error.message`.
