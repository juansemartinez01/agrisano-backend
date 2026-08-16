# Handoff frontend — fecha de entrada a nursery retroactiva

**Estado**: desplegado en el entorno de desarrollo (Railway) y verificado de punta a punta el 2026-07-29.
**Tipo de cambio**: ✅ **aditivo y NO breaking**. El frontend actual sigue funcionando sin tocar una línea. Lo de acá abajo es capacidad nueva, opcional.
**Referencia técnica**: `specs/018-fecha-entrada-nursery-retroactiva/contracts/ingresar-nursery.md` y la sección 10.6 de `docs/siembra-frontend.md`.

---

## 1. Qué cambió, en una frase

`POST /siembras/:id/ingresar-nursery` ahora acepta un **body opcional** con un campo `fecha_entrada` en formato `"YYYY-MM-DD"`, para registrar que las bandejas entraron a nursery **hace unos días** y no en el momento de la llamada.

Si no mandan body — o mandan `{}` — el comportamiento es **exactamente el de siempre**: se guarda el instante de la llamada.

### Por qué

En campo, el movimiento de cooling a nursery se hace y se registra después, a veces varios días más tarde. Hasta ahora la fecha quedaba con el momento de la carga, no con el momento real del movimiento, y no había forma de corregirlo.

---

## 2. Endpoints afectados

| Endpoint | Impacto |
|---|---|
| `POST /siembras/:id/ingresar-nursery` | **Único endpoint con cambios.** Acepta body opcional. La respuesta no cambió de shape. |
| `GET /siembras` | Sin cambios. |
| `GET /siembras/:id` | Sin cambios. `bandejas[].fecha_entrada_nursery` ahora puede traer una fecha pasada, pero el campo, el tipo y el formato son los mismos de siempre. |
| `GET /bandejas` | Sin cambios. `sortBy=fecha_entrada_nursery` sigue funcionando y ordena bien mezclando fechas retroactivas y automáticas. |
| `POST /trasplante` | **Sin cambios.** El trasplante sigue registrando `fecha_trasplante` con el instante real y **no** acepta fecha informada (si le mandan `fecha_trasplante` responde 400). Queda fuera de alcance. |

**No hay que tocar ninguna pantalla de lectura.** Ningún campo se agregó, renombró ni eliminó en ninguna respuesta.

---

## 3. `POST /siembras/:id/ingresar-nursery` — el contrato nuevo

Ruta directa sobre el host base (sin prefijo `/api`). Requiere JWT + header `x-tenant-id`. Roles: `operario`, `supervisor`, `admin_global` — **sin cambios**.

### Body

```ts
type IngresarNurseryDto = {
  fecha_entrada?: string; // "YYYY-MM-DD" — día calendario, sin hora
};
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fecha_entrada` | string `YYYY-MM-DD` | **No** | Día real en que las bandejas entraron a nursery. Si se omite, se usa el momento de la llamada. |

Las tres formas de request son válidas y equivalentes en cuanto a permisos y respuesta:

```http
POST /siembras/3834c52d-f8e8-4145-bb84-e20db436cb2d/ingresar-nursery
```

```http
POST /siembras/3834c52d-f8e8-4145-bb84-e20db436cb2d/ingresar-nursery
Content-Type: application/json

{}
```

```http
POST /siembras/3834c52d-f8e8-4145-bb84-e20db436cb2d/ingresar-nursery
Content-Type: application/json

{ "fecha_entrada": "2026-07-20" }
```

### ⚠️ El body se valida con whitelist estricta

Cualquier campo que no sea `fecha_entrada` produce **400**. Si mandan `{ "fecha": "..." }` o `{ "fecha_entrada_nursery": "..." }` por error, el request falla. El nombre exacto es **`fecha_entrada`**.

---

## 4. Qué queda guardado en `fecha_entrada_nursery`

Esta es la parte importante de entender, porque el valor persistido **no siempre es el mediodía**:

| Caso | Valor persistido | Ejemplo real (verificado en dev) |
|---|---|---|
| Sin `fecha_entrada` | Instante real de la llamada | `2026-07-29T14:44:45.950Z` |
| `fecha_entrada` = **hoy** | Instante real de la llamada | `2026-07-29T14:44:46.878Z` |
| `fecha_entrada` **anterior a hoy** | `<fecha_entrada>T12:00:00.000Z` | `2026-07-20T12:00:00.000Z` |

### Por qué el mediodía UTC

El proyecto no tiene ninguna noción de zona horaria (no hay campo `timezone` en establecimientos ni configuración de TZ). Anclar el día calendario a las **12:00 UTC** hace que se lea como el mismo día en cualquier huso entre UTC-11 y UTC+11 — toda América incluida. Si se guardara a las 00:00 UTC, en Argentina (UTC-3) se vería como el día anterior.

### Por qué "hoy" es la excepción

Si registran a las 09:00 UTC con la fecha de hoy y se anclara al mediodía, quedaría un timestamp **en el futuro**. Por eso, cuando la fecha informada es la de hoy, se usa el instante real. Es la razón por la que **conviene omitir el campo** en vez de mandar la fecha de hoy: el resultado es idéntico y el request es más simple.

### Cómo mostrarlo

El valor que reciben ya representa el día correcto. **No lo reinterpreten**: para mostrar el día alcanza con formatear el timestamp recibido con el locale del usuario.

---

## 5. 🚨 La trampa: no usen `toISOString()` para derivar el día

Este es el error más fácil de cometer y el que invalida toda la feature.

```ts
// ❌ MAL — en husos negativos devuelve el día ANTERIOR
const fecha = fechaElegida.toISOString().split("T")[0];
// En Argentina (UTC-3), un Date del 20/07 a las 21:00 local
// da "2026-07-21"... y peor: a las 00:30 del 20/07 da "2026-07-19".

// ✅ BIEN — usa los getters locales
function aFechaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
```

Si usan un date picker que ya les entrega el string `YYYY-MM-DD` (como `<input type="date">`), úsenlo tal cual: ese valor ya es el día local correcto y no necesita conversión.

---

## 6. Validaciones

El backend valida, en este orden:

1. **Formato**: exactamente `YYYY-MM-DD`. Un timestamp completo (`"2026-07-20T10:00:00Z"`), un formato con barras (`"20/07/2026"`), uno sin ceros a la izquierda (`"2026-7-1"`) o un número → **400**.
2. **Campo desconocido en el body** → **400**.
3. **Existencia de la siembra** (dentro del tenant) → **404** si no existe.
4. **Que la fecha exista en el calendario**: `"2026-02-31"` o `"2026-13-01"` → **422**. (JavaScript hace roll-over silencioso: `2026-02-31` se convertiría en el 3 de marzo. El backend lo detecta y lo rechaza.)
5. **Que no sea posterior a hoy** → **422**.
6. **Que no sea anterior a `siembra.fecha`** → **422**. Igual a la fecha de siembra **sí** es válido.

**Ninguna validación abre transacción.** Si el request es rechazado, no se modifica una sola bandeja — verificado: tras cinco rechazos seguidos, la siembra seguía intacta con sus bandejas en `cooling_period` y `fecha_entrada_nursery: null`.

**No hay ventana máxima de retroactividad**: cualquier fecha pasada dentro de `[siembra.fecha, hoy]` se acepta, sean 3 días o 8 meses.

### Regla para el date picker

```
mínimo = siembra.fecha   (la que ya viene en GET /siembras/:id)
máximo = hoy (día local del usuario)
```

Limitando el selector a ese rango, el 422 no debería aparecer nunca en uso normal. Igual conviene manejarlo: el "hoy" del cliente y el del servidor (UTC) pueden diferir unas horas cerca de medianoche.

---

## 7. Respuesta exitosa: `201`

> ⚠️ **Ojo con el status**: el endpoint responde **`201`**, no `200`. Es un `POST` sin `@HttpCode`, así que Nest usa el default. **Este era ya el comportamiento antes de este cambio** — no lo introdujo esta feature — pero la documentación anterior decía `200` por error. Si su cliente valida `status === 200`, corríjanlo a `201` o, mejor, a `response.ok`.

El body de la respuesta es la **siembra completa con sus bandejas**, mismo shape que `GET /siembras/:id`:

```ts
{
  ok: true,
  data: {
    id: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    establecimiento_id: string;
    fecha: string;                      // "YYYY-MM-DD" — fecha de la siembra
    observaciones: string | null;
    usuario_id: string;
    usuario_email_snapshot: string | null;
    usuario_nombre_snapshot: string | null;
    usuario_apellido_snapshot: string | null;
    usuario: { /* ... */ } | null;
    bandejas: Array<{
      id: string;
      created_at: string;
      updated_at: string;
      siembra_id: string;
      lote_semilla_id: string;
      lote_sustrato_id: string;
      estado: "cooling_period" | "en_nursery" | "trasplantada";
      fecha_entrada_nursery: string | null;   // ← ISO. Acá ven el valor persistido
      fecha_trasplante: string | null;
      mesa_id: string | null;
      codigo: string;
      establecimiento_id: string;
      carencia_hasta: string | null;
      lote_semilla: { /* ... */ };
      lote_sustrato: { /* ... */ };
    }>;
  }
}
```

Ejemplo real de dev, siembra con 3 bandejas y `fecha_entrada: "2026-07-20"`:

```json
{
  "ok": true,
  "data": {
    "id": "3834c52d-f8e8-4145-bb84-e20db436cb2d",
    "fecha": "2026-07-01",
    "bandejas": [
      { "id": "e648ab2c-...", "estado": "en_nursery", "fecha_entrada_nursery": "2026-07-20T12:00:00.000Z" },
      { "id": "e7e8b770-...", "estado": "en_nursery", "fecha_entrada_nursery": "2026-07-20T12:00:00.000Z" },
      { "id": "f3be909d-...", "estado": "en_nursery", "fecha_entrada_nursery": "2026-07-20T12:00:00.000Z" }
    ]
  }
}
```

**Todas las bandejas movidas en una misma llamada reciben exactamente el mismo valor.**

---

## 8. Errores

Todos usan el envelope estándar del proyecto:

```json
{
  "ok": false,
  "requestId": "09569cab-d8fa-4bcd-97d3-5d97b56be66b",
  "statusCode": 422,
  "error": {
    "code": "SIEMBRA_FECHA_ENTRADA_INVALIDA",
    "message": "La fecha de entrada no puede ser posterior a hoy (2026-07-29)"
  },
  "timestamp": "2026-07-29T14:46:07.916Z",
  "path": "/siembras/3c0ecc97-8690-47fb-87f3-54cd8953b716/ingresar-nursery"
}
```

| Caso | Status | `error.code` | `error.message` (textual del backend) |
|---|---|---|---|
| Formato de `fecha_entrada` inválido | **400** | `BAD_REQUEST` | `"fecha_entrada debe tener formato YYYY-MM-DD (solo día, sin hora)"` |
| Campo desconocido en el body | **400** | `BAD_REQUEST` | `"property <campo> should not exist"` |
| Fecha posterior a hoy | **422** | `SIEMBRA_FECHA_ENTRADA_INVALIDA` | `"La fecha de entrada no puede ser posterior a hoy (2026-07-29)"` |
| Fecha anterior a la siembra | **422** | `SIEMBRA_FECHA_ENTRADA_INVALIDA` | `"La fecha de entrada no puede ser anterior a la fecha de siembra (2026-07-15)"` |
| Fecha inexistente en el calendario | **422** | `SIEMBRA_FECHA_ENTRADA_INVALIDA` | `"La fecha de entrada 2026-02-31 no existe en el calendario"` |
| No hay bandejas en `cooling_period` | **422** | `SIEMBRA_SIN_BANDEJAS_EN_COOLING` | `"La siembra no tiene bandejas en cooling_period para ingresar a nursery"` |
| Siembra inexistente o de otro tenant | **404** | `SIEMBRA_NOT_FOUND` | `"Siembra no encontrada"` |
| Rol insuficiente | **403** | `AUTH_FORBIDDEN` | — |

Los **400** traen además `error.details.validationErrors[]` con el detalle por campo, igual que el resto del proyecto.

`SIEMBRA_FECHA_ENTRADA_INVALIDA` es un **código nuevo**: agréguenlo a su mapa de errores. Los tres mensajes son distintos entre sí a propósito, así que se pueden mostrar tal cual al usuario, o discriminar por contenido si prefieren mensajes propios.

---

## 9. Lo que NO cambió (y conviene tener presente)

- **El movimiento sigue siendo todo-o-nada por siembra.** Todas las bandejas en `cooling_period` de esa siembra pasan a `en_nursery` con la misma fecha. No hay selección por bandeja ni movimiento parcial.
- **Sigue siendo irreversible.** Una bandeja ya en `en_nursery` **no se puede re-fechar**: una segunda llamada responde `422 SIEMBRA_SIN_BANDEJAS_EN_COOLING` y las fechas anteriores quedan intactas. Verificado. → **Recomendación de UX**: si la fecha es retroactiva, mostrar un paso de confirmación con la fecha elegida bien visible antes de enviar. No hay "deshacer".
- **No hay forma de distinguir** si una fecha fue automática o informada a mano. No se agregó ninguna columna ni flag, y el shape de las respuestas es idéntico.
- **Los datos históricos no se tocaron.** Las bandejas movidas antes de este deploy conservan su timestamp original.
- **El trasplante no cambió.** Sigue con `now()` y sin fecha informada.
- **Los roles no cambiaron.**

---

## 10. Ejemplo de llamada

```ts
// Sin fecha (flujo actual, sigue funcionando igual)
await apiFetch(`/siembras/${siembraId}/ingresar-nursery`, { method: "POST" });

// Con fecha retroactiva
async function ingresarNursery(siembraId: string, fechaEntrada?: string) {
  const res = await apiFetch(`/siembras/${siembraId}/ingresar-nursery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Si es hoy o no la eligieron, no mandamos el campo: el resultado es el mismo
    body: fechaEntrada ? JSON.stringify({ fecha_entrada: fechaEntrada }) : undefined,
  });

  if (!res.ok) {
    const err = await res.json();
    switch (err.error?.code) {
      case "SIEMBRA_FECHA_ENTRADA_INVALIDA":
        // Fecha futura, anterior a la siembra, o inexistente.
        // El message del backend ya explica cuál de las tres es.
        throw new Error(err.error.message);
      case "SIEMBRA_SIN_BANDEJAS_EN_COOLING":
        throw new Error("Esta siembra ya fue ingresada a nursery.");
      default:
        throw new Error(err.error?.message ?? "Error al ingresar a nursery");
    }
  }

  return (await res.json()).data; // status 201
}
```

---

## 11. Checklist de implementación

- [ ] Agregar un selector de fecha **opcional** en el flujo de ingreso a nursery, limitado al rango `[siembra.fecha, hoy]`.
- [ ] Derivar el string `YYYY-MM-DD` con getters locales (`getFullYear`/`getMonth`/`getDate`) o tomarlo directo de un `<input type="date">`. **Nunca con `toISOString()`.**
- [ ] Si el usuario no elige fecha (o elige hoy), **omitir** el campo del body en lugar de mandar la fecha de hoy.
- [ ] Mandar el campo con el nombre exacto `fecha_entrada` — cualquier otro produce 400.
- [ ] Agregar `SIEMBRA_FECHA_ENTRADA_INVALIDA` al mapa de códigos de error.
- [ ] Verificar que el manejo del éxito acepte **`201`** (no validar `status === 200`).
- [ ] Agregar confirmación explícita antes de enviar una fecha retroactiva: el movimiento no se puede deshacer ni re-fechar.
- [ ] Nada que hacer en pantallas de lectura ni en el flujo de trasplante.

---

## 12. Verificación hecha en dev (2026-07-29)

Todo lo de este documento fue probado contra Railway con `admin@agrisano.com`:

- Sin body y con `{}` → instante real de la llamada (`…T14:44:45.950Z`), igual que siempre.
- `fecha_entrada` = hoy → instante real, **no** mediodía.
- Siembra del 2026-07-01 con `fecha_entrada: "2026-07-20"` → las 3 bandejas en exactamente `2026-07-20T12:00:00.000Z`, sin corrimiento de día.
- `fecha_entrada` igual a la fecha de la siembra → aceptado.
- Fecha de mañana, fecha anterior a la siembra, `2026-02-31` y `2026-13-01` → 422 en los cuatro, con mensajes distintos y sin tocar la base.
- `"20/07/2026"`, `"2026-7-1"`, `"2026-07-20T10:00:00Z"`, `123` y `{ "fecha": … }` → 400 en los cinco.
- Segunda llamada sobre una siembra ya ingresada → 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING`, fechas previas intactas.
- UUID inexistente → 404, con y sin `fecha_entrada`.
- `GET /siembras`, `GET /siembras/:id` y `GET /bandejas?sortBy=fecha_entrada_nursery` → shape y orden sin cambios.
- Trasplante → sigue guardando el instante real y rechaza con 400 si se le manda una fecha.

Evidencia completa, con los IDs de las siembras usadas: `specs/018-fecha-entrada-nursery-retroactiva/tasks.md`, sección "Verificación en entorno de desarrollo".
