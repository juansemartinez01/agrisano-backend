# Handoff frontend — estado de consumido para lotes (semilla y sustrato)

**Estado**: desplegado en el entorno de desarrollo (Railway) y verificado de punta a punta el 2026-07-30.
**Tipo de cambio**: ✅ **aditivo y NO breaking**. Ningún endpoint existente cambia de shape ni de comportamiento por defecto. Todo lo de acá abajo es capacidad nueva.
**Referencia técnica**: `specs/019-lote-estado-consumido/contracts/consumir-lote.md`, `specs/019-lote-estado-consumido/contracts/rehabilitar-lote.md`, `specs/019-lote-estado-consumido/quickstart.md`, y la sección 5 de `docs/lotes-frontend.md` (roles/tenancy — sin cambios).

---

## 1. TL;DR

Los lotes (semilla y sustrato) ahora tienen un **segundo eje de estado**, independiente del ya existente `activo`:

| Eje | Campo | Valores | Quién lo controla | Qué significa |
|---|---|---|---|---|
| Ya existía | `activo` | `true` / `false` | `PATCH /lotes/:id` | Baja administrativa (el lote "no debería existir más" en el sistema) |
| **Nuevo** | `estado` | `"habilitado"` / `"consumido"` | `POST /lotes/:id/consumir` y `POST /lotes/:id/rehabilitar` | Disponibilidad operativa (el lote "ya se usó/gastó físicamente") |

**Los dos ejes son independientes y se evalúan juntos solo en el filtro de conveniencia `disponible=true`.** Un lote puede estar `activo:true` + `estado:"consumido"` (se gastó pero sigue siendo un registro válido), o `activo:false` + `estado:"habilitado"` (se dio de baja administrativamente sin haberse consumido).

Novedades concretas:

1. **2 endpoints nuevos**: `POST /lotes/:id/consumir` (marca como consumido, con nota opcional) y `POST /lotes/:id/rehabilitar` (revierte, solo supervisor/admin).
2. **2 query params nuevos** en `GET /lotes`: `estado` y `disponible`.
3. **7 columnas nuevas** en la respuesta de lote (`estado`, `fecha_consumido`, `usuario_consumido_id` + 3 snapshots, `observaciones_consumo`) — aditivas, no rompen nada.
4. **`POST /siembras` ahora puede rechazar** con 422 si el lote de semilla o de sustrato elegido está `consumido` o `inactivo` (antes solo se validaba pertenencia al establecimiento).
5. **`PATCH /lotes/:id` sigue sin aceptar `estado`** — es de solo lectura desde ese endpoint; solo cambia vía `consumir`/`rehabilitar`.

### Por qué

En campo, un lote de semilla o sustrato se "termina" (se usa todo el stock físico) sin que eso signifique que el registro deba borrarse o darse de baja administrativamente. Antes de esta feature no había forma de marcar "esto ya no tiene más para usar" sin desactivar el lote entero (lo cual también lo ocultaba de reportes/historial). Ahora ese estado operativo es explícito, reversible y queda auditado.

---

## 2. Endpoints afectados

| Endpoint | Impacto |
|---|---|
| `POST /lotes/:id/consumir` | **Nuevo.** Marca el lote como `consumido`. Roles: `operario`, `supervisor`, `admin_global`. |
| `POST /lotes/:id/rehabilitar` | **Nuevo.** Revierte a `habilitado`. Roles: **solo** `supervisor`, `admin_global` (no `operario`). |
| `GET /lotes` | Gana 2 query params opcionales (`estado`, `disponible`). Sin params, comportamiento idéntico al actual. Cada item de la respuesta gana las 7 columnas nuevas. |
| `GET /lotes/:id` | Sin cambios de comportamiento. La respuesta gana las 7 columnas nuevas. |
| `POST /lotes` | Sin cambios de request. La respuesta ahora trae `estado: "habilitado"` por defecto y las demás columnas nuevas en `null`. |
| `PATCH /lotes/:id` | **Sin cambios de comportamiento**, pero ahora es explícito: si mandan `estado` en el body, responde **400** (whitelist). Nunca fue un campo válido acá, pero antes no existía la columna. |
| `DELETE /lotes/:id` | Sin cambios. |
| `POST /siembras` | **Gana 2 rechazos nuevos** (422 `LOTE_CONSUMIDO`, 422 `LOTE_INACTIVO`) al crear siembra con un lote de semilla o sustrato no disponible. El resto del contrato (body, respuesta exitosa) no cambia. |

**No hay que tocar ninguna pantalla de lectura para que siga funcionando.** Los campos nuevos son aditivos y cualquier cliente que ya ignora campos desconocidos sigue andando igual.

---

## 3. El modelo de dos ejes, en detalle

```ts
type LoteEstado = "habilitado" | "consumido";

interface Lote {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tipo: "semilla" | "sustrato";
  numero_lote: string;
  establecimiento_id: string | null;
  proveedor_id: string | null;
  marca_id: string | null;
  observaciones: string | null;
  activo: boolean;                                  // ya existía — baja administrativa

  // ---- nuevo en esta feature ----
  estado: LoteEstado;                                // default "habilitado"
  fecha_consumido: string | null;                    // ISO, seteada al consumir
  usuario_consumido_id: string | null;                // uuid del usuario que consumió
  usuario_consumido_email_snapshot: string | null;    // snapshot inmutable, no FK viva
  usuario_consumido_nombre_snapshot: string | null;
  usuario_consumido_apellido_snapshot: string | null;
  observaciones_consumo: string | null;               // nota libre, la que mandó consumir

  // solo semilla (null en sustrato)
  producto_id: string | null;
  variedad_id: string | null;
  batch: string | null;
  proveedor_semilla_id: string | null;
}
```

### Por qué son snapshots y no un FK vivo

`usuario_consumido_email_snapshot`/`nombre`/`apellido` se capturan **en el momento del consumo** y no cambian después, aunque el usuario real edite su email o nombre más adelante. Es el mismo patrón que ya usan `siembras.usuario_email_snapshot` etc. — si necesitan mostrar "quién consumió este lote", usen estas 3 columnas directamente, **no** hagan un lookup al usuario por `usuario_consumido_id` (ese id es solo referencia, puede no reflejar el nombre actual).

### Qué se limpia al rehabilitar

`rehabilitar` pone los 7 campos de vuelta a su default (`estado: "habilitado"`, y los otros 6 a `null`). **No queda ningún rastro en el lote de que existió un ciclo consumido→rehabilitado** — si necesitan ese historial, está en `audit_logs` (acciones `lote_consumido` y `lote_rehabilitado`), no en el lote.

---

## 4. `POST /lotes/:id/consumir`

| Campo | Valor |
|---|---|
| Método | `POST` |
| Path | `/lotes/:id/consumir` |
| Auth | JWT Bearer + header `x-tenant-id` (igual que el resto del módulo) |
| Roles | `operario`, `supervisor`, `admin_global` |

### Body (opcional)

```ts
type ConsumirLoteDto = {
  observaciones_consumo?: string; // máx 2000 caracteres
};
```

```http
POST /lotes/622a5b3f-e9d6-4401-a00a-0ff987899458/consumir
Content-Type: application/json

{ "observaciones_consumo": "Se terminó el stock físico, quedaron 0 bandejas disponibles" }
```

También es válido `{}` o sin body — en ese caso `observaciones_consumo` queda `null`.

⚠️ **Whitelist estricta**: cualquier campo que no sea `observaciones_consumo` (por ejemplo, intentar mandar `estado` directamente) produce **400**.

### Qué hace

Marca el lote como `consumido`, registra `fecha_consumido` (instante del servidor), `usuario_consumido_id` + los 3 snapshots del usuario que hizo la llamada, y guarda la nota si vino. **Es atómico**: si dos requests llegan casi al mismo tiempo sobre el mismo lote `habilitado`, solo una tiene éxito (200); la otra recibe 409 sin modificar nada.

Un lote consumido:
- **Deja de aparecer** en `GET /lotes?disponible=true` y en la validación de `POST /siembras`.
- **Sigue apareciendo** en `GET /lotes` sin filtros y en `GET /lotes/:id` — no desaparece del sistema, solo se marca como no disponible para operaciones nuevas.
- **No afecta** siembras/bandejas ya creadas con ese lote — el historial queda intacto.

### Respuesta exitosa — `200 OK`

Ejemplo real verificado en dev:

```json
{
  "ok": true,
  "data": {
    "id": "622a5b3f-e9d6-4401-a00a-0ff987899458",
    "tipo": "sustrato",
    "numero_lote": "SUS-2026-014",
    "activo": true,
    "estado": "consumido",
    "fecha_consumido": "2026-07-30T14:20:11.000Z",
    "usuario_consumido_id": "a1b2c3d4-...",
    "usuario_consumido_email_snapshot": "admin@agrisano.com",
    "usuario_consumido_nombre_snapshot": "Admin",
    "usuario_consumido_apellido_snapshot": "Agrisano",
    "observaciones_consumo": "prueba",
    "establecimiento_id": null,
    "proveedor_id": null,
    "marca_id": null,
    "observaciones": null,
    "producto_id": null,
    "variedad_id": null,
    "batch": null,
    "proveedor_semilla_id": null
  }
}
```

La respuesta es el **lote completo**, mismo shape que `GET /lotes/:id`.

### Errores

| Status | `error.code` | Cuándo | `error.message` |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Body con campo fuera del DTO (ej. `estado`) | `"property estado should not exist"` |
| 401 | `AUTH_INVALID` | Token ausente/expirado/inválido | — |
| 403 | `AUTH_FORBIDDEN` | Rol sin permiso (no debería pasar acá — `operario` ya está incluido) | — |
| 404 | `NOT_FOUND` | Id inexistente o de otro tenant | `"Resource not found"` |
| 409 | `LOTE_YA_CONSUMIDO` | El lote **ya estaba** `consumido` (incluye la carrera de doble clic) | `"El lote ya está consumido"` |

Ejemplo de 409 (formato estándar del proyecto):

```json
{
  "ok": false,
  "requestId": "09569cab-d8fa-4bcd-97d3-5d97b56be66b",
  "statusCode": 409,
  "error": { "code": "LOTE_YA_CONSUMIDO", "message": "El lote ya está consumido" },
  "timestamp": "2026-07-30T14:22:03.000Z",
  "path": "/lotes/622a5b3f-e9d6-4401-a00a-0ff987899458/consumir"
}
```

> ⚠️ Nota sobre el 404: es el código **genérico** `NOT_FOUND` (`"Resource not found"`), el mismo que usa `GET /lotes/:id` y cualquier otro recurso del proyecto — **no** existe un código específico `LOTE_NOT_FOUND` en runtime (aunque esté reservado en el enum de errores, no se usa). No hace falta un manejo especial distinto al que ya tengan para 404 de lotes.

### Recomendación de UX

- Botón "Marcar como consumido" con un campo de texto **opcional** para el motivo, visible para cualquier rol operativo (incluye `operario`).
- Ante un 409 `LOTE_YA_CONSUMIDO`, **refrescar el lote** en vez de reintentar (probablemente otro usuario ya lo marcó).
- El lote consumido **sigue en el listado general** — si quieren una vista de "lotes disponibles para siembra" que lo oculte, usen `?disponible=true` o `?estado=habilitado` explícitamente (ver sección 6).

---

## 5. `POST /lotes/:id/rehabilitar`

| Campo | Valor |
|---|---|
| Método | `POST` |
| Path | `/lotes/:id/rehabilitar` |
| Auth | JWT Bearer + header `x-tenant-id` |
| Roles | **solo** `supervisor`, `admin_global` — **`operario` NO puede** (decisión explícita del negocio) |
| Body | Ninguno |

```http
POST /lotes/622a5b3f-e9d6-4401-a00a-0ff987899458/rehabilitar
```

### Qué hace

Revierte un lote `consumido` a `habilitado` y **limpia** toda la metadata de consumo (`fecha_consumido`, `usuario_consumido_id` y sus 3 snapshots, `observaciones_consumo` → todos a `null`). Atómico igual que `consumir`: si el lote ya no está `consumido` al momento del UPDATE (otro supervisor ya lo rehabilitó, o nunca estuvo consumido), responde 409 sin tocar nada.

### Respuesta exitosa — `200 OK`

```json
{
  "ok": true,
  "data": {
    "id": "622a5b3f-e9d6-4401-a00a-0ff987899458",
    "tipo": "sustrato",
    "numero_lote": "SUS-2026-014",
    "activo": true,
    "estado": "habilitado",
    "fecha_consumido": null,
    "usuario_consumido_id": null,
    "usuario_consumido_email_snapshot": null,
    "usuario_consumido_nombre_snapshot": null,
    "usuario_consumido_apellido_snapshot": null,
    "observaciones_consumo": null,
    "...": "resto de columnas del lote sin cambios"
  }
}
```

### Errores

| Status | `error.code` | Cuándo | `error.message` |
|---|---|---|---|
| 401 | `AUTH_INVALID` | Token ausente/expirado/inválido | — |
| 403 | `AUTH_FORBIDDEN` | Rol `operario` (o cualquier rol fuera de supervisor/admin_global) | — |
| 404 | `NOT_FOUND` | Id inexistente o de otro tenant | `"Resource not found"` |
| 409 | `LOTE_NO_CONSUMIDO` | El lote **ya estaba** `habilitado` (incluye la carrera de doble clic) | `"El lote no está consumido"` |

### Recomendación de UX

- Este botón/acción **solo debe mostrarse a `supervisor`/`admin_global`** — ocúltenlo para `operario` en vez de dejar que reciba el 403 (mejor UX, evita un round-trip inútil).
- Tras rehabilitar, el lote vuelve a aparecer inmediatamente en cualquier listado filtrado por `disponible=true` o por `estado=habilitado`.
- **No hay forma de recuperar** la nota (`observaciones_consumo`) ni la fecha del consumo anterior desde la respuesta de este endpoint una vez rehabilitado — si necesitan ese dato después, tendría que salir de auditoría (fuera del alcance de este frontend por ahora), no del lote.

---

## 6. `GET /lotes` — filtros nuevos

Dos query params opcionales, no rompen el comportamiento sin params:

| Query param | Tipo | Efecto |
|---|---|---|
| `estado` | `"habilitado"` \| `"consumido"` | Filtra por el valor exacto de `estado`. |
| `disponible` | `true` \| `false` | Atajo combinado: `true` equivale a `estado=habilitado AND activo=true`. Pensado para que el frontend no reimplemente la regla de "disponible para usar en una siembra". |

Ambos se combinan libremente con los filtros ya existentes (`tipo`, `activo`, `q`, `sortBy`, `sortOrder`, paginación).

### Ejemplos

```http
GET /lotes?estado=consumido
```
→ todos los lotes marcados como consumidos, sin importar `activo`.

```http
GET /lotes?disponible=true
```
→ solo lotes `habilitado` **y** `activo:true`. Esta es la vista que probablemente quieran usar en el selector de lotes al crear una siembra.

```http
GET /lotes?disponible=true&tipo=semilla
```
→ combinable con los filtros existentes.

**Importante**: `disponible=true` es la única forma de replicar exactamente la regla que usa `POST /siembras` para decidir si un lote es utilizable. Si arman su propio filtro combinando `estado=habilitado` + `activo=true` manualmente en el cliente, funciona igual, pero usar `disponible=true` es más simple y a prueba de cambios futuros en esa regla.

---

## 7. `POST /siembras` — nuevos rechazos por disponibilidad de lote

El body y la respuesta exitosa de `POST /siembras` **no cambian**. Lo nuevo son dos causas de rechazo **422** que antes no existían, evaluadas para **cada** `lote_semilla_id` y `lote_sustrato_id` de **cada** bandeja del body, antes de abrir la transacción (si falla, no se crea nada, ni siquiera parcialmente).

| Status | `error.code` | Cuándo | Ejemplo de `error.message` |
|---|---|---|---|
| 422 | `LOTE_CONSUMIDO` | El lote de semilla o de sustrato referenciado tiene `estado: "consumido"` | `"lote_semilla_id '14e715e1-...' está consumido y no puede usarse en una siembra"` |
| 422 | `LOTE_INACTIVO` | El lote referenciado tiene `activo: false` (independiente de si está consumido) | `"lote_semilla_id '14e715e1-...' está dado de baja y no puede usarse en una siembra"` |

El mensaje **siempre identifica cuál de los dos** (`lote_semilla_id` o `lote_sustrato_id`) fue el que falló, y con qué valor — así que se puede mostrar el mensaje del backend directamente, o parsear el id para resaltar la bandeja/fila correspondiente en el formulario.

**Orden de validación**: `LOTE_CONSUMIDO` se chequea antes que `LOTE_INACTIVO` para un mismo lote — si un lote está consumido **y** inactivo a la vez, la respuesta es `LOTE_CONSUMIDO`. Esto ya estaba cubierto por tests unitarios (`siembra.service.spec.ts`), no debería importarles el orden para la UI, pero por completitud: si ambos son verdad, ganan el `CONSUMIDO`.

### Antes de esta feature

Antes, `createSiembra` **solo** validaba que el lote perteneciera al establecimiento correcto (`LOTE_ESTABLECIMIENTO_MISMATCH`) — no chequeaba `activo` para nada. Esto significa que **`LOTE_INACTIVO` puede aparecer ahora en flujos que antes no fallaban** (un lote dado de baja hace tiempo, que antes se podía seguir usando en siembras por error). Si tienen un flujo de creación de siembras que hoy no maneja 422 más allá del mismatch de establecimiento, agreguen el manejo de estos dos códigos nuevos.

### Recomendación de UX

- En el selector de lote al armar una siembra, **filtren la lista con `GET /lotes?disponible=true`** (sección 6) para que en la práctica el usuario nunca llegue a ver estos 422 — son un backstop del servidor, no el mecanismo principal de UX.
- Si igual llega un 422 (por ejemplo, el lote se consumió entre que se cargó el selector y que se envió el form), mostrar el mensaje del backend y refrescar la lista de lotes disponibles.

---

## 8. `PATCH /lotes/:id` — `estado` sigue sin ser editable directamente

Sin cambios de comportamiento real, pero ahora es más visible: `estado` **no** está en `UpdateLoteDto`, así que si el frontend manda `{ "estado": "consumido" }` (por error, o copiando el body de otro endpoint), el backend responde:

```json
{
  "ok": false,
  "statusCode": 400,
  "error": { "code": "BAD_REQUEST", "message": "property estado should not exist" }
}
```

**La única forma de cambiar `estado` es vía `POST /lotes/:id/consumir` y `POST /lotes/:id/rehabilitar`.** No lo incluyan en el body de edición normal de un lote.

---

## 9. Auditoría (informativo, no requiere cambios de frontend)

Cada llamada exitosa a `consumir`/`rehabilitar` escribe una entrada de auditoría (`audit_logs`, visible solo por canales administrativos que ya existan para auditoría, no por un endpoint nuevo de este feature):

```json
{
  "action": "lote_consumido",           // o "lote_rehabilitado"
  "entity": "lote",
  "actorUserId": "...",
  "actorEmail": "...",
  "extra": { "loteId": "622a5b3f-...", "observaciones_consumo": "prueba" }
}
```

Mencionado por si el frontend tiene alguna pantalla de "historial de auditoría" genérica que ya lista estas acciones — no requiere ningún endpoint nuevo, es el mismo mecanismo que ya usan `create`/`update`/`delete` de lotes.

---

## 10. Ejemplos de llamada (TS)

```ts
async function consumirLote(loteId: string, observaciones?: string) {
  const res = await apiFetch(`/lotes/${loteId}/consumir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(observaciones ? { observaciones_consumo: observaciones } : {}),
  });

  if (!res.ok) {
    const err = await res.json();
    switch (err.error?.code) {
      case "LOTE_YA_CONSUMIDO":
        throw new Error("Este lote ya fue marcado como consumido por otro usuario.");
      case "NOT_FOUND":
        throw new Error("El lote no existe o fue eliminado.");
      default:
        throw new Error(err.error?.message ?? "Error al consumir el lote");
    }
  }

  return (await res.json()).data; // status 200
}

async function rehabilitarLote(loteId: string) {
  const res = await apiFetch(`/lotes/${loteId}/rehabilitar`, { method: "POST" });

  if (!res.ok) {
    const err = await res.json();
    switch (err.error?.code) {
      case "LOTE_NO_CONSUMIDO":
        throw new Error("Este lote ya estaba habilitado.");
      case "AUTH_FORBIDDEN":
        throw new Error("No tenés permisos para rehabilitar lotes.");
      default:
        throw new Error(err.error?.message ?? "Error al rehabilitar el lote");
    }
  }

  return (await res.json()).data; // status 200
}

// Selector de lotes disponibles para una siembra
async function fetchLotesDisponibles(tipo: "semilla" | "sustrato") {
  const res = await apiFetch(`/lotes?disponible=true&tipo=${tipo}`);
  return (await res.json()).data; // page envelope estándar
}

// Manejo de los 2 nuevos 422 al crear siembra
async function crearSiembra(dto: unknown) {
  const res = await apiFetch(`/siembras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  });

  if (!res.ok) {
    const err = await res.json();
    if (err.error?.code === "LOTE_CONSUMIDO" || err.error?.code === "LOTE_INACTIVO") {
      // err.error.message ya identifica lote_semilla_id o lote_sustrato_id y el valor
      throw new Error(err.error.message);
    }
    throw new Error(err.error?.message ?? "Error al crear la siembra");
  }

  return (await res.json()).data;
}
```

---

## 11. Lo que NO cambió (y conviene tener presente)

- **Roles de lectura/creación/edición/borrado de lotes**: sin cambios (`GET` cualquier rol autenticado, `POST`/`PATCH` supervisor+admin, `DELETE` solo admin_global).
- **`GET /lotes` y `GET /lotes/:id` sin query params nuevos**: comportamiento y cantidad de resultados idénticos a antes del deploy — verificado en dev.
- **`activo` sigue funcionando exactamente igual** — `PATCH /lotes/:id` con `{"activo": false}` no toca `estado` para nada. Los dos ejes son independientes.
- **Nada se borra ni desaparece**: consumir un lote no lo oculta de `GET /lotes` sin filtros, ni afecta siembras/bandejas históricas que ya lo referencian.
- **`disponible=true` y `estado=habilitado` combinado con `activo=true`** dan exactamente el mismo resultado — `disponible` es solo un atajo.
- **No hay ventana de tiempo ni límite** para rehabilitar un lote consumido — puede pasar cualquier cantidad de tiempo entre consumir y rehabilitar.
- **No hay endpoint para listar el historial de ciclos consumido→rehabilitado de un lote** — eso vive únicamente en auditoría, no en un endpoint de este módulo.

---

## 12. Checklist de implementación

- [ ] Agregar botón "Marcar como consumido" (rol `operario`+) con campo de texto opcional para `observaciones_consumo` (máx 2000 caracteres).
- [ ] Agregar botón "Rehabilitar" **visible solo para `supervisor`/`admin_global`** (no simplemente deshabilitado — ocultarlo para `operario`).
- [ ] Manejar 409 `LOTE_YA_CONSUMIDO` / `LOTE_NO_CONSUMIDO` refrescando el lote en vez de reintentar.
- [ ] Usar `GET /lotes?disponible=true` para poblar el selector de lotes al crear una siembra (en vez de traer todos y filtrar en cliente).
- [ ] Agregar un filtro/toggle de `estado` (`habilitado`/`consumido`) en la vista de listado de lotes, si quieren mostrar ambos con distinción visual (ej. badge "Consumido").
- [ ] Manejar los 2 códigos nuevos de `POST /siembras`: `LOTE_CONSUMIDO` y `LOTE_INACTIVO` (422) — mostrar `error.message` tal cual, ya identifica cuál lote y por qué.
- [ ] Mostrar `usuario_consumido_*` (los 3 snapshots) y `fecha_consumido`/`observaciones_consumo` en el detalle de un lote consumido — **no** hacer un lookup de usuario por `usuario_consumido_id`.
- [ ] No agregar `estado` al form de edición general de un lote (`PATCH /lotes/:id`) — seguiría rechazando con 400.
- [ ] Nada que hacer en pantallas de lectura que no muestren el detalle completo del lote (siguen funcionando igual).

---

## 13. Verificación hecha en dev (2026-07-30)

Todo lo de este documento fue probado contra Railway con `admin@agrisano.com` (14 de 15 pasos del quickstart; el único omitido fue el 403 aislado de `rehabilitar` con un token `operario` real, por falta de esa credencial en dev — el enforcement usa el mismo `RolesGuard`/`@Roles(...)` que el resto de endpoints protegidos del proyecto, no específico de esta feature):

- Migración aplicada sin romper nada existente: `GET /lotes` devuelve la misma cantidad de items, cada uno con `estado: "habilitado"` por defecto.
- `POST /lotes/:id/consumir` con nota → **200**, `estado: "consumido"`, `fecha_consumido` seteada, nota guardada.
- `POST /lotes/:id/rehabilitar` (rol calificado) → **200**, `estado: "habilitado"`, los 5 campos de metadata vueltos a `null`.
- Doble `consumir` → segunda llamada **409** `LOTE_YA_CONSUMIDO`, el primer registro no cambia.
- Doble `rehabilitar` sobre uno ya habilitado → **409** `LOTE_NO_CONSUMIDO`.
- `disponible=true` excluye el lote recién consumido; `GET /lotes` sin filtros lo sigue mostrando.
- Lote rehabilitado + `PATCH activo:false` (estado sigue `habilitado`) → tampoco aparece en `disponible=true` (confirma que los dos ejes se evalúan juntos solo ahí).
- `estado=consumido` devuelve únicamente lotes en ese estado.
- `POST /siembras` con lote de semilla consumido → **422** `LOTE_CONSUMIDO`, mensaje identifica `lote_semilla_id`.
- `POST /siembras` con lote de sustrato consumido → **422** `LOTE_CONSUMIDO`, mensaje identifica `lote_sustrato_id`.
- `POST /siembras` con lote `activo:false` (sin consumir) → **422** `LOTE_INACTIVO`.
- `GET /bandejas?lote_semilla_id=...` antes y después de consumir/rehabilitar el lote → resultados idénticos (comparado byte a byte) — el historial no se toca.
- `PATCH /lotes/:id` con `{"estado": "consumido"}` → **400** `BAD_REQUEST` ("property estado should not exist").

Evidencia completa, con los IDs de lotes usados: `specs/019-lote-estado-consumido/tasks.md`, sección "Evidencia T019".
