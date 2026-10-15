# Handoff frontend — Revertir cosecha / trasplante de una mesa

**Fecha**: 2026-10-15 | **Alcance**: 3 endpoints nuevos bajo `/mesas/:mesa_id/…` | **Rol**: solo `admin_global`

---

## 1. TL;DR

Cuando se carga por error una **cosecha**, un **trasplante**, o las dos (lo más común), ahora el
admin puede **deshacer la última operación de una mesa** desde la app, sin pedirle a nadie que
toque la base de datos.

| Endpoint | Deshace |
|---|---|
| `POST /mesas/:mesa_id/revertir-trasplante` | El último trasplante. La mesa vuelve a estar como antes de él. |
| `POST /mesas/:mesa_id/revertir-cosecha` | La última cosecha. La mesa vuelve a su posición en el túnel. |
| `POST /mesas/:mesa_id/revertir-cosecha-y-trasplante` | Una cosecha **seguida de** un trasplante, en un solo paso. La mesa vuelve a su posición original. |

Tres cosas que tienen que quedar claras en la UI:

1. **Siempre se hace un "ver qué pasaría" antes** (`dry_run: true`) y recién después se confirma.
2. **Solo el `admin_global`** ve la acción. Cualquier otro rol recibe `403`.
3. **Solo se puede deshacer lo último.** Si después pasaron otras cosas, el backend rechaza con un
   `409` explicando qué; no es un error de la app, es la protección funcionando.

Es una funcionalidad **nueva y aditiva**: no cambia ningún endpoint existente.

---

## 2. Cuándo usar cada endpoint

El caso real que originó esto: una mesa se **cosechó** (salió del túnel, las de atrás subieron una
posición) y enseguida se **trasplantó** (volvió al final del túnel). Ambas eran un error y la mesa
tiene que volver a donde estaba.

| Situación de la mesa hoy | Qué ofrecer |
|---|---|
| `activa` con posición, y lo último que se hizo fue un **trasplante** | `revertir-trasplante` |
| `en_cosecha`, sin posición, y lo último fue una **cosecha** | `revertir-cosecha` |
| `activa` con posición, lo último fue un trasplante **y antes una cosecha** | `revertir-cosecha-y-trasplante` |

Atención a la diferencia entre `revertir-trasplante` y la combinada:

- `revertir-trasplante` deja a la mesa **como estaba antes del trasplante**. Si venía de cosecha,
  queda `en_cosecha` y **sin posición**; las bandejas vuelven a `en_nursery`.
- `revertir-cosecha-y-trasplante` hace lo anterior **y además** deshace la cosecha, así que la mesa
  termina `activa` en su **posición original**, y las demás mesas del túnel se reacomodan.

> No hace falta que el front decida con precisión: si se ofrece una opción que no aplica, el backend
> responde `409` con un mensaje que sugiere la correcta (por ejemplo, *"…usa revertir-cosecha-y-trasplante"*).
> Lo ideal es mostrar ese mensaje tal cual.

---

## 3. Contrato

### Request

```http
POST /mesas/{mesa_id}/revertir-cosecha-y-trasplante
Authorization: Bearer <token de admin_global>
x-tenant-id: <tenant>
Content-Type: application/json

{ "dry_run": true }
```

```http
POST /mesas/{mesa_id}/revertir-cosecha-y-trasplante
{ "motivo": "Se cargó la mesa equivocada" }
```

| Campo | Tipo | Regla |
|---|---|---|
| `dry_run` | `boolean`, opcional | `true` = simular. No cambia nada, no deja rastro. |
| `motivo` | `string`, 5–500 caracteres | **Obligatorio en la ejecución real**, no se pide en `dry_run`. Queda en la auditoría. |

No mandar otros campos: la validación global responde `400` ante campos desconocidos.

### Response `200`

Mismo formato en la simulación y en la ejecución real; cambian `dry_run` y `aplicado`.

```ts
type ReversionResult = {
  tipo: 'trasplante' | 'cosecha' | 'cosecha_y_trasplante';
  dry_run: boolean;
  aplicado: boolean; // false en simulación
  mesa: {
    id: string;
    nombre: string;
    antes: MesaSnap;
    despues: MesaSnap;
  };
  trasplante_revertido: null | {
    historial_id: string;
    fecha_hora: string;      // ISO
    tunel_id: string;
    bandeja_ids: string[];   // bandejas que vuelven a en_nursery
    estado_previo_origen: 'registrado' | 'inferido';
  };
  cosecha_revertida: null | {
    id: string;
    fecha_hora: string;      // ISO
    tunel_id: string;
    posicion_restaurada: number;
    peso_kg: string | null;  // numérico como texto
  };
  tuneles: Array<{
    id: string;
    nombre: string;
    mesas_con_posicion_antes: number;
    mesas_con_posicion_despues: number;
    mesas_desplazadas: number; // OTRAS mesas del túnel que cambian de posición
  }>;
};

type MesaSnap = {
  estado: 'activa' | 'en_cosecha' | string;
  tunel_id: string;
  posicion_actual: number | null;
  fecha_ultimo_trasplante: string | null;
};
```

La respuesta viene envuelta como el resto de la API: `{ ok: true, data: ReversionResult }`.
`trasplante_revertido` es `null` en `revertir-cosecha` y `cosecha_revertida` es `null` en
`revertir-trasplante`.

---

## 4. Flujo recomendado en la UI

```
[Botón "Deshacer…" en la ficha de la mesa — solo admin_global]
        │
        ▼
POST …/revertir-xxx  { dry_run: true }
        │
        ├─ 409 ─► mostrar error.message (y details si ayuda). Fin: no hay nada para confirmar.
        │
        └─ 200 ─► Pantalla de confirmación con el resumen (ver §5)
                       │
                       ├─ Cancelar ─► nada pasó (el dry_run no deja rastro)
                       │
                       └─ Confirmar (+ campo "Motivo" obligatorio)
                              │
                              ▼
                       POST …/revertir-xxx  { motivo }
                              │
                              ├─ 200 ─► refrescar mesa, túnel y bandejas; toast de éxito
                              └─ 409 ─► mostrar error.message (pudo cambiar algo entre la
                                        simulación y la confirmación)
```

Puntos importantes:

- **El `dry_run` no es un trámite, es la validación.** Corre exactamente la misma lógica que la
  ejecución real, con las mismas guardas, y después se deshace. Si el `dry_run` da `200`, la
  ejecución real va a dar `200` salvo que alguien toque el mismo túnel entre medio.
- **Entre la simulación y la confirmación puede pasar tiempo.** Tratar el `409` de la ejecución real
  igual que el de la simulación; no asumir que "si simuló bien, no falla".
- **Deshabilitar el botón de confirmar mientras la request está en vuelo** y no reintentar solo.
  Si la respuesta se pierde, consultar el estado de la mesa antes de volver a pedir: una segunda
  ejecución real daría `409` (ya no hay nada que deshacer), lo cual es seguro pero confunde.
- **No cachear nada de la simulación** para la ejecución: volver a pedir siempre.

---

## 5. Qué mostrarle al admin antes de confirmar

Con la respuesta del `dry_run` se puede armar un resumen sin pedir nada más:

- **Mesa**: `mesa.nombre`, de `mesa.antes` a `mesa.despues` (estado y posición).
- **Si `trasplante_revertido`**: "Se van a devolver **N bandejas** a nursery" (`bandeja_ids.length`)
  y "se elimina el trasplante del <fecha_hora>".
- **Si `cosecha_revertida`**: "Se elimina la cosecha del <fecha_hora>" (con `peso_kg` si viene) y
  "la mesa vuelve a la posición **<posicion_restaurada>**".
- **Por cada túnel de `tuneles`**: "<nombre>: **<mesas_desplazadas>** mesas cambian de posición".
  Es el dato más importante para que el admin entienda el impacto: una cosecha deshecha en la
  posición 1 de un túnel de 130 mesas mueve 129 mesas.
- Si `estado_previo_origen === 'inferido'`: nota discreta, *"Operación anterior al registro del
  estado previo; se dedujo a partir de la cosecha anterior."* (solo informativo).
- **Campo de motivo** (obligatorio, mínimo 5 caracteres, máximo 500) con contador. Es lo que queda
  en la auditoría de por qué se deshizo.
- Botón de confirmar con texto explícito (*"Deshacer cosecha y trasplante"*), no "Aceptar".

---

## 6. Errores

Formato estándar: `{ ok: false, error: { code, message, details? } }`. En todos los `409`
`error.message` ya viene en español y apto para mostrar al usuario; usar `code` para lógica y
`message` para el texto.

| HTTP | `code` | Significado | Qué hacer en la UI |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `mesa_id` no es UUID, `motivo` fuera de 5–500, campo desconocido. | Validar antes en el form; es un bug del front si llega. |
| 401 | — | Sin token o vencido. | Flujo normal de sesión. |
| 403 | — | El rol no es `admin_global`. | No mostrar la acción a otros roles. |
| 404 | `MESA_NOT_FOUND` | Mesa inexistente, eliminada o de otro tenant. | "La mesa ya no existe." |
| 409 | `REVERSION_NO_APLICA` | La mesa no está en un estado al que esta reversión aplique, o la cosecha ya tiene packing. | Mostrar `message`. Si sugiere otro endpoint, ofrecerlo. |
| 409 | `REVERSION_NO_ES_ULTIMA_OPERACION` | Después de la operación pasó algo más (otro evento de la mesa, otra mesa entró o se cosechó en el túnel). | Mostrar `message`; hay que deshacer primero lo posterior. `details` puede traer los eventos o cosechas posteriores. |
| 409 | `REVERSION_ESTADO_PREVIO_NO_RECUPERABLE` | No se puede saber (o ya no existe) dónde estaba la mesa antes del trasplante. | Mostrar `message`; no hay forma automática: derivar a soporte. |
| 409 | `REVERSION_DATOS_INCONSISTENTES` | Los datos ya no coinciden con lo que dejó la operación (por ejemplo, alguien modificó o descartó una bandeja, o ya existe una mesa con el mismo nombre en el túnel de origen). | Mostrar `message`; `details.problemas` (si viene) detalla qué bandejas. Derivar a soporte. |
| 409 | `REVERSION_TUNEL_OCUPADO` | Otra operación está usando el túnel en este momento. | "Reintentá en unos segundos." Es seguro reintentar. |

Garantía de todos los `409`: **no se modificó nada**. Es seguro mostrar el error y dejar que el
usuario siga; no hay estado a medio aplicar.

---

## 7. Qué cambia en el resto de la app después de una ejecución real

Refrescar, como mínimo, lo que dependa de la mesa y del túnel:

- La **mesa** (estado, posición, `fecha_ultimo_trasplante`).
- El **listado del túnel** y los **mapas de posición**: pueden cambiar las posiciones de muchas
  mesas (campo `mesas_desplazadas`).
- Las **bandejas** que volvieron a `en_nursery`, si la pantalla las lista (`bandeja_ids`).
- El **historial** de la mesa: el evento de trasplante y/o cosecha **desaparece** (se elimina, no
  se marca como anulado), igual que la cosecha en el listado de cosechas.
- **Trazabilidad**: lee las cosechas y las bandejas, así que el ciclo deshecho deja de figurar; conviene refrescar esa pantalla si está abierta.

La constancia de qué se deshizo, quién y por qué queda en la auditoría
(`action = reversion_trasplante | reversion_cosecha | reversion_cosecha_y_trasplante`,
`entity = mesa`), con las filas borradas completas.

---

## 8. Consideraciones

- **Permisos**: chequear `roles.includes('admin_global')` para mostrar la acción, pero el backend
  es la autoridad. Un `admin` común recibe `403`.
- **Multi-tenant**: como en el resto de la API, mandar `x-tenant-id`; el tenant del token tiene que
  coincidir. Una mesa de otro tenant es `404`.
- **No hay "rehacer".** Una vez aplicada, la operación original desaparece; para recuperarla hay
  que volver a cargarla. Por eso conviene el texto explícito y el motivo obligatorio.
- **Cosechas con packing**: si la cosecha ya tiene un lote de packing no se puede deshacer
  (`REVERSION_NO_APLICA`). El front no tiene que anticiparlo; basta con mostrar el mensaje.
- **Trasplantes entre túneles**: si la mesa se trasplantó a otro túnel, la reversión la devuelve al
  de origen. Por eso `tuneles` puede traer dos elementos.
- **Orden inverso**: si hay que deshacer varias operaciones de un mismo túnel, hacerlo de la más
  reciente a la más antigua; si no, el backend responde `REVERSION_NO_ES_ULTIMA_OPERACION`.
- **Trasplantes cargados antes de esta funcionalidad** (sin "estado previo" guardado) solo se pueden
  deshacer si la operación anterior fue una cosecha; si no, `REVERSION_ESTADO_PREVIO_NO_RECUPERABLE`.
  Los trasplantes nuevos siempre guardan su estado previo.
- **Nada de esto se testea con datos reales de producción**: probar el flujo en el tenant de pruebas
  (`...0002`) usando `dry_run` primero.

---

## 9. Checklist para el front

- [ ] Mostrar la acción "Deshacer…" solo a `admin_global`.
- [ ] Elegir el endpoint según la situación de la mesa (§2) y mostrar el `message` del `409` si no aplica.
- [ ] Siempre llamar primero con `{ dry_run: true }` y mostrar el resumen (§5) antes de confirmar.
- [ ] Pedir `motivo` (5–500 caracteres) solo en la confirmación.
- [ ] Deshabilitar el botón de confirmar mientras la request está en vuelo.
- [ ] Manejar los cinco `409` de §6; `REVERSION_TUNEL_OCUPADO` permite reintentar.
- [ ] Tras un `200` real, refrescar mesa, túnel, bandejas e historial.
