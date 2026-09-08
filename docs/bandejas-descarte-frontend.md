# Descarte de Bandejas - Guia para Frontend

## 1. Objetivo del modulo

Este flujo registra la **perdida** de una bandeja: se cayo, se rompio, se contamino, no germino, o se cargo por error.

Una perdida:

- Se registra sobre **la bandeja completa**, nunca sobre parte de ella.
- Se puede registrar **cualquiera sea el estado** de la bandeja: en cooling period, en nursery o ya trasplantada a una mesa.
- Es **terminal e irreversible**: no existe endpoint para deshacerla.
- Deja una **constancia** con motivo, fecha del incidente, estado previo y usuario responsable.
- **No borra nada**: la bandeja sigue vinculada a su mesa, su siembra, sus lotes y sus aplicaciones quimicas.

Concepto clave: **descartar no es borrar**. La bandeja no desaparece; pasa a un estado terminal y gana un objeto `descarte`. Todo lo que la bandeja ya era sigue estando ahi, y la trazabilidad de la cosecha la sigue mostrando.

Desde frontend, este modulo sirve para:

- Registrar la perdida de una o varias bandejas en una sola operacion.
- Listar las bandejas descartadas (que por defecto **no** aparecen en el listado general).
- Ver el detalle de una perdida al abrir una bandeja.
- Consultar el reporte de mermas, filtrable y paginado.

Controlador:

- `BandejaController`: rutas bajo `/bandejas`.

No hay prefijo global `/api` configurado en `main.ts`, por lo tanto las rutas son directas sobre el host base.

Ejemplo:

```txt
http://localhost:3000/bandejas/descartar
```

## 2. Base URL

En desarrollo local:

```txt
http://localhost:3000
```

El puerto por defecto es `3000`, salvo que el backend se levante con otra variable `PORT`.

## 3. Autenticacion

Todos los endpoints de bandejas requieren JWT.

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

Headers recomendados:

```http
Authorization: Bearer <access_token>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Si falta tenant, el backend responde `400 TENANT_REQUIRED`.

Nota importante: si el `x-tenant-id` del header no coincide con el `tenant_id` del token, la respuesta es `401 AUTH_INVALID`, no `403` ni `404`. Es el guard de JWT el que corta, antes de llegar al modulo.

## 5. Roles y permisos

El modulo usa `JwtAuthGuard` y `RolesGuard`.

| Endpoint | Roles permitidos |
| --- | --- |
| `GET /bandejas` | Cualquier usuario autenticado |
| `GET /bandejas/descartes` | Cualquier usuario autenticado |
| `GET /bandejas/:id` | Cualquier usuario autenticado |
| `POST /bandejas/descartar` | `operario`, `supervisor`, `admin_global` |

Notas:

- Los tres `GET` no tienen decorador `@Roles`, pero siguen requiriendo JWT.
- **El operario puede descartar.** Es a proposito: quien tira la bandeja al piso es quien esta parado al lado de la mesa, y obligarlo a buscar un supervisor es la forma mas segura de que la perdida no se registre nunca.
- El rol `admin` **no** habilita descartar. El rol que habilita es `admin_global`.

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
  "requestId": "f9c2b656-eb1d-4a99-bc39-84cfbdfe31d4",
  "statusCode": 409,
  "error": {
    "code": "BANDEJA_YA_DESCARTADA",
    "message": "1 de las bandejas indicadas ya tienen una pérdida registrada",
    "details": {
      "ids": ["1e9e06ae-f6e3-4744-b6cb-9c64e2d81400"]
    }
  },
  "timestamp": "2026-09-07T21:50:33.484Z",
  "path": "/bandejas/descartar"
}
```

Codigos relevantes para frontend:

| HTTP | Code | Motivo comun |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Body o query invalida (UUID mal formado, formato de fecha, `limit` fuera de rango) |
| `400` | `TENANT_REQUIRED` | Falta tenant requerido |
| `401` | `AUTH_INVALID` | Token ausente, invalido, o header de tenant que no coincide con el token |
| `403` | `AUTH_FORBIDDEN` | Rol insuficiente |
| `404` | `BANDEJA_NOT_FOUND` | Bandeja inexistente, borrada o de otro tenant |
| `409` | `BANDEJA_YA_DESCARTADA` | Alguna de las bandejas ya tiene una perdida registrada |
| `422` | `BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES` | `motivo: "otro"` sin observaciones |
| `422` | `BANDEJA_DESCARTE_FECHA_INVALIDA` | Fecha futura, inexistente en el calendario, o anterior al ultimo hecho de la bandeja |
| `422` | `TRASPLANTE_BANDEJA_INVALIDA` | Se intento trasplantar una bandeja descartada |
| `422` | `APLICACION_TARGET_INVALIDO` | Se intento aplicar un quimico sobre una bandeja descartada |
| `409` | `SIEMBRA_HAS_DESCARTADAS` | Se intento borrar una siembra que tiene bandejas descartadas |
| `409` | `LOTE_REFERENCED_BY_BANDEJA` | Se intento borrar un lote usado por una bandeja (descartada incluida) |
| `429` | `RATE_LIMITED` | Demasiadas requests |
| `500` | `INTERNAL` | Error interno |

### Errores que traen `details` util para la UI

Estos tres traen un array de UUIDs: son **exactamente las bandejas conflictivas**, no todo el lote enviado. Sirven para marcar en rojo solo las filas que hay que revisar.

| Code | `details` |
| --- | --- |
| `BANDEJA_NOT_FOUND` | `{ ids: string[] }` - las que no se encontraron |
| `BANDEJA_YA_DESCARTADA` | `{ ids: string[] }` - las que ya tenian perdida |
| `BANDEJA_DESCARTE_FECHA_INVALIDA` | `{ ids: string[] }` - **solo** cuando la fecha es anterior al ultimo hecho de esas bandejas |

Ojo con el ultimo: `BANDEJA_DESCARTE_FECHA_INVALIDA` por fecha futura o por dia inexistente **no** trae `details`, porque no depende de ninguna bandeja en particular. El front tiene que tolerar `details` ausente en ese codigo.

`TRASPLANTE_BANDEJA_INVALIDA` no esta en esta tabla a proposito: **no trae `details`**. Nombra la bandeja dentro del `message`, no en un array. Si la UI de trasplante quiere marcar la fila conflictiva, tiene que quedarse con el id que ya tenia en su propia lista, no esperarlo en la respuesta.

## 8. Modelo de datos

### Motivos

```ts
type DescarteMotivo =
  | "caida"
  | "rotura"
  | "contaminacion"
  | "plaga"
  | "mala_germinacion"
  | "error_carga"
  | "otro";
```

Es un conjunto **cerrado**: no hay endpoint que los liste, y sumar uno nuevo es una migracion de base, no una pantalla de administracion. Se pueden hardcodear en el front con sus etiquetas:

| `value` | Etiqueta sugerida |
| --- | --- |
| `caida` | Caida |
| `rotura` | Rotura |
| `contaminacion` | Contaminacion |
| `plaga` | Plaga |
| `mala_germinacion` | Mala germinacion |
| `error_carga` | Error de carga |
| `otro` | Otro (requiere detalle) |

Un `motivo` fuera de esta lista responde `400 BAD_REQUEST`, no `422`.

### Estados de la bandeja

```ts
type BandejaEstado =
  | "cooling_period"
  | "en_nursery"
  | "trasplantada"
  | "descartada";
```

`descartada` es **terminal**: no hay transicion de salida.

| Desde | Hacia permitido |
| --- | --- |
| `cooling_period` | `en_nursery`, `descartada` |
| `en_nursery` | `trasplantada`, `descartada` |
| `trasplantada` | `descartada` |
| `descartada` | (ninguno) |

### Descarte resumido

Es lo que trae el **listado** de bandejas y la **trazabilidad**: alcanza para marcar la baja y su causa.

```ts
type DescarteResumen = {
  motivo: DescarteMotivo;
  fecha_descarte: string;
  estado_anterior: Exclude<BandejaEstado, "descartada">;
};
```

### Descarte detallado

Es lo que trae `GET /bandejas/:id`. Suma el texto libre y el responsable.

```ts
type DescarteDetalle = DescarteResumen & {
  observaciones: string | null;
  usuario: UsuarioResumen | null;
};

type UsuarioResumen = {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
};
```

### Bandeja

```ts
type Bandeja = {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  lote_vermiculita_id: string | null;
  estado: BandejaEstado;
  fecha_entrada_nursery: string | null;
  fecha_trasplante: string | null;
  mesa_id: string | null;
  codigo: string;
  establecimiento_id: string;
  carencia_hasta: string | null;
  descarte: DescarteResumen | null;
};
```

Notas:

- **`descarte` es nuevo.** Viene en todas las bandejas del listado y del detalle, en `null` mientras la bandeja no este descartada. En el detalle es un `DescarteDetalle`; en el listado, un `DescarteResumen`.
- A diferencia de otros modulos, este listado **si** devuelve `tenant_id` y `deleted_at`. Es asi desde antes de esta feature y no cambio; el front puede ignorarlos.
- `mesa_id`, `fecha_trasplante`, `fecha_entrada_nursery` y `carencia_hasta` **se conservan tal cual** despues de descartar. La perdida agrega informacion, no reescribe la historia.
- `estado_anterior` nunca vale `"descartada"`: se toma de la fila justo antes de la transicion.

### Fila del reporte de mermas

Es lo que devuelve `GET /bandejas/descartes`: la constancia, mas de donde salio la bandeja.

```ts
type DescarteListItem = {
  bandeja_id: string;
  estado_anterior: Exclude<BandejaEstado, "descartada">;
  motivo: DescarteMotivo;
  observaciones: string | null;
  fecha_descarte: string;
  created_at: string;
  usuario: UsuarioResumen | null;
  bandeja: {
    siembra_id: string;
    mesa_id: string | null;
    establecimiento_id: string;
    lote_semilla_id: string;
  };
};
```

Notas:

- No hay `id` propio: la identidad de la constancia **es** la bandeja. `bandeja_id` es la clave.
- `fecha_descarte` es **cuando ocurrio el incidente**. `created_at` es **cuando se cargo en el sistema**. En un registro retroactivo son distintos, y esa diferencia es justamente el dato interesante para auditoria.
- `usuario` puede venir `null` si la cuenta que registro la perdida ya no existe; el backend guarda un snapshot del email y el nombre, asi que en la practica casi siempre resuelve.

### Las dos fechas

Esto es lo que mas confunde al integrar. Son tres campos y significan tres cosas:

| Campo | Que es | Se puede elegir |
| --- | --- | --- |
| `fecha_descarte` | Dia en que se perdio la bandeja | Si, opcional, dia calendario |
| `created_at` | Instante en que se cargo el registro | No |
| `updated_at` (de la bandeja) | Instante de la transicion de estado | No |

Al enviar `fecha_descarte`:

- El formato es **`YYYY-MM-DD`**, solo el dia. Un timestamp completo (`2026-09-06T10:00:00Z`) es `400 BAD_REQUEST`.
- Si se omite, el backend usa el instante de la carga.
- Una fecha **pasada** se ancla al **mediodia UTC** de ese dia. Enviar `"2026-09-06"` devuelve `"2026-09-06T12:00:00.000Z"`. Es a proposito: el mediodia preserva el dia calendario en cualquier huso entre UTC-11 y UTC+11.
- Enviar **la fecha de hoy** es equivalente a omitirla: el backend usa el `now()` real, no el mediodia, porque anclar "hoy" al mediodia guardaria un instante futuro si el registro ocurre antes de las 12:00 UTC.

Consecuencia para la UI: si el operario elige "hoy" en el date picker, la respuesta trae la hora real y no `12:00`. No es un bug.

## 9. Query params comunes

### Paginacion

```txt
page=1
limit=20
```

- `page` arranca en `1`.
- `limit` por defecto `20`, tope `200`. Un `limit` mayor a `200` es `400 BAD_REQUEST`.
- La respuesta paginada devuelve `meta.page`, `meta.limit` y `meta.total`.
- Los dos listados desempatan por un campo unico, asi que la paginacion es estable: ninguna fila se repite entre paginas ni se saltea. En `GET /bandejas` el desempate es por `id`; en `GET /bandejas/descartes`, por `bandeja_id`.

Ese desempate importa mas de lo que parece aca: las bandejas de una misma siembra se crean en el mismo `INSERT` y comparten `created_at` al microsegundo, y las bandejas de un mismo incidente se descartan en la misma llamada y comparten `fecha_descarte` al microsegundo. Sin desempate, el caso mas comun seria justamente el inestable.

### Ordenamiento

| Endpoint | `sortBy` permitido | Por defecto |
| --- | --- | --- |
| `GET /bandejas` | `fecha_entrada_nursery`, `created_at` | `created_at DESC` |
| `GET /bandejas/descartes` | `fecha_descarte`, `created_at` | `fecha_descarte DESC` |

`sortOrder` es `ASC` o `DESC`.

Diferencia importante entre los dos: en `GET /bandejas`, un `sortBy` fuera de la lista **no rompe**, cae silenciosamente al orden por defecto. En `GET /bandejas/descartes`, un `sortBy` fuera de la lista es **`400 BAD_REQUEST`**. Conviene no depender de la tolerancia del primero.

## 10. Endpoints

### 10.1. Registrar la perdida

```http
POST /bandejas/descartar
```

Roles:

- `operario`, `supervisor`, `admin_global`.

Body:

| Campo | Requerido | Tipo | Descripcion |
| --- | --- | --- | --- |
| `bandeja_ids` | Si | `string[]` | UUIDs. No vacio, maximo `200` |
| `motivo` | Si | `DescarteMotivo` | Uno del enum cerrado |
| `observaciones` | Condicional | `string` | Maximo 500 caracteres. **Obligatorio si `motivo` es `"otro"`** |
| `fecha_descarte` | No | `YYYY-MM-DD` | Dia del incidente. Por defecto, ahora |

Ejemplo:

```json
{
  "bandeja_ids": [
    "e42fae4e-41b6-4d0b-9f1f-612d97ca410d",
    "eaf38d27-6f29-4e73-9430-3060e2026e55"
  ],
  "motivo": "rotura",
  "observaciones": "Se cayo el carro al moverlas",
  "fecha_descarte": "2026-09-06"
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "descartadas": 2,
    "motivo": "rotura",
    "fecha_descarte": "2026-09-06T12:00:00.000Z",
    "bandejas": [
      {
        "bandeja_id": "e42fae4e-41b6-4d0b-9f1f-612d97ca410d",
        "estado_anterior": "cooling_period",
        "siembra_id": "23752795-a94d-41a6-85af-fb600c7ce831",
        "mesa_id": null,
        "establecimiento_id": "231533d7-035b-459f-b769-ddfb723b39cd"
      },
      {
        "bandeja_id": "eaf38d27-6f29-4e73-9430-3060e2026e55",
        "estado_anterior": "cooling_period",
        "siembra_id": "23752795-a94d-41a6-85af-fb600c7ce831",
        "mesa_id": null,
        "establecimiento_id": "231533d7-035b-459f-b769-ddfb723b39cd"
      }
    ],
    "usuario": {
      "id": "815262c9-0962-4237-a824-ac23e2d02d0b",
      "email": "admin@innoview.local",
      "nombre": null,
      "apellido": null
    }
  }
}
```

El codigo de exito es **`201`**, no `200`.

#### Todo o nada

La operacion es atomica sobre el conjunto enviado. **Si una sola bandeja del lote es invalida, no se descarta ninguna.**

Esto es deliberado: un exito parcial dejaria al operario sin saber que quedo registrado y que no. Cuando el backend rechaza, `details.ids` dice exactamente cuales fueron el problema, y el front puede sacarlas de la seleccion y reintentar.

#### Los ids repetidos no son error

Mandar dos veces la misma bandeja se deduplica en el backend. `descartadas` cuenta bandejas distintas, no elementos del array.

#### Reglas de validacion, en orden

El backend valida en este orden, y corta en la primera que falla:

1. Forma del body -> `400 BAD_REQUEST`.
2. `motivo: "otro"` sin observaciones -> `422 BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES`.
3. `fecha_descarte` inexistente en el calendario (`2026-02-31`) -> `422 BANDEJA_DESCARTE_FECHA_INVALIDA`.
4. `fecha_descarte` posterior a hoy -> `422 BANDEJA_DESCARTE_FECHA_INVALIDA`.
5. Alguna bandeja no existe, esta borrada o es de otro tenant -> `404 BANDEJA_NOT_FOUND` con `details.ids`.
6. Alguna bandeja ya esta descartada -> `409 BANDEJA_YA_DESCARTADA` con `details.ids`.
7. `fecha_descarte` anterior al ultimo hecho conocido de alguna bandeja -> `422 BANDEJA_DESCARTE_FECHA_INVALIDA` con `details.ids`.

Los pasos 1 a 4 se resuelven **antes** de tocar la base. Los pasos 5 a 7 corren dentro de la transaccion, con las filas bloqueadas.

Sobre el paso 7: "el ultimo hecho conocido" es el trasplante; si no lo hubo, la entrada a nursery; si tampoco, la siembra. Una bandeja trasplantada el 5 no pudo perderse el 3.

#### Que pasa del lado del backend

Util para saber que refrescar despues de un `201`:

- La bandeja pasa a `descartada`. Su `mesa_id`, `fecha_trasplante` y `carencia_hasta` **no se tocan**.
- Se escribe la constancia con motivo, fecha, estado previo y snapshot del usuario.
- Si la bandeja estaba **trasplantada**, se agrega un evento `bandeja_descartada` al historial de la mesa, fechado con la fecha del incidente. Las bandejas en nursery no generan evento: todavia no pertenecen a ninguna mesa.
- Se escribe una entrada de auditoria con el usuario, las bandejas y el motivo.
- **`mesas.plantas_estimadas` no se recalcula.** Es una decision tomada, no un pendiente: ese contador es una estimacion, y la merma se consulta desde el reporte.

#### Concurrencia

Dos requests simultaneas sobre la misma bandeja no pueden dejarla descartada dos veces ni descartada y trasplantada a la vez. Una prospera y la otra recibe `409 BANDEJA_YA_DESCARTADA` o `422 TRASPLANTE_BANDEJA_INVALIDA`.

Para la UI esto significa: **deshabilitar el boton mientras la request esta en vuelo**, y tratar el `409` como "alguien te gano de mano, recarga", no como un error del usuario.

### 10.2. Listar bandejas

```http
GET /bandejas
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina (tope `200`) |
| `estado` | No | `cooling_period`, `en_nursery`, `trasplantada`, `descartada` |
| `establecimiento_id` | No | UUID |
| `siembra_id` | No | UUID |
| `mesa_id` | No | UUID. **La via para llegar a la bandeja desde su ubicacion fisica** |
| `lote_semilla_id` | No | UUID |
| `lote_vermiculita_id` | No | UUID |
| `sortBy` | No | `fecha_entrada_nursery`, `created_at` |
| `sortOrder` | No | `ASC` o `DESC` |

#### Cambio de comportamiento: el default de `estado`

**Esto es lo que hay que mirar al integrar.**

`GET /bandejas` **sin** filtro `estado` ahora devuelve todo **menos** las descartadas.

| Request | Devuelve |
| --- | --- |
| `GET /bandejas` | Todo menos `descartada` |
| `GET /bandejas?estado=descartada` | Solo las descartadas |
| `GET /bandejas?estado=en_nursery` | Solo las de nursery |

La asimetria es deliberada: ocultar un estado terminal por defecto es la misma convencion que `deleted_at IS NULL`. Un selector de bandejas para trasplantar no deberia tener que acordarse de excluir las perdidas.

Consecuencias practicas:

- Cualquier pantalla que hoy hace `GET /bandejas` y espera "todas" va a ver **menos filas** que antes. Si necesita las descartadas, tiene que pedirlas explicitamente.
- `meta.total` respeta el mismo filtro. El total del listado por defecto **no** incluye las descartadas.
- No hay forma de pedir "todo, descartadas incluidas" en una sola llamada. Si una pantalla lo necesita, son dos requests.

Ejemplo:

```http
GET /bandejas?mesa_id=5aac9e4e-c25b-46c5-b946-4b95f148405a&limit=200
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "175b770e-5f54-476a-837d-3a33579a7af1",
      "tenant_id": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-09-07T21:25:16.365Z",
      "updated_at": "2026-09-07T21:33:22.066Z",
      "deleted_at": null,
      "siembra_id": "16f9e832-1c4c-4e42-9355-b2bd3f7c00cf",
      "lote_semilla_id": "b24dd1f9-b96c-4082-879b-191128e27eb3",
      "lote_sustrato_id": "f06df56b-ca2b-40a4-ac8c-a0689c2a3fef",
      "lote_vermiculita_id": null,
      "estado": "descartada",
      "fecha_entrada_nursery": "2026-09-07T21:25:16.492Z",
      "fecha_trasplante": "2026-09-07T21:26:51.555Z",
      "mesa_id": "5aac9e4e-c25b-46c5-b946-4b95f148405a",
      "codigo": "94bf3b7c-8af9-4090-9bd4-61e5dc1d41e8",
      "establecimiento_id": "231533d7-035b-459f-b769-ddfb723b39cd",
      "carencia_hasta": null,
      "descarte": {
        "motivo": "caida",
        "fecha_descarte": "2026-09-07T21:33:22.066Z",
        "estado_anterior": "trasplantada"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 1,
    "total": 11
  }
}
```

En las bandejas no descartadas, `descarte` viene `null`.

### 10.3. Obtener bandeja por ID

```http
GET /bandejas/:id
```

Roles:

- Cualquier usuario autenticado.

Devuelve la bandeja con `descarte` **detallado**: suma `observaciones` y `usuario` al resumen del listado.

Respuesta `200`:

```json
{
  "ok": true,
  "data": {
    "id": "1e9e06ae-f6e3-4744-b6cb-9c64e2d81400",
    "estado": "descartada",
    "mesa_id": "5aac9e4e-c25b-46c5-b946-4b95f148405a",
    "fecha_trasplante": "2026-09-07T21:26:51.555Z",
    "carencia_hasta": null,
    "descarte": {
      "motivo": "plaga",
      "fecha_descarte": "2026-09-07T21:44:13.668Z",
      "estado_anterior": "trasplantada",
      "observaciones": "Trips detectados durante la cosecha",
      "usuario": {
        "id": "815262c9-0962-4237-a824-ac23e2d02d0b",
        "email": "admin@innoview.local",
        "nombre": null,
        "apellido": null
      }
    }
  }
}
```

(Recortado: la respuesta real trae todos los campos de `Bandeja`.)

Una bandeja descartada **se puede seguir consultando por id**: no devuelve `404`. Descartar no es borrar.

`404 BANDEJA_NOT_FOUND` significa inexistente, borrada logicamente, o de otro tenant. Los tres colapsan en el mismo codigo a proposito, para no filtrar la existencia de datos de otro cliente.

### 10.4. Reporte de mermas

```http
GET /bandejas/descartes
```

Roles:

- Cualquier usuario autenticado.

Query params:

| Param | Requerido | Descripcion |
| --- | --- | --- |
| `page` | No | Pagina actual |
| `limit` | No | Cantidad por pagina (tope `200`) |
| `establecimiento_id` | No | UUID |
| `siembra_id` | No | UUID |
| `motivo` | No | Uno del enum de motivos |
| `estado_anterior` | No | `cooling_period`, `en_nursery`, `trasplantada` |
| `fecha_desde` | No | `YYYY-MM-DD`, inclusivo |
| `fecha_hasta` | No | `YYYY-MM-DD`, **inclusivo** |
| `sortBy` | No | `fecha_descarte`, `created_at` |
| `sortOrder` | No | `ASC` o `DESC` |

Notas sobre los filtros:

- `estado_anterior` **no acepta `descartada`**: es el unico valor que ese campo nunca toma, y aceptarlo solo serviria para devolver cero filas sin explicar por que. Enviarlo es `400 BAD_REQUEST`. Sirve, por ejemplo, para separar la merma de nursery de la merma de invernadero.
- `fecha_hasta` es **inclusivo hasta el final del dia**. Pedir `fecha_hasta=2026-09-06` incluye todo lo del 6. No hace falta mandar el 7.
- El rango se compara sobre el dia calendario en **UTC**, no en la zona del navegador. Un descarte de las 23:00 hora local puede caer en el dia siguiente del reporte.
- `establecimiento_id` y `siembra_id` no viven en la constancia sino en la bandeja: se resuelven con un join, no con una columna copiada.
- **El reporte no filtra bandejas borradas logicamente.** Una merma es un hecho ocurrido; que la bandeja se borre despues no la saca del reporte.

Ejemplo:

```http
GET /bandejas/descartes?establecimiento_id=231533d7-035b-459f-b769-ddfb723b39cd&fecha_desde=2026-09-01&fecha_hasta=2026-09-07&motivo=plaga
```

Respuesta `200`:

```json
{
  "ok": true,
  "data": [
    {
      "bandeja_id": "1e9e06ae-f6e3-4744-b6cb-9c64e2d81400",
      "estado_anterior": "trasplantada",
      "motivo": "plaga",
      "observaciones": "Trips detectados durante la cosecha",
      "fecha_descarte": "2026-09-07T21:44:13.668Z",
      "created_at": "2026-09-07T21:44:13.668Z",
      "usuario": {
        "id": "815262c9-0962-4237-a824-ac23e2d02d0b",
        "email": "admin@innoview.local",
        "nombre": null,
        "apellido": null
      },
      "bandeja": {
        "siembra_id": "16f9e832-1c4c-4e42-9355-b2bd3f7c00cf",
        "mesa_id": "5aac9e4e-c25b-46c5-b946-4b95f148405a",
        "establecimiento_id": "231533d7-035b-459f-b769-ddfb723b39cd",
        "lote_semilla_id": "b24dd1f9-b96c-4082-879b-191128e27eb3"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 11
  }
}
```

No hay endpoint de agregacion (totales por motivo, por mes, etc.). El agrupado se arma en el front sobre esta lista, o se pide una pagina por filtro y se lee `meta.total`, que es la forma barata de obtener un conteo sin traer las filas:

```http
GET /bandejas/descartes?motivo=plaga&limit=1
```

### 10.5. Impacto en la trazabilidad

```http
GET /trazabilidad/cosecha/:cosecha_id
```

Cada elemento de `bandejas_ciclo` gana un campo `descarte`:

```ts
type BandejaCiclo = {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: BandejaEstado;
  carencia_hasta: string | null;
  descarte: DescarteResumen | null;
  siembra: SiembraInfo | null;
};
```

Es la **misma forma reducida** que devuelve `GET /bandejas`: motivo, fecha y estado previo. El texto libre y el usuario no estan; para eso se abre la bandeja.

Garantia que el front puede asumir: **la trazabilidad de una cosecha devuelve exactamente las mismas bandejas antes y despues de descartar una de ellas.** Ninguna desaparece. La unica diferencia en la respuesta es, en la fila afectada, `estado` y `descarte`. `fecha_trasplante`, los lotes, `carencia_hasta` y el objeto `siembra` quedan identicos, y el resto de la respuesta (cosecha, mesa, packing, aplicaciones, `alerta_carencia_incumplida`) tambien.

Esto es lo que permite mostrar la merma **dentro** del reporte de trazabilidad, sin una consulta aparte.

### 10.6. Lo que una bandeja descartada ya no puede hacer

No son endpoints nuevos; son rechazos que el front tiene que contemplar:

| Accion | Respuesta |
| --- | --- |
| Volver a descartarla | `409 BANDEJA_YA_DESCARTADA` |
| Trasplantarla | `422 TRASPLANTE_BANDEJA_INVALIDA` |
| Aplicarle un quimico en nursery | `422 APLICACION_TARGET_INVALIDO` |
| Borrar su siembra | `409 SIEMBRA_HAS_DESCARTADAS` |
| Borrar un lote que usa | `409 LOTE_REFERENCED_BY_BANDEJA` |

Los dos ultimos son integridad hacia atras: una perdida es un hecho registrado y no se va de la base junto con la siembra que la origino.

**No existe un endpoint para deshacer un descarte.** Si el front necesita ofrecer "me equivoque", la unica salida hoy es que alguien lo corrija en base. Conviene que la confirmacion de la UI lo diga con todas las letras.

## 11. Flujos recomendados para frontend

### Flujo A: perder una bandeja que esta en una mesa

Es el caso mas comun y el que justifica el filtro `mesa_id`. El operario ve la mesa fisica; no sabe el id de la bandeja.

1. El operario elige el tunel y la mesa en la UI.
2. Pedir `GET /bandejas?mesa_id=<id>&limit=200`. Sin filtro `estado`, asi que las ya perdidas **no** vienen: no se puede seleccionar una bandeja que ya esta descartada.
3. Mostrar la lista. Como el `codigo` de la bandeja no es legible para un humano, conviene identificarlas por siembra y lote de semilla, y numerarlas por indice.
4. El operario selecciona una o varias con checkbox.
5. Pedir motivo (select del enum) y observaciones (textarea).
6. **Si el motivo es `otro`, hacer obligatorio el textarea en la UI.** El backend igual lo rechaza, pero conviene no gastar un round trip.
7. Fecha: por defecto hoy, con opcion de elegir un dia anterior. Bloquear los dias futuros en el date picker.
8. Mostrar una confirmacion que diga explicitamente que la accion **no se puede deshacer**.
9. Enviar `POST /bandejas/descartar` y deshabilitar el boton.
10. Si responde `201`, refrescar la lista de la mesa y mostrar cuantas quedaron (`descartadas`).
11. Si responde `409` o `422` con `details.ids`, marcar esas filas y dejar el resto de la seleccion intacto para reintentar.

### Flujo B: perder una bandeja que esta en nursery

Igual que el A, pero el punto de partida es la siembra:

1. Pedir `GET /bandejas?siembra_id=<id>&estado=en_nursery&limit=200`.
2. De ahi en adelante, identico al flujo A desde el paso 4.

Para las que todavia estan en cooling period, cambiar el filtro a `estado=cooling_period`.

### Flujo C: ver las perdidas de una mesa o de una siembra

1. Pedir `GET /bandejas?mesa_id=<id>&estado=descartada`.
2. Cada fila trae `descarte` con motivo, fecha y estado previo: alcanza para una tabla.
3. Para ver observaciones y responsable, abrir el detalle con `GET /bandejas/:id`.

### Flujo D: reporte de mermas

1. Pedir `GET /bandejas/descartes` con los filtros elegidos.
2. Para el resumen por motivo, o se agrupa en el front sobre la pagina, o se hace una request por motivo con `limit=1` y se lee `meta.total`.
3. Para separar merma de nursery de merma de invernadero, usar `estado_anterior`.
4. Mostrar `fecha_descarte` y `created_at` como columnas distintas cuando difieran: es el unico indicio visible de un registro retroactivo.

### Flujo E: seleccionar bandejas para trasplantar

No cambia nada, pero conviene saber por que:

1. Pedir `GET /bandejas?siembra_id=<id>&estado=en_nursery`.
2. Las descartadas no aparecen, porque el filtro es explicito.
3. Si aun asi el backend responde `422 TRASPLANTE_BANDEJA_INVALIDA`, alguien descarto la bandeja entre la carga de la lista y el envio. Recargar.

## 12. Consideraciones de UI/UX

- **Decirle "perdida" o "descarte", nunca "eliminar".** La bandeja no se borra; la palabra importa porque el usuario tiene que entender que la constancia queda.
- Mostrar la confirmacion diciendo que es irreversible. No hay endpoint para deshacerlo.
- Deshabilitar el boton mientras la request esta en vuelo: dos clicks producen un `409` evitable.
- Hacer obligatorio el campo de observaciones cuando el motivo es `otro`, del lado del cliente.
- Bloquear las fechas futuras en el date picker, y no ofrecer fechas anteriores al trasplante o a la entrada a nursery de la bandeja seleccionada: el backend las rechaza y el dato para calcularlo ya esta en la respuesta del listado (`fecha_trasplante`, `fecha_entrada_nursery`).
- Si hay varias bandejas seleccionadas con fechas de trasplante distintas, la cota inferior es **la mas reciente** de todas.
- Tratar `details.ids` como una lista de filas a marcar, no como un mensaje de error suelto.
- No mostrar el `codigo` de la bandeja como identificador principal: hoy es un UUID, no algo que un operario pueda leer o cotejar contra una etiqueta.
- En cualquier pantalla que muestre bandejas descartadas junto a las vivas, distinguirlas visualmente: comparten todos los campos salvo `estado` y `descarte`.
- Mostrar `observaciones` completas en el detalle; en la tabla, truncar (el maximo son 500 caracteres).
- Tolerar `usuario: null` en el descarte sin romper el render.
- Revisar toda pantalla que hoy llame a `GET /bandejas` sin `estado`: va a recibir menos filas que antes.
- Para contar mermas sin traerlas, usar `limit=1` y leer `meta.total`.

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

### Listar las bandejas de una mesa (para elegir cual se perdio)

```ts
const response = await apiFetch(`/bandejas?mesa_id=${mesaId}&limit=200`);
const bandejas = response.data;
// Las descartadas no vienen: el default las excluye.
```

### Registrar la perdida

```ts
async function descartar(
  bandejaIds: string[],
  motivo: string,
  observaciones?: string,
  fechaDescarte?: string
) {
  const body: Record<string, unknown> = {
    bandeja_ids: bandejaIds,
    motivo
  };

  if (observaciones) body.observaciones = observaciones;
  // Solo si el usuario eligio un dia distinto de hoy.
  if (fechaDescarte) body.fecha_descarte = fechaDescarte;

  try {
    const response = await apiFetch("/bandejas/descartar", {
      method: "POST",
      body: JSON.stringify(body)
    });
    return response.data;
  } catch (err: any) {
    const code = err?.error?.code;

    if (code === "BANDEJA_YA_DESCARTADA" || code === "BANDEJA_NOT_FOUND") {
      // details.ids son exactamente las conflictivas: marcarlas y reintentar
      // con el resto de la seleccion.
      return { conflictivas: err.error.details?.ids ?? [] };
    }

    if (code === "BANDEJA_DESCARTE_FECHA_INVALIDA") {
      // Ojo: details puede no venir. Solo lo trae cuando la fecha es anterior
      // al ultimo hecho de esas bandejas; no cuando es futura o inexistente.
      return { fechaInvalida: true, ids: err.error.details?.ids ?? [] };
    }

    if (code === "BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES") {
      return { faltanObservaciones: true };
    }

    throw err;
  }
}
```

### Ver el detalle de una perdida

```ts
const response = await apiFetch(`/bandejas/${bandejaId}`);
const bandeja = response.data;

if (bandeja.descarte) {
  console.log(bandeja.descarte.motivo);
  console.log(bandeja.descarte.observaciones);
  console.log(bandeja.descarte.usuario?.email ?? "usuario dado de baja");
}
```

### Listar las descartadas de una siembra

```ts
const response = await apiFetch(
  `/bandejas?siembra_id=${siembraId}&estado=descartada&limit=200`
);
const perdidas = response.data;
```

### Reporte de mermas de un periodo

```ts
const params = new URLSearchParams({
  establecimiento_id: establecimientoId,
  fecha_desde: "2026-09-01",
  fecha_hasta: "2026-09-30", // inclusivo: incluye todo el dia 30
  limit: "200"
});

const response = await apiFetch(`/bandejas/descartes?${params}`);
const mermas = response.data;
const total = response.meta.total;
```

### Total por motivo, sin traer las filas

```ts
const motivos = [
  "caida",
  "rotura",
  "contaminacion",
  "plaga",
  "mala_germinacion",
  "error_carga",
  "otro"
];

const totales = await Promise.all(
  motivos.map(async (motivo) => {
    const res = await apiFetch(`/bandejas/descartes?motivo=${motivo}&limit=1`);
    return { motivo, total: res.meta.total };
  })
);
```

## 14. Checklist para integracion frontend

Contrato:

- Login guarda `access_token`; el tenant se envia por header.
- Los listados leen `data` y `meta`.
- Los errores leen `error.code`, `error.message` y `error.details`.
- El exito de `POST /bandejas/descartar` se valida contra `201`, no `200`.

Cambio de comportamiento:

- Se reviso toda pantalla que llama a `GET /bandejas` sin `estado`: ahora recibe menos filas.
- Las pantallas que necesitan ver descartadas piden `estado=descartada` explicitamente.
- `meta.total` del listado por defecto se interpreta como "sin descartadas".
- El render tolera el campo nuevo `descarte` en `null` en todas las bandejas.
- El render de `bandejas_ciclo` en trazabilidad tolera el campo nuevo `descarte`.

Registro de la perdida:

- Los motivos estan hardcodeados con los siete valores del enum.
- Observaciones es obligatorio en la UI cuando el motivo es `otro`.
- Observaciones se corta en 500 caracteres.
- `bandeja_ids` nunca supera los 200 elementos por request.
- `fecha_descarte` se envia como `YYYY-MM-DD`, nunca como timestamp completo.
- `fecha_descarte` se omite cuando el usuario no eligio un dia distinto de hoy.
- El date picker bloquea los dias futuros.
- El date picker bloquea los dias anteriores al ultimo hecho de las bandejas seleccionadas.
- La confirmacion dice explicitamente que la accion es irreversible.
- El boton se deshabilita mientras la request esta en vuelo.

Manejo de errores:

- `BANDEJA_NOT_FOUND` marca las filas de `details.ids`.
- `BANDEJA_YA_DESCARTADA` marca las filas de `details.ids` y se trata como "recarga", no como error del usuario.
- `BANDEJA_DESCARTE_FECHA_INVALIDA` se maneja **con y sin** `details`.
- `BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES` devuelve el foco al textarea.
- `TRASPLANTE_BANDEJA_INVALIDA` en el flujo de trasplante se trata como "la lista quedo vieja, recarga".
- La UI entiende que un rechazo no descarta ninguna bandeja del lote.

Lecturas:

- El reporte usa `fecha_hasta` sabiendo que es inclusivo.
- El reporte distingue `fecha_descarte` (incidente) de `created_at` (carga).
- El reporte no envia `estado_anterior=descartada`.
- Los conteos por motivo usan `limit=1` y `meta.total`.
- El render tolera `usuario: null` en el descarte.
