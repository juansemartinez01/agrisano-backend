# Handoff Frontend — Marca en lotes de semilla y sustrato

**Fecha:** 2026-07-29
**Tipo de cambio:** solo frontend. **El backend no se modifica y no hay deploy.**
**Breaking:** no. Ningún contrato cambia.

---

## 1. TL;DR

El campo `marca_id` de los lotes pasa a usarse **únicamente en lotes de sustrato**.

| tipo de lote | dónde vive la marca | qué manda el front |
|---|---|---|
| **semilla** | `proveedor_semilla_id` (el semillero) | **NO mandar `marca_id`** |
| **sustrato** | `marca_id` | **mandar `marca_id`** |

Nada más. No se borra ninguna columna, no hay migración, no se tocan datos existentes.

---

## 2. Por qué

`lotes` nació con dos columnas de texto libre:

```sql
ALTER TABLE "lotes" ADD "seed_company" varchar(200);  -- el semillero (la marca de la semilla)
ALTER TABLE "lotes" ADD "supplier"     varchar(200);  -- a quién se le compró
```

Después cada una se normalizó a una FK contra la tabla `proveedores`:

- `supplier` → **`proveedor_id`** (el distribuidor / a quién se le compró)
- `seed_company` → **`proveedor_semilla_id`** (el semillero, o sea la marca de la semilla)

El catálogo `marcas` se creó bastante después, empujado por el módulo de químicos, y en ese momento se le agregó `marca_id` a `lotes` "de paso". Resultado: **en un lote de semilla, `marca_id` y `proveedor_semilla_id` son el mismo dato cargado dos veces.**

En sustrato no pasa eso: `proveedor_semilla_id` está **prohibido** por el backend (devuelve 422), así que `marca_id` es el único lugar donde se puede registrar la marca del sustrato — que es un dato real y distinto del proveedor (podés comprar sustrato marca X a través del distribuidor Y).

De ahí la regla asimétrica: cada tipo de lote tiene exactamente **un** campo de marca, solo que es un campo distinto según el tipo.

---

## 3. Alcance: qué NO cambia

Confirmado contra el código, para que nadie espere un deploy que no va a llegar:

- ❌ No hay cambios en el backend. Ni DTOs, ni servicios, ni controllers.
- ❌ No hay migración. Las columnas `marca_id`, la FK `FK_lotes_marca` y el índice `IDX_lotes_marca_id` quedan tal cual.
- ❌ No se modifica ningún registro existente en la base.
- ❌ El módulo `marcas` sigue funcionando igual y sigue siendo usado por **químicos** (ahí no se toca absolutamente nada).
- ❌ El shape de todas las respuestas queda idéntico. `marca_id` va a seguir apareciendo en el JSON de los lotes de semilla, solo que en `null` para los nuevos.

> ⚠️ **La regla no está enforced por el backend.** Un `POST /lotes` de tipo `semilla` con `marca_id` sigue devolviendo `201`, y un `sustrato` sin `marca_id` también. La convención vive únicamente en el código del front. Si el día de mañana se quiere que el backend la haga cumplir, eso sí requiere un cambio y un deploy.

---

## 4. Endpoints afectados

| Endpoint | Método | ¿Cambia el front? | Qué hacer |
|---|---|---|---|
| `/lotes` | `POST` | ✅ **Sí** | No enviar `marca_id` cuando `tipo = "semilla"` |
| `/lotes/:id` | `PATCH` | ✅ **Sí** | No enviar `marca_id` al editar un lote de semilla |
| `/lotes` | `GET` | ⚠️ Visual | No mostrar columna/badge de marca en el listado de semilla |
| `/lotes/:id` | `GET` | ⚠️ Visual | No mostrar el campo marca en el detalle de un lote de semilla |
| `/admin/lotes` | `GET` | ⚠️ Visual | Idéntico al listado público, mismo criterio |
| `/marcas` | `GET` | ⚠️ Visual | El selector se sigue usando, pero **solo en el form de sustrato** |
| `/marcas` | `POST`/`PATCH`/`DELETE` | ❌ No | El ABM de marcas queda igual (lo comparte químicos) |
| `/proveedores` | `GET` | ❌ No | Ya se usa para poblar `proveedor_semilla_id` |
| `/siembras/*` | todos | ❌ No | Nunca devolvieron marca. Ver §7 |
| `/trazabilidad/*` | todos | ❌ No | Nunca devolvieron marca de semilla/sustrato. Ver §7 |
| `/quimicos/*`, `/lotes-quimicos/*` | todos | ❌ **No tocar** | Los químicos siguen usando marca igual que siempre |

---

## 5. Formularios de lote — el detalle

### 5.1 `POST /lotes` — tipo `semilla`

**Roles:** `supervisor`, `admin_global`.

**Body ANTES (como se manda hoy):**

```json
{
  "tipo": "semilla",
  "numero_lote": "SEM-2026-0142",
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "proveedor_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
  "marca_id": "68eda345-ec46-4314-9b69-1dbdbf7781f9",
  "producto_id": "e6db9453-dcba-4999-b070-d79306e46f5d",
  "variedad_id": "5289c720-a935-48c5-b4f9-5502f6b1cd05",
  "proveedor_semilla_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
  "batch": "B-77219",
  "observaciones": "Recepción 12/03"
}
```

**Body DESPUÉS (lo que hay que mandar):**

```json
{
  "tipo": "semilla",
  "numero_lote": "SEM-2026-0142",
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "proveedor_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
  "producto_id": "e6db9453-dcba-4999-b070-d79306e46f5d",
  "variedad_id": "5289c720-a935-48c5-b4f9-5502f6b1cd05",
  "proveedor_semilla_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
  "batch": "B-77219",
  "observaciones": "Recepción 12/03"
}
```

**Único cambio: se quita la clave `marca_id`.** No mandarla como `null` ni como `""` — directamente omitirla.

**Campos del formulario de semilla:**

| Campo | Obligatorio | Tipo | Se puebla con | Nota |
|---|---|---|---|---|
| `tipo` | ✅ | `"semilla"` | fijo | Inmutable después de crear |
| `numero_lote` | ✅ | string ≤100 | input | Único por `(tenant, tipo)` |
| `proveedor_id` | ✅ | uuid | `GET /proveedores?establecimiento_id=X` | El distribuidor |
| `proveedor_semilla_id` | ✅ | uuid | `GET /proveedores?establecimiento_id=X` | **El semillero — esta es "la marca"** |
| `producto_id` | ✅ | uuid | `GET /productos` | |
| `variedad_id` | ✅ | uuid | `GET /variedades?producto_id=X` | Debe pertenecer al producto |
| `establecimiento_id` | ❌ | uuid | selector | Ver ⚠️ en §10 |
| `batch` | ❌ | string ≤100 | input | |
| `observaciones` | ❌ | string ≤2000 | textarea | |
| ~~`marca_id`~~ | — | — | **quitar el selector** | |

> 💡 **Sugerencia de UX:** el label de `proveedor_semilla_id` hoy suele decir "Proveedor de semilla", lo que confunde porque ya hay otro campo "Proveedor". Conviene renombrarlo a **"Semillero"** o **"Marca de la semilla"** para que quede claro que ese campo *es* la marca. Es un cambio de copy, no de contrato.

---

### 5.2 `POST /lotes` — tipo `sustrato`

**Sin cambios respecto de hoy**, salvo que `marca_id` pasa a ser el campo destacado del formulario.

```json
{
  "tipo": "sustrato",
  "numero_lote": "SUS-2026-0087",
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "proveedor_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
  "marca_id": "68eda345-ec46-4314-9b69-1dbdbf7781f9",
  "observaciones": "Palet 3"
}
```

**Campos del formulario de sustrato:**

| Campo | Obligatorio | Tipo | Se puebla con | Nota |
|---|---|---|---|---|
| `tipo` | ✅ | `"sustrato"` | fijo | |
| `numero_lote` | ✅ | string ≤100 | input | |
| `proveedor_id` | ✅ | uuid | `GET /proveedores?establecimiento_id=X` | El distribuidor |
| `marca_id` | ❌ *(ver nota)* | uuid | `GET /marcas` | **La marca del sustrato** |
| `establecimiento_id` | ❌ | uuid | selector | |
| `observaciones` | ❌ | string ≤2000 | textarea | |
| `producto_id`, `variedad_id`, `proveedor_semilla_id` | 🚫 | — | **no mandar nunca** | El backend responde **422** |

> **Sobre "obligatorio":** el backend acepta un sustrato sin `marca_id` (la columna es nullable y el DTO la marca `@IsOptional()`). Si el negocio necesita que el sustrato siempre tenga marca, **hay que validarlo en el front**, porque el backend no lo va a hacer.

> 🐛 **Ojo con `batch` en sustrato:** el backend lo acepta (`POST /lotes` con `tipo: "sustrato"` y `batch: "X"` devuelve `201`), a diferencia de `producto_id`/`variedad_id`/`proveedor_semilla_id` que sí rechaza con 422. Es una inconsistencia conocida del backend. **El front no debe mostrar el campo `batch` en el formulario de sustrato.**

---

### 5.3 `PATCH /lotes/:id`

**Roles:** `supervisor`, `admin_global`. Es un PATCH parcial: solo se mandan los campos que cambiaron.

- **Editando un lote de semilla:** no incluir nunca `marca_id` en el body.
- **Editando un lote de sustrato:** incluir `marca_id` normalmente.

```jsonc
// semilla — cambiar el semillero
PATCH /lotes/14e715e1-9e98-4f89-bdb0-89aa7586936a
{ "proveedor_semilla_id": "f87c3f73-07b4-425e-889e-42498d7d28c9" }

// sustrato — cambiar la marca
PATCH /lotes/622a5b3f-e9d6-4401-a00a-0ff987899458
{ "marca_id": "68eda345-ec46-4314-9b69-1dbdbf7781f9" }
```

**Para limpiar la marca de un sustrato** se manda `null` explícito y funciona (devuelve `200` y deja la columna en `null`):

```json
{ "marca_id": null }
```

**No se puede mandar `tipo` en un PATCH.** El backend responde `400`, pero **no** con el código `LOTE_TIPO_IMMUTABLE` que figura en la doc vieja — responde con el error genérico de validación (ver §9).

---

## 6. Qué devuelven los endpoints de lectura

`GET /lotes` y `GET /lotes/:id` devuelven **la entidad cruda**, con todas las columnas para los dos tipos. No hay campos calculados ni objetos anidados.

**`GET /lotes/:id` — lote de semilla:**

```json
{
  "ok": true,
  "data": {
    "id": "14e715e1-9e98-4f89-bdb0-89aa7586936a",
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "tipo": "semilla",
    "numero_lote": "Test-Lot-1",
    "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
    "proveedor_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
    "marca_id": null,
    "producto_id": "e6db9453-dcba-4999-b070-d79306e46f5d",
    "variedad_id": "5289c720-a935-48c5-b4f9-5502f6b1cd05",
    "proveedor_semilla_id": "f87c3f73-07b4-425e-889e-42498d7d28c9",
    "batch": "B-77219",
    "observaciones": "Test lot N°1",
    "activo": true,
    "created_at": "2026-07-14T10:22:31.812Z",
    "updated_at": "2026-07-29T16:04:55.201Z",
    "deleted_at": null
  }
}
```

**`GET /lotes` — listado paginado:**

```json
{
  "ok": true,
  "data": [ { /* …lotes… */ } ],
  "meta": { "page": 1, "limit": 20, "total": 2 }
}
```

**Puntos clave:**

1. `marca_id` **siempre viene en la respuesta**, para los dos tipos. En semilla va a ser `null` para los lotes nuevos. Eso es esperado, no es un bug.
2. **No hay `marca` anidada.** El backend nunca hace join con `marcas` para lotes — devuelve solo el uuid. Ver §8 para resolver el nombre.
3. **No hay `proveedor_semilla` anidado.** Mismo caso: solo el uuid.

---

## 7. Dónde mostrar marca y dónde NO

### ✅ Mostrar marca

| Pantalla | Origen del dato | Cómo |
|---|---|---|
| Listado de lotes de **sustrato** | `GET /lotes?tipo=sustrato` → `marca_id` | Resolver nombre con el mapa de §8 |
| Detalle de lote de **sustrato** | `GET /lotes/:id` → `marca_id` | Idem |
| Alta/edición de lote de **sustrato** | selector poblado con `GET /marcas` | |
| Todo el módulo de **químicos** | sin cambios | El backend ya devuelve `marca: {id, nombre}` anidada en aplicaciones químicas y trazabilidad |
| ABM de marcas | `GET /marcas` | Sin cambios |

### ❌ NO mostrar marca

| Pantalla | Qué mostrar en su lugar |
|---|---|
| Listado de lotes de **semilla** | El **semillero** (`proveedor_semilla_id` → nombre del proveedor) |
| Detalle de lote de **semilla** | Idem |
| Alta/edición de lote de **semilla** | Selector de **semillero**, no de marca |
| Listado mixto (`GET /lotes` sin filtro de tipo) | Columna condicional por fila según `tipo` — ver abajo |

**Listado mixto:** si hay una grilla que muestra los dos tipos juntos, la columna "Marca" debe resolverse por fila:

```ts
function marcaDeLote(lote: Lote, marcas: Map<string, string>, proveedores: Map<string, string>): string {
  return lote.tipo === 'semilla'
    ? proveedores.get(lote.proveedor_semilla_id ?? '') ?? '—'
    : marcas.get(lote.marca_id ?? '') ?? '—';
}
```

### ℹ️ Endpoints que nunca mostraron marca (y siguen sin mostrarla)

No hay nada que cambiar acá, pero conviene saberlo para no buscar un campo que no existe:

- **Detalle de siembra** (`GET /siembras/:id`): cada bandeja trae `lote_semilla` y `lote_sustrato` anidados, pero **solo con `{ id, numero_lote, tipo }`**. Sin marca, sin producto, sin variedad.
- **Trazabilidad** (`GET /trazabilidad/*`): el linaje de bandeja trae `lote_semilla_numero` / `lote_semilla_tipo` y sus equivalentes de sustrato. **Sin marca.** (La marca del **químico** sí aparece ahí, no confundir.)
- **Cosecha, packing, trasplante:** no exponen datos de lote más allá del número.

---

## 8. Cómo resolver el nombre de la marca (importante)

**No existe ningún endpoint que devuelva el nombre de la marca junto con el lote.** El backend devuelve solo `marca_id`. Para mostrar "Klasmann" en vez de un uuid hay que traerse el catálogo y cruzar en cliente.

```ts
// 1. Traer el catálogo una vez (cachear — cambia muy poco)
const res = await api.get('/marcas', { params: { limit: 200, activo: true } });
const marcas = new Map<string, string>(res.data.data.map((m: Marca) => [m.id, m.nombre]));

// 2. Resolver al renderizar
const nombreMarca = lote.marca_id ? marcas.get(lote.marca_id) ?? '—' : '—';
```

**Datos del catálogo de marcas:**

- `GET /marcas` — accesible para **cualquier usuario autenticado**.
- Paginado. El `limit` máximo es **200**. Si llega a haber más de 200 marcas, hay que paginar.
- Filtros disponibles: `q` (busca por `nombre`), `activo`. Orden: `sortBy` ∈ `nombre` | `created_at`, `sortOrder` ∈ `ASC` | `DESC`.
- Shape: `{ id, tenant_id, nombre, activo, created_at, updated_at, deleted_at }`.
- Las marcas son **globales por tenant** — no están asociadas a ningún establecimiento.

**Para el semillero (`proveedor_semilla_id`) el patrón es el mismo pero contra `/proveedores`:**

```ts
const res = await api.get('/proveedores', { params: { establecimiento_id: estId, limit: 200 } });
const proveedores = new Map<string, string>(res.data.data.map((p) => [p.id, p.nombre]));
```

> ⚠️ **Diferencia clave:** los **proveedores son por establecimiento** (`establecimiento_id` es obligatorio al crearlos, y la unicidad del nombre es por establecimiento). Las **marcas son globales del tenant**. O sea: el mismo semillero cargado en 3 establecimientos son 3 registros con 3 uuids distintos. Si hay un selector de semillero, hay que filtrarlo por el establecimiento del lote, y no asumir que el mismo nombre implica el mismo id.

---

## 9. Filtros, búsqueda y orden en `GET /lotes`

**Parámetros aceptados — esta es la lista completa:**

| Param | Valores | Nota |
|---|---|---|
| `q` | string | Busca **solo** por `numero_lote` (ILIKE parcial). No busca por marca ni por proveedor. |
| `tipo` | `semilla` \| `sustrato` | |
| `activo` | `true` \| `false` | Sin este filtro vienen activos **e inactivos** mezclados |
| `page` | int | default 1 |
| `limit` | int | default 20, máximo 200 |
| `sortBy` | `numero_lote` \| `created_at` | Cualquier otro valor se ignora silenciosamente y cae a `created_at DESC` |
| `sortOrder` | `ASC` \| `DESC` | |

**🚫 NO existe filtro por marca.** Y no lo ignora: devuelve un **400 duro**.

```
GET /lotes?marca_id=68eda345-ec46-4314-9b69-1dbdbf7781f9
→ 400 { "error": { "code": "BAD_REQUEST", "message": "property marca_id should not exist" } }
```

Lo mismo con `establecimiento_id` y `proveedor_id`. **Cualquier query param que no esté en la tabla de arriba tira 400.** Si hace falta filtrar el listado de sustrato por marca, hoy solo se puede hacer **en cliente**, sobre la página ya traída — con la limitación obvia de que filtra únicamente lo que está en esa página. Si el negocio lo necesita en serio, es un cambio de backend.

Mismo caso en `GET /quimicos`: tampoco tiene filtro por `marca_id`.

---

## 10. Errores — códigos reales

Todos los errores vienen con este envelope:

```json
{
  "ok": false,
  "requestId": "b3f1…",
  "statusCode": 422,
  "error": { "code": "LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO", "message": "…", "details": {} },
  "timestamp": "2026-07-29T16:04:55.201Z",
  "path": "/lotes"
}
```

| Status | `code` | Cuándo | Qué mostrar |
|---|---|---|---|
| `400` | `BAD_REQUEST` | Falla de validación del DTO: campo desconocido, uuid mal formado, string muy largo, enum inválido | El `message` trae el detalle exacto de class-validator |
| `409` | `LOTE_NUMERO_DUPLICADO` | Ya existe un lote con ese `numero_lote` **para ese mismo `tipo`** en el tenant | "Ya existe un lote de {tipo} con ese número" |
| `422` | `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` | Se mandó `proveedor_semilla_id` en un lote de sustrato | No debería pasar si el form está bien |
| `422` | `LOTE_PRODUCTO_NO_PERMITIDO` | Se mandó `producto_id` o `variedad_id` en un lote de sustrato | Idem |
| `422` | `LOTE_VARIEDAD_PRODUCTO_MISMATCH` | La variedad no pertenece al producto elegido | "La variedad no corresponde al producto" |
| `404` | `NOT_FOUND` | El lote no existe, **o** alguna FK enviada no existe | Ver ⚠️ abajo |
| `409` | `LOTE_REFERENCED_BY_BANDEJA` | Se intenta borrar un lote usado por bandejas | "El lote está en uso y no puede eliminarse" |
| `403` | — | El rol no alcanza (`POST`/`PATCH` requieren `supervisor`) | |

### ⚠️ Trampas del backend que el front tiene que conocer

Estas no son parte del cambio, pero afectan cómo se implementa el formulario. Todas están verificadas contra el ambiente de dev.

**1. Un `404 NOT_FOUND` no dice qué campo falló.** Si se manda un `proveedor_id`, `marca_id`, `producto_id`, `variedad_id` o `proveedor_semilla_id` que no existe, la respuesta es siempre la misma:

```json
{ "statusCode": 404, "error": { "code": "NOT_FOUND", "message": "Resource not found", "details": { "id": "11111111-…" } } }
```

Los códigos `MARCA_NOT_FOUND`, `PROVEEDOR_NOT_FOUND`, `PRODUCTO_NOT_FOUND` y `VARIEDAD_NOT_FOUND` que figuran en `docs/lotes-frontend.md` **no existen en la práctica** — el backend nunca los emite. La única pista es el uuid en `details.id`: el front puede compararlo contra los ids que mandó para saber cuál era y marcar ese campo del formulario.

**2. La respuesta del `PATCH` viene incompleta — no usarla para refrescar el estado.** Es un bug conocido del backend que afecta a todo el proyecto. El `PATCH` devuelve `200` con un body al que le faltan los campos que **no** se enviaron: los nullable vuelven como `null` y los NOT NULL directamente no aparecen.

```
PATCH /lotes/14e715e1… { "observaciones": "nueva obs" }
→ 200 { "observaciones": "nueva obs", "proveedor_id": null, "marca_id": null, … }   ← ¡mentira!

GET /lotes/14e715e1…   (inmediatamente después)
→ 200 { "observaciones": "nueva obs", "proveedor_id": "f87c3f73…", "marca_id": "68eda345…", … }   ← la verdad
```

**La base de datos queda perfecta**, solo el body de la respuesta está mal. **Después de todo `PATCH`, hacer un `GET` para refrescar** (o invalidar la query si usan React Query / TanStack). Aplica también a `PATCH /marcas/:id`.

**3. Un `:id` que no sea un uuid válido devuelve `500`, no `404`.** `GET /lotes/no-es-uuid` → `500 INTERNAL`. Validar el formato del uuid en el front antes de pegarle al endpoint.

**4. `tipo` en un `PATCH` da `400 BAD_REQUEST`, no `LOTE_TIPO_IMMUTABLE`.** El código `LOTE_TIPO_IMMUTABLE` está en el backend pero es inalcanzable — la validación del framework corre antes. El mensaje real es `"property tipo should not exist"`. Si hay un handler esperando `LOTE_TIPO_IMMUTABLE`, nunca se va a disparar.

**5. `establecimiento_id` no se valida.** El backend acepta cualquier uuid, incluso uno inexistente (no hay FK ni chequeo). Un valor incorrecto no falla al crear el lote, pero después rompe la creación de siembras con `LOTE_ESTABLECIMIENTO_MISMATCH`. **El front tiene que garantizar que ese id salga siempre de un selector poblado con `GET /establecimientos`**, nunca escrito a mano ni heredado de un contexto stale.

---

## 11. Datos históricos

**No se migró nada.** Los lotes de semilla que ya existen conservan su `marca_id` cargado. Los nuevos van a tener `null`.

Consecuencia: el listado de semilla va a tener registros con `marca_id` lleno y otros vacíos. **No es un problema visual** porque a partir de este cambio el front deja de mostrar ese campo en semilla — simplemente lo ignora. No hace falta ningún tipo de saneamiento ni lógica de compatibilidad.

Si en algún momento se quiere limpiar, es un `UPDATE` puntual del lado de la base, no algo que el front tenga que resolver.

---

## 12. Checklist de implementación

**Formulario de lote de semilla**
- [ ] Quitar el selector "Marca" del formulario de alta
- [ ] Quitar el selector "Marca" del formulario de edición
- [ ] Quitar `marca_id` del payload de `POST /lotes` (omitir la clave, no mandar `null`)
- [ ] Quitar `marca_id` del payload de `PATCH /lotes/:id`
- [ ] Renombrar el label de `proveedor_semilla_id` a "Semillero" o "Marca de la semilla"
- [ ] Verificar que el selector de semillero filtre proveedores por el establecimiento del lote

**Formulario de lote de sustrato**
- [ ] Mantener el selector "Marca" (`GET /marcas`)
- [ ] Decidir y aplicar si `marca_id` va a ser obligatorio **en el front** (el backend no lo exige)
- [ ] Confirmar que **no** se muestra el campo `batch` (el backend lo acepta, pero no corresponde)
- [ ] Confirmar que nunca se envían `producto_id`, `variedad_id` ni `proveedor_semilla_id`

**Listados y detalle**
- [ ] Listado de semilla: reemplazar la columna "Marca" por "Semillero"
- [ ] Listado de sustrato: mantener "Marca", resolviendo el nombre con el mapa de `/marcas`
- [ ] Listado mixto: columna condicional por `tipo`
- [ ] Detalle de lote: mismo criterio condicional
- [ ] Verificar que no quede ningún `?marca_id=` en una query de `/lotes` (tira **400**)

**Robustez (ver §10)**
- [ ] Refrescar con `GET` después de cada `PATCH`, no confiar en la respuesta
- [ ] Validar formato uuid antes de pegarle a `/lotes/:id` y `/marcas/:id`
- [ ] Mapear el `404 NOT_FOUND` genérico usando `details.id` para señalar el campo culpable

**No tocar**
- [ ] Módulo de químicos y lotes químicos — la marca ahí funciona distinto y queda igual
- [ ] ABM de marcas — lo comparte químicos, no se puede simplificar

---

## 13. Ejemplos para QA

Ambiente de dev: `https://agrisano-backend-production.up.railway.app`
Header obligatorio en **todas** las requests, incluido el login: `x-tenant-id: 00000000-0000-0000-0000-000000000001`

**Crear lote de semilla sin marca (caso principal) → debe dar `201` con `marca_id: null`:**

```bash
curl -X POST "$BASE/lotes" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT" -H "Content-Type: application/json" -d '{"tipo":"semilla","numero_lote":"QA-SEM-001","proveedor_id":"f87c3f73-07b4-425e-889e-42498d7d28c9","producto_id":"e6db9453-dcba-4999-b070-d79306e46f5d","variedad_id":"5289c720-a935-48c5-b4f9-5502f6b1cd05","proveedor_semilla_id":"f87c3f73-07b4-425e-889e-42498d7d28c9"}'
```

**Crear lote de sustrato con marca → debe dar `201` con la `marca_id` seteada:**

```bash
curl -X POST "$BASE/lotes" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT" -H "Content-Type: application/json" -d '{"tipo":"sustrato","numero_lote":"QA-SUS-001","proveedor_id":"f87c3f73-07b4-425e-889e-42498d7d28c9","marca_id":"68eda345-ec46-4314-9b69-1dbdbf7781f9"}'
```

**Confirmar que el filtro por marca NO existe → debe dar `400`:**

```bash
curl "$BASE/lotes?marca_id=68eda345-ec46-4314-9b69-1dbdbf7781f9" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $TENANT"
```

**Ids de dev útiles:**

| Recurso | id |
|---|---|
| marca "Happy Valley Seeds" | `68eda345-ec46-4314-9b69-1dbdbf7781f9` |
| proveedor | `f87c3f73-07b4-425e-889e-42498d7d28c9` |
| producto | `e6db9453-dcba-4999-b070-d79306e46f5d` |
| variedad | `5289c720-a935-48c5-b4f9-5502f6b1cd05` |
| establecimiento | `00bb7c42-01fc-43ab-b4b7-39c4f18350e2` |
| lote semilla existente | `14e715e1-9e98-4f89-bdb0-89aa7586936a` |
| lote sustrato existente | `622a5b3f-e9d6-4401-a00a-0ff987899458` |

---

## 14. Nota sobre `docs/lotes-frontend.md`

El documento de contrato existente **quedó desactualizado** en tres puntos y este handoff lo reemplaza donde haya contradicción:

1. Presenta `marca_id` como opcional genérico para los dos tipos — ahora es exclusivo de sustrato.
2. Documenta los códigos `MARCA_NOT_FOUND` / `PROVEEDOR_NOT_FOUND` / `PRODUCTO_NOT_FOUND` / `VARIEDAD_NOT_FOUND`, que el backend nunca emite (§10, trampa 1).
3. Documenta `400 LOTE_TIPO_IMMUTABLE` en el `PATCH` con `tipo`, que también es inalcanzable (§10, trampa 4).
4. Sus ejemplos de respuesta de `PATCH 200` muestran la entidad completa, cuando en realidad viene incompleta (§10, trampa 2).
