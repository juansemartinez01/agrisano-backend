# Modulo Packing - Guia para Frontend

## 1. Objetivo del modulo

El modulo de packing registra el empaque de una cosecha.

Un packing:

- Pertenece al tenant actual.
- Se registra sobre una cosecha existente.
- Solo puede existir una vez por cosecha.
- Guarda peso bruto.
- Guarda categorias de producto empacado.
- Registra cantidad de cajas y peso neto por caja por categoria.
- Registra el usuario que hizo la operacion.
- Registra auditoria.

Desde frontend, este modulo sirve para:

- Registrar el packing de una cosecha.
- Listar lotes de packing.
- Consultar un lote de packing por ID.
- Consultar el packing asociado a una cosecha.
- Mostrar el desglose por categorias: `primera`, `segunda`, `descarte`.

Controlador del modulo:

- `PackingController`: rutas bajo `/packing` y `/cosechas/:cosecha_id/packing`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/packing
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de packing requieren JWT.

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
  "path": "/packing"
}
```

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `POST /packing` | `operario`, `supervisor`, `admin_global` |
| `GET /packing` | Cualquier usuario autenticado |
| `GET /packing/:id` | Cualquier usuario autenticado |
| `GET /cosechas/:cosecha_id/packing` | Cualquier usuario autenticado |

Notas:

- Registrar packing requiere `operario`, `supervisor` o `admin_global`.
- Listar y consultar packing no tienen decorador `@Roles`, pero siguen requiriendo JWT.
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
  "statusCode": 409,
  "error": {
    "code": "PACKING_YA_REGISTRADO",
    "message": "Ya existe un registro de packing para esta cosecha"
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/packing"
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
| `404` | `PACKING_NOT_FOUND` | Packing inexistente o fuera del tenant |
| `409` | `PACKING_YA_REGISTRADO` | Ya existe packing para esa cosecha |
| `422` | `PACKING_CATEGORIA_DUPLICADA` | Se repitio una categoria en el mismo lote |
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
    "message": "categorias must contain at least 1 elements",
    "details": {
      "validationErrors": [
        {
          "message": "categorias must contain at least 1 elements"
        }
      ]
    }
  },
  "timestamp": "2026-06-09T12:00:00.000Z",
  "path": "/packing"
}
```

## 8. Modelo de datos

### Categorias permitidas

```ts
type CategoriaPacking = "primera" | "segunda" | "descarte";
```

### Body de packing

```ts
type CreatePackingDto = {
  cosecha_id: string;
  peso_bruto_kg: number;
  observaciones?: string;
  categorias: CreatePackingCategoriaDto[];
};

type CreatePackingCategoriaDto = {
  categoria: "primera" | "segunda" | "descarte";
  peso_kg: number;
  cantidad_cajas: number;
  peso_neto_por_caja: number;
};
```

Campos principales:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `cosecha_id` | Si | UUID | Debe existir en el tenant |
| `peso_bruto_kg` | Si | number | Minimo `0.001`, maximo `9999999.999` |
| `observaciones` | No | string | Maximo 1000 caracteres |
| `categorias` | Si | array | Minimo 1, maximo 3 |

Campos de cada categoria:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `categoria` | Si | enum | `primera`, `segunda`, `descarte` |
| `peso_kg` | Si | number | Minimo `0.001`, maximo `9999999.999` |
| `cantidad_cajas` | Si | integer | Minimo `1` |
| `peso_neto_por_caja` | Si | number | Minimo `0.001`, maximo `9999999.999` |

### Lote packing

```ts
type LotePacking = {
  id: string;
  tenant_id: string | null;
  cosecha_id: string;
  fecha_hora: string;
  peso_bruto_kg: number | string;
  usuario_id: string;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
};
```

### Categoria registrada

```ts
type LotePackingCategoria = {
  id: string;
  lote_packing_id: string;
  categoria: "primera" | "segunda" | "descarte";
  peso_kg: number | string;
  cantidad_cajas: number;
  peso_neto_por_caja: number | string;
};
```

### Respuesta de packing con categorias

```ts
type RegistrarPackingResult = {
  lote_packing: LotePacking;
  categorias: LotePackingCategoria[];
};
```

Notas:

- Los campos decimal pueden volver como string por serializacion de TypeORM.
- La relacion principal es `lote_packing.id` con `categorias[].lote_packing_id`.
- `cosecha_id` es unico en `lotes_packing`.

## 9. Reglas de negocio importantes

### Un packing por cosecha

Solo puede existir un lote de packing por cada cosecha.

Si se intenta registrar dos veces para la misma cosecha, el backend responde:

```json
{
  "ok": false,
  "statusCode": 409,
  "error": {
    "code": "PACKING_YA_REGISTRADO"
  }
}
```

### Categorias

Reglas de `categorias`:

- Debe tener minimo 1 item.
- Debe tener maximo 3 items.
- Cada item debe usar una categoria permitida.
- No puede repetirse una categoria dentro del mismo lote.

Categorias permitidas:

- `primera`
- `segunda`
- `descarte`

Si se repite una categoria, el backend responde `PACKING_CATEGORIA_DUPLICADA`.

### Cosecha

Antes de registrar packing, el backend valida que la cosecha exista y pertenezca al tenant actual.

El modulo no recalcula ni valida que el peso bruto coincida con la suma de categorias. Si esa regla se quiere aplicar, hoy debe validarla el frontend o agregarse en backend.

### Transaccion

La registracion de packing corre dentro de una transaccion:

- Inserta `lote_packing`.
- Inserta categorias.
- Si algo falla, hace rollback.
- Luego registra auditoria.

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

### Filtros de listado

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `cosecha_id` | UUID | Filtra por cosecha |
| `sortOrder` | `ASC`, `DESC` | Ordena por `fecha_hora` |

El DTO tambien acepta `sortBy`, pero el service ordena siempre por `fecha_hora`.

Ejemplo:

```http
GET /packing?page=1&limit=20&cosecha_id=a6765e17-b76d-43dd-8236-d22675d1ed57&sortOrder=DESC
```

## 11. Endpoints

### 11.1. Registrar packing

```http
POST /packing
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
  "peso_bruto_kg": 12.5,
  "observaciones": "Packing de cosecha turno mañana",
  "categorias": [
    {
      "categoria": "primera",
      "peso_kg": 8.5,
      "cantidad_cajas": 4,
      "peso_neto_por_caja": 2.125
    },
    {
      "categoria": "segunda",
      "peso_kg": 3,
      "cantidad_cajas": 2,
      "peso_neto_por_caja": 1.5
    },
    {
      "categoria": "descarte",
      "peso_kg": 1,
      "cantidad_cajas": 1,
      "peso_neto_por_caja": 1
    }
  ]
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "lote_packing": {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Packing de cosecha turno mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "categorias": [
      {
        "id": "62adab46-8427-4d89-bb34-1df5386d7355",
        "lote_packing_id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
        "categoria": "primera",
        "peso_kg": "8.500",
        "cantidad_cajas": 4,
        "peso_neto_por_caja": "2.125"
      }
    ]
  }
}
```

Errores comunes:

- `400 BAD_REQUEST`: UUID invalido, categorias vacias, mas de 3 categorias, pesos invalidos o cajas invalidas.
- `403 AUTH_FORBIDDEN`: usuario sin rol permitido.
- `404 COSECHA_NOT_FOUND`: cosecha inexistente o fuera del tenant.
- `409 PACKING_YA_REGISTRADO`: ya existe packing para esa cosecha.
- `422 PACKING_CATEGORIA_DUPLICADA`: categoria repetida.

Notas:

- El endpoint responde `201`.
- No enviar `usuario_id`; lo toma del token.
- No enviar `fecha_hora`; la define el backend.
- No enviar `tenant_id`; lo resuelve tenancy.

### 11.2. Listar packing

```http
GET /packing
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina |
| `cosecha_id` | No | UUID de cosecha |
| `sortOrder` | No | `ASC` o `DESC` |

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Packing de cosecha turno mañana",
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

Notas:

- El listado devuelve solo `lote_packing`.
- Para ver categorias, usar `GET /packing/:id` o `GET /cosechas/:cosecha_id/packing`.

### 11.3. Obtener packing por ID

```http
GET /packing/:id
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /packing/42f5c449-b14a-42e8-a5e6-293cb0d5dcb3
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "lote_packing": {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Packing de cosecha turno mañana",
      "created_at": "2026-06-09T12:00:00.000Z",
      "updated_at": "2026-06-09T12:00:00.000Z"
    },
    "categorias": [
      {
        "id": "62adab46-8427-4d89-bb34-1df5386d7355",
        "lote_packing_id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
        "categoria": "primera",
        "peso_kg": "8.500",
        "cantidad_cajas": 4,
        "peso_neto_por_caja": "2.125"
      }
    ]
  }
}
```

Errores comunes:

- `404 PACKING_NOT_FOUND`: packing inexistente o fuera del tenant.

### 11.4. Obtener packing por cosecha

```http
GET /cosechas/:cosecha_id/packing
```

Roles:

- Cualquier usuario autenticado.

Ejemplo:

```http
GET /cosechas/a6765e17-b76d-43dd-8236-d22675d1ed57/packing
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "lote_packing": {
      "id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
      "cosecha_id": "a6765e17-b76d-43dd-8236-d22675d1ed57",
      "fecha_hora": "2026-06-09T12:00:00.000Z",
      "peso_bruto_kg": "12.500",
      "usuario_id": "a7b9f76c-8f56-4cb1-86af-31808f7702d4",
      "observaciones": "Packing de cosecha turno mañana"
    },
    "categorias": [
      {
        "id": "62adab46-8427-4d89-bb34-1df5386d7355",
        "lote_packing_id": "42f5c449-b14a-42e8-a5e6-293cb0d5dcb3",
        "categoria": "primera",
        "peso_kg": "8.500",
        "cantidad_cajas": 4,
        "peso_neto_por_caja": "2.125"
      }
    ]
  }
}
```

Errores comunes:

- `404 COSECHA_NOT_FOUND`: cosecha inexistente o fuera del tenant.
- `404 PACKING_NOT_FOUND`: la cosecha existe, pero todavia no tiene packing.

## 12. Flujos recomendados para frontend

### Flujo de preparacion

1. Verificar que exista `access_token`.
2. Cargar cosechas disponibles.
3. Para cada cosecha candidata, consultar si ya tiene packing o manejar `PACKING_YA_REGISTRADO` al guardar.
4. Mostrar formulario con `peso_bruto_kg`.
5. Mostrar seccion de categorias.
6. Permitir entre 1 y 3 categorias.
7. Evitar categorias duplicadas desde UI.

### Flujo de registrar packing

1. Validar `cosecha_id`.
2. Validar `peso_bruto_kg >= 0.001`.
3. Validar que `categorias.length` este entre 1 y 3.
4. Validar que no se repitan categorias.
5. Validar pesos y cajas por categoria.
6. Enviar `POST /packing`.
7. Guardar `data.lote_packing.id`.
8. Mostrar categorias registradas desde `data.categorias`.
9. Si hay `PACKING_YA_REGISTRADO`, cargar el packing existente por cosecha.

### Flujo de listado

1. Enviar `GET /packing?page=1&limit=20`.
2. Aplicar filtro por `cosecha_id` si corresponde.
3. Mostrar datos principales del lote.
4. Usar `GET /packing/:id` para abrir detalle con categorias.

### Flujo por cosecha

1. Desde detalle de cosecha, llamar `GET /cosechas/:cosecha_id/packing`.
2. Si responde `200`, mostrar packing.
3. Si responde `PACKING_NOT_FOUND`, mostrar accion para crear packing.

## 13. Consideraciones de UI/UX

- Mostrar registrar packing solo para `operario`, `supervisor` o `admin_global`.
- No permitir registrar dos veces packing para la misma cosecha.
- Usar selector o tabs para categorias: `primera`, `segunda`, `descarte`.
- Deshabilitar una categoria si ya fue seleccionada.
- Usar inputs numericos decimales para pesos.
- Usar input entero para `cantidad_cajas`.
- Evitar enviar coma decimal; enviar numero JSON con punto decimal.
- Mostrar `peso_bruto_kg` separado del desglose por categoria.
- Opcionalmente mostrar suma de `categorias[].peso_kg` en UI.
- Avisar si la suma de categorias no coincide con peso bruto, aunque el backend hoy no lo bloquea.
- Deshabilitar el boton de enviar mientras corre la request.
- Ante `PACKING_YA_REGISTRADO`, refrescar datos de la cosecha o abrir el packing existente.
- Ante `PACKING_CATEGORIA_DUPLICADA`, revisar el estado del formulario.

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

### Registrar packing

```ts
const response = await apiFetch("/packing", {
  method: "POST",
  body: JSON.stringify({
    cosecha_id: cosechaId,
    peso_bruto_kg: 12.5,
    observaciones: "Packing desde frontend",
    categorias: [
      {
        categoria: "primera",
        peso_kg: 8.5,
        cantidad_cajas: 4,
        peso_neto_por_caja: 2.125
      },
      {
        categoria: "segunda",
        peso_kg: 3,
        cantidad_cajas: 2,
        peso_neto_por_caja: 1.5
      }
    ]
  })
});

const lotePacking = response.data.lote_packing;
const categorias = response.data.categorias;
```

### Listar packing

```ts
const response = await apiFetch("/packing?page=1&limit=20&sortOrder=DESC");

const lotes = response.data;
const meta = response.meta;
```

### Obtener packing por ID

```ts
const response = await apiFetch(`/packing/${packingId}`);

const lotePacking = response.data.lote_packing;
const categorias = response.data.categorias;
```

### Obtener packing por cosecha

```ts
const response = await apiFetch(`/cosechas/${cosechaId}/packing`);

const lotePacking = response.data.lote_packing;
const categorias = response.data.categorias;
```

### Manejo de errores especificos

```ts
try {
  await apiFetch("/packing", {
    method: "POST",
    body: JSON.stringify(payload)
  });
} catch (err: any) {
  const code = err?.error?.code;

  if (code === "PACKING_YA_REGISTRADO") {
    // Cargar packing existente de la cosecha.
  }

  if (code === "PACKING_CATEGORIA_DUPLICADA") {
    // Revisar categorias seleccionadas.
  }
}
```

## 15. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Registrar packing se muestra solo para `operario`, `supervisor` o `admin_global`.
- El formulario pide `cosecha_id`.
- El formulario pide `peso_bruto_kg`.
- `peso_bruto_kg` se envia como numero JSON.
- `peso_bruto_kg` es mayor o igual a `0.001`.
- `observaciones` es opcional.
- `observaciones` no supera 1000 caracteres.
- `categorias` tiene al menos 1 item.
- `categorias` tiene como maximo 3 items.
- Las categorias no se repiten.
- Cada categoria es `primera`, `segunda` o `descarte`.
- Cada `peso_kg` es mayor o igual a `0.001`.
- Cada `cantidad_cajas` es entero mayor o igual a `1`.
- Cada `peso_neto_por_caja` es mayor o igual a `0.001`.
- No se envia `usuario_id`.
- No se envia `tenant_id`.
- No se envia `fecha_hora`.
- La respuesta `POST /packing` se trata como `201`.
- El listado general lee `data` y `meta`.
- El detalle lee `data.lote_packing` y `data.categorias`.
- La UI maneja `PACKING_YA_REGISTRADO`.
- La UI maneja `PACKING_CATEGORIA_DUPLICADA`.
- La UI maneja `PACKING_NOT_FOUND`.
- Los errores leen `error.code` y `error.message`.
