# Modulo Tareas - Guia para Frontend

## 1. Objetivo del modulo

El modulo de tareas administra una lista de pendientes operativos, tipo to-do list, organizada en tableros.

Una tarea:

- Pertenece a un tenant.
- Pertenece a un establecimiento.
- Pertenece a un ambito (`nursery` o `greenhouse`).
- Tiene un estado (`pendiente`, `en_progreso`, `completada`, `cancelada`).
- Tiene una posicion (`orden`) dentro de su tablero.
- Puede estar asignada a un usuario del tenant.
- Registra quien la creo y, si se completo, quien la completo y cuando.

Concepto clave: **tablero = establecimiento + ambito**. El `orden` es unico dentro de ese par, no global. Dos tareas de establecimientos distintos, o del mismo establecimiento pero distinto ambito, pueden tener ambas `orden: 1`.

Desde frontend, este modulo sirve para:

- Listar tareas con filtros y paginacion.
- Consultar los ambitos disponibles sin hardcodearlos.
- Consultar una tarea por ID.
- Crear tareas dentro de un tablero.
- Editar los campos permitidos de una tarea.
- Cambiar el estado de una tarea.
- Reordenar las tareas activas de un tablero (drag and drop).
- Eliminar una tarea (borrado logico).

Controlador del modulo:

- `TareasController`: rutas bajo `/tareas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/tareas
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de tareas requieren JWT.

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

Si falta tenant, el backend responde `400`:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "TENANT_REQUIRED",
    "message": "Tenant is required"
  },
  "timestamp": "2026-08-28T22:00:00.000Z",
  "path": "/tareas"
}
```

Nunca devuelve un listado vacio con `200` cuando falta el tenant: si el front recibe `TENANT_REQUIRED`, el problema es el header, no que no haya tareas.

Tambien puede responder `401` si el tenant del header no coincide con el tenant del token.

Una tarea de otro tenant responde `404 TAREA_NOT_FOUND`, no `403`: el backend no revela la existencia de tareas ajenas.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

Tabla de permisos:

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /tareas` | Cualquier usuario autenticado |
| `GET /tareas/ambitos` | Cualquier usuario autenticado |
| `GET /tareas/:id` | Cualquier usuario autenticado |
| `POST /tareas` | `supervisor`, `admin_global` |
| `POST /tareas/reordenar` | `supervisor`, `admin_global` |
| `PATCH /tareas/:id` | `supervisor`, `admin_global` |
| `POST /tareas/:id/estado` | `operario`, `supervisor`, `admin_global` |
| `DELETE /tareas/:id` | `supervisor`, `admin_global` |

Notas:

- Listar, consultar ambitos y obtener por ID no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- El operario puede avanzar y cerrar tareas, pero no crearlas, editarlas, reordenarlas ni borrarlas.
- **Reapertura**: aunque `POST /tareas/:id/estado` admite `operario`, volver una tarea `completada` o `cancelada` a `pendiente` requiere `supervisor` o `admin_global`. Esa regla depende del estado de origen, no solo del rol, y se valida en el service: la respuesta es `403 AUTH_FORBIDDEN`.
- El rol `admin` no habilita las acciones de escritura si no esta listado arriba.

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
    "message": "Solo supervisor o admin_global pueden reabrir una tarea",
    "details": {
      "from": "completada",
      "to": "pendiente"
    }
  },
  "timestamp": "2026-08-28T22:50:14.989Z",
  "path": "/tareas/8f1c.../estado"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `400` | `TAREA_FIELD_IMMUTABLE` | Se intento editar un campo no permitido en `PATCH` |
| `401` | `AUTH_INVALID` | Token ausente, invalido o tenant mismatch |
| `403` | `AUTH_FORBIDDEN` | Rol insuficiente, o reapertura sin `supervisor` |
| `404` | `TAREA_NOT_FOUND` | Tarea inexistente, borrada o de otro tenant |
| `404` | `ESTABLECIMIENTO_NOT_FOUND` | El establecimiento no existe en el tenant |
| `422` | `TAREA_TRANSICION_INVALIDA` | Cambio de estado no permitido por la maquina de estados |
| `422` | `TAREA_ASIGNADO_INVALIDO` | El usuario asignado no pertenece al tenant |
| `422` | `TAREA_REORDEN_INVALIDO` | El conjunto de ids enviado no coincide con el tablero |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

Los tres errores `422` traen `details` util para la UI:

- `TAREA_TRANSICION_INVALIDA`: `details: { from, to }`.
- `TAREA_ASIGNADO_INVALIDO`: `details: { asignado_a_usuario_id }`.
- `TAREA_REORDEN_INVALIDO`: `details: { esperadas, recibidas }`, ambos arrays de UUID.

Errores de validacion pueden incluir `details.validationErrors`:

```json
{
  "ok": false,
  "requestId": "uuid",
  "statusCode": 400,
  "error": {
    "code": "BAD_REQUEST",
    "message": "titulo should not be empty",
    "details": {
      "validationErrors": [
        {
          "message": "titulo should not be empty"
        }
      ]
    }
  },
  "timestamp": "2026-08-28T22:00:00.000Z",
  "path": "/tareas"
}
```

## 8. Modelo de datos

### Tarea

La API nunca devuelve la fila cruda: los tres campos de usuario vienen resueltos como objetos, no como ids.

```ts
type TareaAmbito = "nursery" | "greenhouse";

type TareaEstado = "pendiente" | "en_progreso" | "completada" | "cancelada";

type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
};

type Tarea = {
  id: string;
  establecimiento_id: string;
  ambito: TareaAmbito;
  estado: TareaEstado;
  titulo: string;
  descripcion: string | null;
  orden: number;
  asignado_a: UsuarioResumen | null;
  creada_por: UsuarioResumen | null;
  completada_at: string | null;
  completada_por: UsuarioResumen | null;
  created_at: string;
  updated_at: string;
};
```

Notas:

- No se devuelve `tenant_id` ni `deleted_at`.
- `asignado_a`, `creada_por` y `completada_por` pueden ser `null`; el front debe tolerarlo y mostrar un placeholder.
- `completada_at` y `completada_por` solo tienen valor mientras el estado es `completada`. Al reabrir desde `completada` vuelven a `null`.
- Una tarea `cancelada` no toca `completada_at`: cancelar no es completar.

### Ambito

```ts
type AmbitoOption = {
  value: TareaAmbito;
  label: string;
};
```

Hoy son dos (`nursery` y `greenhouse`), pero el endpoint existe justamente para que sumar un ambito nuevo no requiera tocar el frontend.

### Maquina de estados

| Desde | Hacia permitido |
| --- | --- |
| `pendiente` | `en_progreso`, `completada`, `cancelada` |
| `en_progreso` | `pendiente`, `completada`, `cancelada` |
| `completada` | `pendiente` (solo `supervisor` / `admin_global`) |
| `cancelada` | `pendiente` (solo `supervisor` / `admin_global`) |

Toda celda ausente responde `422 TAREA_TRANSICION_INVALIDA`, incluida la diagonal: pedir el estado que la tarea ya tiene es un error, no un no-op. Esto es a proposito, porque casi siempre viene de un doble click o de un reintento.

## 9. Query params comunes

### Paginacion

```txt
page=1
limit=20
```

Notas:

- `page` arranca en `1`.
- `limit` define cantidad por pagina, con tope `200`.
- La respuesta paginada devuelve `meta.page`, `meta.limit` y `meta.total`.
- El backend siempre desempata por `id`, asi que la paginacion es estable: ninguna fila se repite entre paginas ni se saltea.

### Ordenamiento

| Param | Valores |
| --- | --- |
| `sortBy` | `orden`, `created_at`, `titulo`, `estado` |
| `sortOrder` | `ASC`, `DESC` |

Si no se envia un campo permitido, el backend ordena por `orden ASC`. Un `sortBy` fuera de la lista no rompe: cae silenciosamente al orden por defecto.

### Filtros de tareas

| Param | Tipo | Descripcion |
| --- | --- | --- |
| `establecimiento_id` | UUID | Filtra por establecimiento |
| `ambito` | `nursery`, `greenhouse` | Filtra por ambito |
| `estado` | `pendiente`, `en_progreso`, `completada`, `cancelada` | Filtra por estado |
| `asignado_a` | UUID o `me` | Filtra por usuario asignado; `me` resuelve al usuario del token |
| `q` | string | Busca en `titulo` y `descripcion` (case insensitive) |

Ejemplo:

```http
GET /tareas?page=1&limit=20&establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&ambito=nursery&estado=pendiente&sortBy=orden&sortOrder=ASC
```

## 10. Endpoints

### 10.1. Listar tareas

```http
GET /tareas
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina (tope `200`) |
| `establecimiento_id` | No | UUID del establecimiento |
| `ambito` | No | `nursery` o `greenhouse` |
| `estado` | No | `pendiente`, `en_progreso`, `completada`, `cancelada` |
| `asignado_a` | No | UUID de usuario o `me` |
| `q` | No | Busqueda en titulo y descripcion |
| `sortBy` | No | `orden`, `created_at`, `titulo`, `estado` |
| `sortOrder` | No | `ASC` o `DESC` |

Ejemplo:

```http
GET /tareas?establecimiento_id=1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731&ambito=nursery
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "8f1c2d3e-4b5a-6789-0abc-def123456789",
      "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
      "ambito": "nursery",
      "estado": "pendiente",
      "titulo": "Revisar bandejas del sector 3",
      "descripcion": null,
      "orden": 1,
      "asignado_a": null,
      "creada_por": {
        "id": "22222222-2222-2222-2222-222222222222",
        "email": "supervisor@agrisano.com",
        "nombre": "Ana",
        "apellido": "Diaz"
      },
      "completada_at": null,
      "completada_por": null,
      "created_at": "2026-08-28T13:00:00.000Z",
      "updated_at": "2026-08-28T13:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Las tareas borradas no aparecen nunca en el listado.

### 10.2. Listar ambitos

```http
GET /tareas/ambitos
```

Roles:

- Cualquier usuario autenticado.

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    { "value": "nursery", "label": "Nursery" },
    { "value": "greenhouse", "label": "Greenhouse" }
  ]
}
```

Nota: esta ruta esta declarada antes de `GET /tareas/:id`, asi que `ambitos` nunca se interpreta como un id.

### 10.3. Obtener tarea por ID

```http
GET /tareas/:id
```

Roles:

- Cualquier usuario autenticado.

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "8f1c2d3e-4b5a-6789-0abc-def123456789",
    "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
    "ambito": "nursery",
    "estado": "en_progreso",
    "titulo": "Revisar bandejas del sector 3",
    "descripcion": "Controlar humedad y germinacion",
    "orden": 1,
    "asignado_a": {
      "id": "33333333-3333-3333-3333-333333333333",
      "email": "operario@agrisano.com",
      "nombre": "Luis",
      "apellido": "Perez"
    },
    "creada_por": {
      "id": "22222222-2222-2222-2222-222222222222",
      "email": "supervisor@agrisano.com",
      "nombre": "Ana",
      "apellido": "Diaz"
    },
    "completada_at": null,
    "completada_por": null,
    "created_at": "2026-08-28T13:00:00.000Z",
    "updated_at": "2026-08-28T14:10:00.000Z"
  }
}
```

Errores:

- `404 TAREA_NOT_FOUND` si no existe, esta borrada o pertenece a otro tenant.

### 10.4. Crear tarea

```http
POST /tareas
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "ambito": "nursery",
  "titulo": "Revisar bandejas del sector 3",
  "descripcion": "Controlar humedad y germinacion",
  "asignado_a_usuario_id": "33333333-3333-3333-3333-333333333333"
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `establecimiento_id` | Si | UUID | Debe existir en el tenant |
| `ambito` | Si | enum | `nursery` o `greenhouse` |
| `titulo` | Si | string | Se trimea; no vacio; maximo 150 caracteres |
| `descripcion` | No | string | Maximo 2000 caracteres |
| `asignado_a_usuario_id` | No | UUID | Debe ser un usuario del tenant |

Respuesta `201`: la tarea creada, con la forma de la seccion 8.

Notas:

- El frontend **no** debe enviar `estado`, `orden`, `creada_por_usuario_id`, `completada_at` ni `tenant_id`. Cualquier campo extra en el body devuelve `400`.
- La tarea nace en `pendiente`.
- El `orden` se calcula solo: es el maximo del tablero mas uno. Un tablero vacio arranca en `1`.
- `creada_por` sale del token, no del body.

Errores:

- `400 BAD_REQUEST` por validacion o campos no permitidos.
- `403 AUTH_FORBIDDEN` si el usuario es `operario`.
- `404 ESTABLECIMIENTO_NOT_FOUND` si el establecimiento no existe en el tenant.
- `422 TAREA_ASIGNADO_INVALIDO` si el asignado no pertenece al tenant.

### 10.5. Reordenar tablero

```http
POST /tareas/reordenar
```

Roles:

- `supervisor`
- `admin_global`

Body:

```json
{
  "establecimiento_id": "1e4a93fd-8f72-4c13-b5c5-2c29bb0b5731",
  "ambito": "nursery",
  "tarea_ids": [
    "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  ]
}
```

Campos:

| Campo | Requerido | Tipo | Reglas |
| --- | --- | --- | --- |
| `establecimiento_id` | Si | UUID | Debe existir en el tenant |
| `ambito` | Si | enum | `nursery` o `greenhouse` |
| `tarea_ids` | Si | UUID[] | Entre 1 y 500 ids, sin repetir |

Regla central: **`tarea_ids` tiene que traer exactamente las tareas activas del tablero** (`pendiente` y `en_progreso`), ni de mas, ni de menos, ni repetidas. Las `completada` y `cancelada` no participan.

Respuesta `200`: el tablero completo ya reordenado, como array de tareas, con `orden` reasignado `1..N` en el orden enviado.

Errores:

- `422 TAREA_REORDEN_INVALIDO` si el conjunto no coincide. La respuesta trae `details.esperadas` (lo que el backend tiene) y `details.recibidas` (lo que mando el front). El orden anterior queda intacto: la operacion es atomica.
- `403 AUTH_FORBIDDEN` si el usuario es `operario`.
- `404 ESTABLECIMIENTO_NOT_FOUND`.

Si el front recibe `TAREA_REORDEN_INVALIDO`, significa que alguien creo, cerro o borro una tarea mientras el usuario arrastraba. Lo correcto es refrescar el tablero y avisar, no reintentar con el mismo payload.

### 10.6. Actualizar tarea

```http
PATCH /tareas/:id
```

Roles:

- `supervisor`
- `admin_global`

Body (todos los campos son opcionales):

```json
{
  "titulo": "Revisar bandejas del sector 3 y 4",
  "descripcion": "Actualizado tras la recorrida",
  "asignado_a_usuario_id": null
}
```

Campos:

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `titulo` | string | Se trimea; no vacio; maximo 150 caracteres |
| `descripcion` | string o `null` | Maximo 2000; `null` limpia el campo |
| `asignado_a_usuario_id` | UUID o `null` | Debe ser usuario del tenant; `null` desasigna |

Respuesta `200`: la tarea actualizada.

Notas:

- Solo esos tres campos son editables. `ambito`, `establecimiento_id`, `estado` y `orden` son inmutables por `PATCH`: para el estado esta `POST /tareas/:id/estado` y para el orden esta `POST /tareas/reordenar`.
- Enviar `null` explicito limpia el campo; omitirlo lo deja como estaba. No es lo mismo mandar `"descripcion": null` que no mandar `descripcion`.

Errores:

- `400 TAREA_FIELD_IMMUTABLE` si el body incluye cualquier otro campo.
- `403 AUTH_FORBIDDEN` si el usuario es `operario`.
- `404 TAREA_NOT_FOUND`.
- `422 TAREA_ASIGNADO_INVALIDO`.

### 10.7. Cambiar estado

```http
POST /tareas/:id/estado
```

Roles:

- `operario`
- `supervisor`
- `admin_global`

Body:

```json
{
  "estado": "completada"
}
```

Respuesta `200`: la tarea con el estado nuevo.

Notas:

- Al pasar a `completada`, el backend setea `completada_at` y `completada_por` con el usuario del token.
- Al reabrir desde `completada`, ambos vuelven a `null`.
- Reabrir (`completada` o `cancelada` a `pendiente`) requiere `supervisor` o `admin_global`, aunque el endpoint admita `operario`.

Errores:

- `422 TAREA_TRANSICION_INVALIDA` con `details: { from, to }` si la transicion no esta en la matriz de la seccion 8, incluido pedir el estado actual.
- `403 AUTH_FORBIDDEN` si un `operario` intenta reabrir.
- `404 TAREA_NOT_FOUND`.

### 10.8. Eliminar tarea

```http
DELETE /tareas/:id
```

Roles:

- `supervisor`
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

- Es borrado logico: la fila queda en la base con `deleted_at`, pero desaparece del listado y del detalle.
- Despues de borrar, `GET /tareas/:id` de esa tarea responde `404 TAREA_NOT_FOUND`.
- El borrado **no** recompacta el `orden` del resto del tablero: pueden quedar huecos (`1, 2, 4`). Eso no rompe nada, pero si la UI muestra numeros de posicion conviene usar el indice del array y no `orden`. El proximo reordenamiento normaliza a `1..N`.

## 11. Flujos recomendados para frontend

### Flujo de carga del tablero

1. Verificar que exista `access_token`.
2. Cargar establecimientos disponibles.
3. Cargar ambitos con `GET /tareas/ambitos` en vez de hardcodearlos.
4. Enviar `GET /tareas?establecimiento_id=...&ambito=...&limit=200`.
5. Renderizar en el orden recibido, que ya viene por `orden ASC`.
6. Si hay `401`, redirigir a login o intentar refresh.

### Flujo de creacion

1. Habilitar la accion solo para `supervisor` o `admin_global`.
2. Pedir establecimiento, ambito y titulo; descripcion y asignado son opcionales.
3. Trimear el titulo en la UI y bloquear el submit si queda vacio o supera 150 caracteres.
4. Enviar `POST /tareas` sin `estado` ni `orden`.
5. Si responde `201`, agregar la tarea al final del tablero.
6. Si responde `422 TAREA_ASIGNADO_INVALIDO`, refrescar la lista de usuarios.

### Flujo de cambio de estado

1. Calcular las transiciones validas desde el `estado` actual usando la tabla de la seccion 8.
2. Mostrar solo esas acciones; no ofrecer el estado actual como opcion.
3. Enviar `POST /tareas/:id/estado`.
4. Si responde `200`, reemplazar la tarea en el estado local con la respuesta completa.
5. Si responde `422 TAREA_TRANSICION_INVALIDA`, refrescar: alguien cambio el estado mientras tanto.
6. Si responde `403`, avisar que reabrir requiere supervisor.

### Flujo de drag and drop

1. Habilitar el drag solo para `supervisor` o `admin_global`.
2. Trabajar solo con las tareas activas (`pendiente` y `en_progreso`) del tablero.
3. Reordenar de forma optimista en la UI.
4. Enviar `POST /tareas/reordenar` con **todos** los ids activos en el orden nuevo.
5. Si responde `200`, reemplazar el tablero con la respuesta.
6. Si responde `422 TAREA_REORDEN_INVALIDO`, revertir el movimiento optimista y recargar el tablero.
7. Serializar los envios: no mandar un reordenamiento nuevo mientras el anterior sigue en vuelo.

### Flujo de edicion

1. Cargar el detalle con `GET /tareas/:id`.
2. Permitir editar solo `titulo`, `descripcion` y `asignado_a_usuario_id`.
3. Enviar `PATCH /tareas/:id` solo con los campos que cambiaron.
4. Nunca incluir `ambito`, `establecimiento_id`, `estado` ni `orden`.
5. Si hay `TAREA_FIELD_IMMUTABLE`, revisar el payload enviado.

### Flujo de borrado

1. Habilitar la accion solo para `supervisor` o `admin_global`.
2. Mostrar confirmacion.
3. Enviar `DELETE /tareas/:id`.
4. Si responde `200`, quitar la tarea del tablero.

### Flujo "mis tareas"

1. Enviar `GET /tareas?asignado_a=me`.
2. No hace falta conocer el id del usuario: el backend lo resuelve desde el token.
3. Combinar con `estado=pendiente` o `estado=en_progreso` para una bandeja de trabajo.

## 12. Consideraciones de UI/UX

- Mostrar crear, editar, reordenar y borrar solo para `supervisor` o `admin_global`.
- Mostrar cambiar estado tambien para `operario`, pero ocultar las transiciones de reapertura si el usuario no es supervisor.
- Cargar los ambitos desde `GET /tareas/ambitos`; no hardcodear `nursery` y `greenhouse` en el front.
- Presentar el tablero siempre acotado a un establecimiento y un ambito: mezclar tableros hace que los `orden` se repitan y el drag and drop pierda sentido.
- No mostrar el campo `orden` como numero editable; es una consecuencia del arrastre.
- Usar el indice del array para numerar visualmente, ya que el borrado puede dejar huecos en `orden`.
- Mostrar `completada_at` y `completada_por` solo cuando el estado es `completada`.
- Tolerar `asignado_a: null`, `creada_por: null` y `completada_por: null` sin romper el render.
- Para el buscador usar `q`, que cubre titulo y descripcion.
- Para bandejas personales usar `asignado_a=me`.
- Al reordenar, deshabilitar el drag mientras la request esta en vuelo.
- Tratar `422 TAREA_REORDEN_INVALIDO` como "el tablero cambio, recarga", no como un error del usuario.

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

### Cargar ambitos

```ts
const response = await apiFetch("/tareas/ambitos");
const ambitos = response.data;
```

### Listar un tablero

```ts
const params = new URLSearchParams({
  establecimiento_id: establecimientoId,
  ambito: "nursery",
  limit: "200"
});

const response = await apiFetch(`/tareas?${params.toString()}`);
const tareas = response.data;
const total = response.meta.total;
```

### Mis tareas pendientes

```ts
const response = await apiFetch("/tareas?asignado_a=me&estado=pendiente");
```

### Crear

```ts
const response = await apiFetch("/tareas", {
  method: "POST",
  body: JSON.stringify({
    establecimiento_id: establecimientoId,
    ambito: "nursery",
    titulo: titulo.trim(),
    descripcion: descripcion || undefined,
    asignado_a_usuario_id: asignadoId || undefined
  })
});

const tarea = response.data;
```

### Obtener por ID

```ts
const response = await apiFetch(`/tareas/${tareaId}`);
```

### Actualizar

```ts
const response = await apiFetch(`/tareas/${tareaId}`, {
  method: "PATCH",
  body: JSON.stringify({
    titulo: "Revisar bandejas del sector 3 y 4",
    asignado_a_usuario_id: null
  })
});
```

### Cambiar estado

```ts
async function cambiarEstado(tareaId: string, estado: string) {
  try {
    const response = await apiFetch(`/tareas/${tareaId}/estado`, {
      method: "POST",
      body: JSON.stringify({ estado })
    });
    return response.data;
  } catch (err: any) {
    if (err?.error?.code === "TAREA_TRANSICION_INVALIDA") {
      const { from, to } = err.error.details;
      throw new Error(`No se puede pasar de ${from} a ${to}`);
    }
    if (err?.error?.code === "AUTH_FORBIDDEN") {
      throw new Error("Solo un supervisor puede reabrir esta tarea");
    }
    throw err;
  }
}
```

### Reordenar

```ts
async function reordenar(
  establecimientoId: string,
  ambito: string,
  activasEnOrden: Array<{ id: string }>
) {
  try {
    const response = await apiFetch("/tareas/reordenar", {
      method: "POST",
      body: JSON.stringify({
        establecimiento_id: establecimientoId,
        ambito,
        tarea_ids: activasEnOrden.map((t) => t.id)
      })
    });
    return response.data;
  } catch (err: any) {
    if (err?.error?.code === "TAREA_REORDEN_INVALIDO") {
      // El tablero cambio mientras el usuario arrastraba: recargar.
      return null;
    }
    throw err;
  }
}
```

### Eliminar

```ts
await apiFetch(`/tareas/${tareaId}`, { method: "DELETE" });
```

## 14. Checklist para integracion frontend

- Login guarda `access_token`.
- Si se usa tenant por header, frontend guarda y envia `tenant_id`.
- Se hace login de nuevo despues de cambios de roles.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code`, `error.message` y `error.details`.
- Los ambitos se cargan desde `GET /tareas/ambitos`, no hardcodeados.
- El tablero siempre se pide filtrado por `establecimiento_id` y `ambito`.
- Crear tarea trimea el titulo y valida el maximo de 150 caracteres.
- Crear tarea no envia `estado`.
- Crear tarea no envia `orden`.
- Crear tarea no envia `creada_por_usuario_id` ni `tenant_id`.
- `PATCH` solo envia `titulo`, `descripcion` y `asignado_a_usuario_id`.
- `PATCH` usa `null` explicito para limpiar `descripcion` o desasignar.
- `PATCH` no envia `ambito`, `establecimiento_id`, `estado` ni `orden`.
- El cambio de estado usa `POST /tareas/:id/estado`, no `PATCH`.
- La UI calcula las transiciones validas y no ofrece el estado actual.
- La UI maneja `TAREA_TRANSICION_INVALIDA` leyendo `details.from` y `details.to`.
- La UI maneja `AUTH_FORBIDDEN` en la reapertura con un mensaje especifico.
- El reordenamiento envia **todas** las tareas activas del tablero.
- El reordenamiento no incluye tareas `completada` ni `cancelada`.
- La UI maneja `TAREA_REORDEN_INVALIDO` recargando el tablero.
- Los reordenamientos no se solapan entre si.
- La UI maneja `TAREA_ASIGNADO_INVALIDO`.
- La UI maneja `TAREA_FIELD_IMMUTABLE`.
- La UI maneja `TAREA_NOT_FOUND` al abrir una tarea borrada.
- Crear, editar, reordenar y borrar se muestran solo para `supervisor` o `admin_global`.
- Cambiar estado se muestra tambien para `operario`.
- La numeracion visual usa el indice del array, no `orden`.
- El render tolera `asignado_a`, `creada_por` y `completada_por` en `null`.
