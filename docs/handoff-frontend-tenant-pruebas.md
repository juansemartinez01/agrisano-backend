# Handoff Frontend — Tenant de pruebas

**Fecha:** 2026-08-16
**Tipo de cambio:** solo frontend. **El backend no se modifica y no hay deploy.**
**Breaking:** no. Ningún contrato cambia, ningún endpoint cambia, ningún shape cambia.

---

## 1. TL;DR

Existe un **segundo tenant** con los mismos datos que el de producción, para
poder probar sin ensuciar los datos reales.

| | Producción | Pruebas |
|---|---|---|
| `x-tenant-id` | `00000000-0000-0000-0000-000000000001` | `00000000-0000-0000-0000-000000000002` |
| Usuario | `admin@agrisano.com` | `admin@tenantPruebas.com` |
| Contraseña | *(la de siempre)* | `Admin1234!` |

Lo único que hay que hacer en el front es **poder cambiar el valor del header
`x-tenant-id`**. Nada más. Mismo backend, misma URL, mismos endpoints.

> ⚠️ **Lo más importante de todo el documento:** al cambiar de tenant hay que
> **borrar el access token y el refresh token guardados y volver a loguearse**.
> Si no, la app entra en un loop de 401 del que no sale sola. El porqué está en
> §5.3 — si leés una sola sección, que sea esa.

---

## 2. Cómo funciona el multitenant (contexto)

No hay endpoint de "tenants" ni nada que listar. Un tenant es simplemente un
UUID que viaja en el header `x-tenant-id`. El backend lo mete en el contexto del
request y filtra **todas** las queries por ese valor.

```
header x-tenant-id  →  middleware  →  contexto del request  →  WHERE tenant_id = …
```

Tres reglas que hay que tener presentes:

1. **El header va en todas las requests, incluido el login.** No es opcional y
   no se puede inferir del token.
2. **El header y el token tienen que coincidir.** El JWT lleva adentro el
   `tenant_id` del usuario. Si el header dice otra cosa, el backend responde
   `401 Tenant mismatch`.
3. **El header manda sobre el token.** El backend nunca "corrige" el header
   usando el token — si no coinciden, rechaza.

---

## 3. Qué hay adentro del tenant de pruebas

Es una copia funcional del de producción, con el mismo volumen de datos:

| Recurso | Cantidad | Detalle |
|---|---|---|
| Establecimiento | 1 | "Agrisano", ubicación Adelaide |
| Túneles | 6 | Tunnel 1 a Tunnel 6, capacidad 122 cada uno |
| Mesas | 732 | 122 por túnel, `Table 1` … `Table 122` |
| Posiciones | 732 | **la posición coincide con el número del nombre**: `Table 57` está en `posicion_actual: 57` |
| Bandejas | 732 | una por mesa, estado `trasplantada` |
| Lotes | 3 | `INIT-SEMILLA-001`, `INIT-SUSTRATO-001`, `INIT-VERMICULITA-001` |
| Siembras | 6 | una por túnel |
| Catálogos | 4 | un producto, una variedad, una marca y un proveedor, todos `INIT - …` |
| Usuarios | 1 | sólo el admin |
| Químicos / cosechas / packing | 0 | no se cargó nada |

Las mesas quedaron **listas para trasplantar de nuevo**: tienen bandeja y
posición, así que se ven en la pantalla de invernadero, y el ciclo normal
(cosechar → trasplantar) funciona sobre ellas.

---

## 4. Contratos: nada cambia, pero hay tres shapes distintos

El tenant nuevo **no cambia ningún contrato**. Igual vale documentar tres shapes
que ya existían, porque si el cliente HTTP asume uno solo, el tenant nuevo se va
a ver "vacío" y parece un problema de datos cuando no lo es.

### 4.1 Endpoints de negocio → envelope `{ ok, data, meta }`

`/mesas`, `/tuneles`, `/establecimientos`, `/lotes`, `/siembras`, `/bandejas`,
`/productos`, `/variedades`, `/marcas`, `/proveedores`, `/admin/lotes`,
`/admin/tuneles`, `/admin/productos`, `/admin/variedades`, `/admin/marcas`,
`/admin/proveedores`.

```json
{
  "ok": true,
  "data": [ { "id": "…", "tenant_id": "…", "nombre": "Table 122", "…": "…" } ],
  "meta": { "page": 1, "limit": 20, "total": 732 }
}
```

### 4.2 `/admin/users` y `/admin/audit-logs` → `{ page, limit, total, items }`

**Sin envelope y con `items` en vez de `data`:**

```json
{
  "page": 1,
  "limit": 20,
  "total": 1,
  "items": [
    {
      "id": "9e8954d2-5eab-425d-8949-e8592ed04398",
      "email": "admin@tenantpruebas.com",
      "nombre": "Admin",
      "apellido": "Pruebas",
      "is_active": true,
      "roles": ["admin_global", "admin"],
      "created_at": "2026-08-16T19:56:02.276Z"
    }
  ]
}
```

> Las filas de `/admin/audit-logs` **no traen `tenant_id`** en la respuesta. Los
> logs sí están separados por tenant en la base (verificado), simplemente el
> campo no se expone. No intentar filtrar por tenant en el cliente usando ese
> campo, porque no está.

### 4.3 `/auth/*` → objeto crudo, sin envelope

`/auth/login`, `/auth/refresh` y `/auth/me` devuelven el objeto directo:

```json
// POST /auth/login → HTTP 201  (ojo: 201, no 200)
{ "access_token": "eyJ…", "refresh_token": "eyJ…" }
```

```json
// GET /auth/me → HTTP 200
{
  "id": "9e8954d2-5eab-425d-8949-e8592ed04398",
  "email": "admin@tenantpruebas.com",
  "nombre": "Admin",
  "apellido": "Pruebas",
  "roles": ["admin_global", "admin"],
  "tenant_id": "00000000-0000-0000-0000-000000000002"
}
```

**`/auth/me` es la forma correcta de saber en qué tenant está parada la sesión.**
Devuelve el `tenant_id` real del usuario logueado. Sirve para mostrar un cartel
tipo "estás en PRUEBAS" y para detectar desincronización.

> El orden del array `roles` **no es estable** — a veces viene
> `["admin_global","admin"]` y a veces `["admin","admin_global"]`. Usar
> `includes()`, nunca `roles[0]`.

---

## 5. Errores del header de tenant

Todos verificados contra el ambiente de dev el 2026-08-16.

| Situación | Status | `error.code` | `error.message` |
|---|---|---|---|
| Request sin `x-tenant-id` | `400` | `BAD_REQUEST` | `Missing tenant_id` |
| Token de un tenant + header de otro | `401` | `AUTH_INVALID` | `Tenant mismatch` |
| Header con un uuid mal formado | `401` | `AUTH_INVALID` | `Tenant mismatch` |
| Login con un tenant que no existe | `401` | `AUTH_INVALID` | `Invalid credentials` |
| Login del usuario de un tenant contra otro | `401` | `AUTH_INVALID` | `Invalid credentials` |

```json
{
  "ok": false,
  "requestId": "99286583-a682-46ec-acfc-6fac4dc719a4",
  "statusCode": 401,
  "error": { "code": "AUTH_INVALID", "message": "Tenant mismatch" },
  "timestamp": "2026-08-16T20:41:41.886Z",
  "path": "/auth/me"
}
```

### 5.1 `Tenant mismatch` no es un token vencido

El interceptor de 401 que ya existe seguramente intenta refrescar el token y, si
falla, desloguea. Con `Tenant mismatch` eso **no arregla nada**: el token está
perfecto, el problema es el header. Conviene distinguirlos:

```ts
if (status === 401 && body?.error?.message === 'Tenant mismatch') {
  // no refrescar: limpiar sesión y mandar al login
  limpiarSesion();
  irALogin();
  return;
}
// resto de los 401 → intentar refresh como siempre
```

### 5.2 Un uuid inválido en el header da 401, no 400

Si el valor del header se arma mal (queda `undefined`, `null` o un string
vacío mal serializado), la respuesta es `401 Tenant mismatch` y no un error de
validación. Es fácil confundirlo con un problema de credenciales. **Validar el
formato uuid antes de mandar el header** ahorra bastante tiempo de debug.

### 5.3 ⚠️ `/auth/refresh` ignora el header — la trampa importante

`POST /auth/refresh` **no mira el header `x-tenant-id`**. Saca el tenant de
adentro del refresh token. Verificado: refresca igual con el header del otro
tenant, y refresca igual **sin** header.

Consecuencia concreta, y es el bug que se van a comer si no se maneja:

```
1. Usuario logueado en PRODUCCIÓN. En storage hay tokens del tenant …0001.
2. Se cambia el front a PRUEBAS. El header ahora dice …0002.
3. Primera request → 401 Tenant mismatch  (token …0001 vs header …0002)
4. El interceptor hace refresh → 201 OK, pero devuelve OTRO token de …0001
5. Reintenta → 401 Tenant mismatch de nuevo
6. Volver a 4. Loop infinito.
```

El refresh siempre va a devolver `201` con un token del tenant viejo, así que la
app nunca se recupera sola y tampoco muestra un error claro.

**La solución es una sola línea de disciplina: al cambiar de tenant, borrar
`access_token` y `refresh_token` del storage y forzar login.** No alcanza con
cambiar el header.

```ts
function cambiarTenant(nuevoTenantId: string) {
  storage.remove('access_token');
  storage.remove('refresh_token');
  storage.set('tenant_id', nuevoTenantId);
  irALogin();
}
```

Si además quieren un cinturón de seguridad, al arrancar la app se puede comparar
el `tenant_id` que devuelve `/auth/me` contra el que tienen configurado y, si no
coinciden, limpiar la sesión antes de que empiecen los 401.

---

## 6. Cómo implementarlo del lado del front

El backend no impone ninguna forma en particular. Dos caminos, según lo que
necesiten:

### Opción A — variable de entorno (más simple)

Un `NEXT_PUBLIC_TENANT_ID` por deploy. Un preview de Vercel apuntando al tenant
de pruebas y producción al real. Cero UI, cero riesgo de que un usuario final
termine en el tenant equivocado.

Es la recomendada si el tenant de pruebas es sólo para QA y desarrollo.

### Opción B — selector en runtime

Un desplegable para cambiar de tenant sin redeploy. Si van por acá:

- Guardar el tenant elegido en storage y leerlo desde el interceptor de axios /
  fetch wrapper, para que **todas** las requests lo manden — el login incluido.
- Aplicar sí o sí el borrado de tokens de §5.3.
- Mostrar siempre visible en qué tenant se está parado (un badge de color en el
  header alcanza). Es muy fácil cargar datos en producción creyendo que estás en
  pruebas.
- Limitar el selector a usuarios internos, o directamente esconderlo detrás de
  una env var, para que no aparezca en el build de producción.

En los dos casos, el header se manda igual:

```ts
// interceptor
config.headers['x-tenant-id'] = getTenantId();
```

---

## 7. Cosas que NO funcionan igual entre los dos tenants

### 7.1 Los QR son distintos

`mesas.codigo_qr` y `bandejas.codigo` son UUIDs **únicos a nivel global**, no por
tenant. Al crear el tenant de pruebas se generaron códigos nuevos.

**Las etiquetas QR impresas del tenant de producción no resuelven en el de
pruebas.** `GET /mesas/qr/:codigoQr` con un código de producción, estando en el
tenant de pruebas, devuelve `404` (verificado — y está bien que así sea, es
justamente el aislamiento funcionando).

Para probar el flujo de escaneo en el tenant de pruebas hay que generar
etiquetas nuevas a partir de los `codigo_qr` de ese tenant.

### 7.2 `GET /bandejas` sin filtro devuelve 0

No es un problema del tenant nuevo — pasa igual en producción. El endpoint
filtra por defecto `estado = en_nursery`, y las 732 bandejas de los dos tenants
están en `trasplantada`.

```
GET /bandejas                        → total: 0
GET /bandejas?estado=trasplantada    → total: 732
```

Si una pantalla lista bandejas sin pasar `estado`, va a aparecer vacía en los dos
tenants. Mandar el `estado` explícito.

### 7.3 Los roles son compartidos

`admin` y `admin_global` son roles globales, no por tenant. Los dos tenants usan
los mismos registros. Para el front no cambia nada — `/auth/me` sigue devolviendo
los roles del usuario igual que siempre — pero conviene saberlo para no esperar
un catálogo de roles distinto por tenant.

Recordatorio de nombres, porque confunden: **`admin` es administración de
usuarios** y **`admin_global` es administración operativa dentro del mismo
tenant**. `admin_global` **no** significa "global entre tenants" — ese rol no
puede ver nada del otro tenant. Es un nombre desafortunado, no un permiso
especial.

---

## 8. Qué se verificó del aislamiento

Se corrieron 52 pruebas automáticas contra los dos tenants
(`scripts/verificar-tenants.js`). Todas pasaron. Resumen de lo que cubren, por
si el front quiere saber con qué puede contar:

| Grupo | Qué se probó | Resultado |
|---|---|---|
| Autenticación | 6 combinaciones de token/header cruzados | Todas rechazadas |
| Listados | 18 endpoints × 2 tenants | Ninguna fila del otro tenant |
| GET por id | mesas, túneles, establecimientos, lotes y **QR** cruzados | `404` en todos |
| Escritura | crear una mesa en un túnel del otro tenant | `404`, no se escribió nada |
| Códigos únicos | `codigo_qr` y `codigo` de bandeja compartidos | 0 colisiones |
| Paridad | 11 tablas comparadas entre tenants | Mismo conteo en todas |

**Lo que esto significa para el front:** no hace falta filtrar por `tenant_id` en
el cliente. El backend ya lo hace y está verificado. Si una fila del otro tenant
llegara a aparecer en una respuesta, es un bug del backend y hay que reportarlo,
no taparlo con un filtro en el front.

---

## 9. Ids para QA en el tenant de pruebas

Base: `https://agrisano-backend-production.up.railway.app`
Header: `x-tenant-id: 00000000-0000-0000-0000-000000000002`

| Recurso | id |
|---|---|
| Establecimiento "Agrisano" | `d5c13c37-5b16-4b30-a047-477273c7558d` |
| Tunnel 1 | `483364e5-da20-4552-88d9-e6c3b4d64681` |
| Tunnel 2 | `0023359c-0a4c-4105-964f-cc9d1858bef4` |
| Tunnel 3 | `b9777b12-8c86-4881-ac28-8c3410a29fa9` |
| Tunnel 4 | `7e745f56-c2ef-4ae3-a320-d5bdc63db36e` |
| Tunnel 5 | `43401ba2-577c-4ca4-9796-26d9714d4d66` |
| Tunnel 6 | `c2e8f625-d5ae-4b06-a4de-db65f2544801` |
| Mesa "Table 1" (Tunnel 1) | `a4fc2f57-0ca8-44b2-89fd-fa113d60dea6` |
| ↳ su `codigo_qr` | `ed37496b-9aea-43ab-9066-b12b865b0932` |
| Mesa "Table 122" (Tunnel 1) | `e03f0103-054c-476b-96cd-8f90d4fe8058` |
| ↳ su `codigo_qr` | `3a1489cf-8d4d-4be3-ae61-9c63126c2bb2` |
| Lote semilla `INIT-SEMILLA-001` | `72e1a17c-c85a-4be5-9a0a-880fe5895cd5` |
| Lote sustrato `INIT-SUSTRATO-001` | `75678574-a70e-4683-8325-cc119f284139` |
| Lote vermiculita `INIT-VERMICULITA-001` | `9d78a3f2-d494-42c5-a28b-5e348cf79207` |
| Producto `INIT - Producto inicial` | `de353dce-6a82-49fb-a6b6-cba7a0751692` |
| Variedad `INIT - Variedad inicial` | `3babdc05-182c-4965-96a7-ef95005e9be5` |
| Marca `INIT - Marca inicial` | `ef4a5f7a-eee1-4c5f-911b-28c2215d7d89` |
| Proveedor `INIT - Proveedor inicial` | `9a434ce9-9033-4693-9fff-ecb32854ce1b` |
| Usuario admin | `9e8954d2-5eab-425d-8949-e8592ed04398` |

**Login en el tenant de pruebas:**

```bash
curl -X POST "https://agrisano-backend-production.up.railway.app/auth/login" -H "Content-Type: application/json" -H "x-tenant-id: 00000000-0000-0000-0000-000000000002" -d '{"email":"admin@tenantPruebas.com","password":"Admin1234!"}'
```

**Confirmar en qué tenant quedó la sesión:**

```bash
curl "https://agrisano-backend-production.up.railway.app/auth/me" -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: 00000000-0000-0000-0000-000000000002"
```

**Reproducir el `Tenant mismatch` a propósito (para probar el manejo de error):**

```bash
curl "https://agrisano-backend-production.up.railway.app/auth/me" -H "Authorization: Bearer $TOKEN_DE_PRUEBAS" -H "x-tenant-id: 00000000-0000-0000-0000-000000000001"
```

> El email se puede mandar con mayúsculas (`admin@tenantPruebas.com`), el backend
> lo normaliza a minúsculas. Por eso `/auth/me` lo devuelve como
> `admin@tenantpruebas.com` — es el mismo usuario, no hay dos.

---

## 10. Checklist de implementación

**Cliente HTTP**
- [ ] `x-tenant-id` se manda en **todas** las requests, incluido `/auth/login`
- [ ] El valor sale de un solo lugar (env var o storage), nunca hardcodeado en pantallas sueltas
- [ ] Validar que el valor sea un uuid antes de mandarlo (un valor roto da 401, no 400)

**Manejo de sesión (lo crítico)**
- [ ] Al cambiar de tenant: borrar `access_token` **y** `refresh_token`, después ir al login
- [ ] El interceptor de 401 distingue `Tenant mismatch` y **no** intenta refrescar en ese caso
- [ ] Al arrancar la app, comparar el `tenant_id` de `/auth/me` con el configurado y limpiar sesión si difieren

**Parsing de respuestas**
- [ ] `/auth/login`, `/auth/refresh` y `/auth/me` se leen **sin** `.data`
- [ ] `/admin/users` y `/admin/audit-logs` se leen con `.items` y `.total`, no con `.data` y `.meta.total`
- [ ] `roles` se chequea con `includes()`, nunca por índice

**Pantallas**
- [ ] Indicador visible de en qué tenant se está parado
- [ ] Si hay selector de tenant, está oculto o deshabilitado en el build de producción
- [ ] Cualquier listado de bandejas manda `estado` explícito

**Testing**
- [ ] Probar el flujo completo (invernadero, trasplante, cosecha) en el tenant de pruebas
- [ ] Para el escaneo de QR, usar códigos del tenant de pruebas (los impresos de producción dan 404)

---

## 11. Nota final

El tenant de pruebas se puede vaciar y volver a armar cuando haga falta, sin
tocar producción. Si lo dejan inservible probando, avisen y se regenera —
justamente para eso está.

**Lo que sí importa: no cargar datos de prueba en
`00000000-0000-0000-0000-000000000001`.** Ese es el tenant real.
