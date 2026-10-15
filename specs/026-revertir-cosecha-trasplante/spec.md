# Feature Specification: Reversión de cosecha y trasplante de una mesa

**Feature Branch**: `026-revertir-cosecha-trasplante`

**Created**: 2026-10-15

**Status**: Implemented (sin commitear al momento de escribir este spec)

**Input**: "No podemos crear un endpoint que haga exactamente esto? ¿O sí o sí debemos hacer un análisis previo de la base de datos para asegurarnos de no romper nada?"

## Contexto

Entre 2026-10-12 y 2026-10-15 se corrigieron a mano, con scripts SQL sobre producción (`scripts/sql/revertir-cosecha-trasplante-t5-*.sql`), cargas equivocadas de cosecha + trasplante en el Túnel 5. Cada vez hizo falta un análisis previo de la base, un backup, un ensayo con `ROLLBACK` y una orden explícita de `COMMIT`.

Esta feature mueve ese procedimiento al backend: un endpoint de administración que **deshace la última operación de una mesa** y que reemplaza el análisis manual por **guardas dentro de la transacción** que rechazan (409) cualquier caso donde deshacer rompería algo. Si una guarda falla, no se toca nada.

Las operaciones inversas son:

| Operación original | Efecto | Inversa |
|---|---|---|
| Trasplante (`POST /trasplante`) | Bandejas `en_nursery` → `trasplantada`, la mesa pasa al final del túnel destino con `fecha_ultimo_trasplante = now()` | `revertir-trasplante` |
| Cosecha (`POST /cosecha`) | Mesa → `en_cosecha`, sin posición; las mesas de atrás suben una posición | `revertir-cosecha` |
| Cosecha seguida de trasplante (el error más común) | Las dos anteriores | `revertir-cosecha-y-trasplante` |

## Endpoints

Los tres cuelgan de `mesas`, son `POST`, responden `200` y son **solo `admin_global`** (`@Roles` a nivel de clase, para que una ruta nueva no quede abierta por olvido). Cualquier otro rol → `403`; sin token → `401`.

- `POST /mesas/:mesa_id/revertir-trasplante`
- `POST /mesas/:mesa_id/revertir-cosecha`
- `POST /mesas/:mesa_id/revertir-cosecha-y-trasplante`

Body (`RevertirDto`, la validación global rechaza campos desconocidos con `400`):

| Campo | Tipo | Regla |
|---|---|---|
| `dry_run` | boolean, opcional | `true` simula: ejecuta todo y hace `ROLLBACK`. |
| `motivo` | string, 5–500 caracteres | Obligatorio salvo con `dry_run: true`. Queda en la auditoría. |

`mesa_id` debe ser un UUID (`ParseUUIDPipe` → `400`). Una mesa inexistente, dada de baja o de otro tenant responde `404 MESA_NOT_FOUND`.

### Respuesta

```json
{
  "ok": true,
  "data": {
    "tipo": "cosecha_y_trasplante",
    "dry_run": true,
    "aplicado": false,
    "mesa": {
      "id": "…", "nombre": "Table 67",
      "antes":   { "estado": "activa", "tunel_id": "…", "posicion_actual": 130, "fecha_ultimo_trasplante": "…" },
      "despues": { "estado": "activa", "tunel_id": "…", "posicion_actual": 1, "fecha_ultimo_trasplante": "…" }
    },
    "trasplante_revertido": {
      "historial_id": "…", "fecha_hora": "…", "tunel_id": "…",
      "bandeja_ids": ["…"], "estado_previo_origen": "registrado"
    },
    "cosecha_revertida": {
      "id": "…", "fecha_hora": "…", "tunel_id": "…",
      "posicion_restaurada": 1, "peso_kg": "12.500"
    },
    "tuneles": [
      { "id": "…", "nombre": "Tunnel 5", "mesas_con_posicion_antes": 130,
        "mesas_con_posicion_despues": 130, "mesas_desplazadas": 129 }
    ]
  }
}
```

- `trasplante_revertido` es `null` en `revertir-cosecha`; `cosecha_revertida` es `null` en `revertir-trasplante`.
- `estado_previo_origen`: `"registrado"` (el trasplante guardó el estado de la mesa antes de tocarla) o `"inferido"` (trasplante anterior a esta feature; ver *Trasplantes legacy*).
- `mesas_desplazadas`: cuántas **otras** mesas del túnel cambian de posición.
- `mesa.despues` en `revertir-trasplante` siempre trae `posicion_actual: null`: la mesa vuelve a *su estado anterior*, que no tenía posición (estaba `en_cosecha`, o `activa` sin haber sido posicionada). Con `revertir-cosecha-y-trasplante` el resultado final es la mesa **de vuelta en su posición original**.

## Modelo de operación

1. `BEGIN` con `SET LOCAL lock_timeout = '5s'` y `statement_timeout = '60s'`.
2. Se lee la mesa y se deducen los túneles involucrados a partir de sus **dos últimos eventos** de historial (túnel del trasplante, túnel previo registrado, túnel de la cosecha).
3. `SELECT … FOR UPDATE` sobre todas las mesas de esos túneles (ordenadas por `id`, para no generar deadlocks) y recién entonces se evalúan las guardas: **se validan contra un estado ya congelado**. Dos reversiones simultáneas sobre la misma mesa: gana una, la otra se rechaza.
4. Se aplican los pasos; cada `UPDATE`/`DELETE` verifica la cantidad de filas afectadas.
5. Verificación posterior: se recalcula en memoria cómo debían quedar las posiciones de cada túnel (`reversiones.rules.ts`, funciones puras) y se compara contra la base. Cualquier diferencia → rechazo y `ROLLBACK`.
6. La auditoría se escribe **dentro de la transacción** (`AuditService.writeInTransaction`, que no traga errores). Es el único registro de lo que se borró; si no se puede guardar, la reversión no se aplica.
7. `COMMIT` o, con `dry_run`, `ROLLBACK`. La fila de auditoría de un `dry_run` también se deshace: **una simulación no deja rastro**.

### Reversión del trasplante

Aplica a una mesa `activa` con posición. Guardas (todas → `409`):

| Guarda | Código |
|---|---|
| La mesa está `activa` y con posición | `REVERSION_NO_APLICA` |
| El último evento del historial es un `trasplante` | `REVERSION_NO_ES_ULTIMA_OPERACION` |
| El trasplante tiene `bandeja_ids` (no es una carga inicial) | `REVERSION_NO_APLICA` |
| El túnel de la mesa coincide con el del evento | `REVERSION_DATOS_INCONSISTENTES` |
| La mesa es la **última posición** de su túnel (nadie entró detrás) | `REVERSION_NO_ES_ULTIMA_OPERACION` |
| Todas las bandejas siguen `trasplantada`, en esta mesa, no eliminadas, con `fecha_entrada_nursery`, sin descartes y con exactamente un vínculo en `mesa_bandeja` | `REVERSION_DATOS_INCONSISTENTES` (con `details.problemas`) |
| Se puede resolver el estado previo de la mesa | `REVERSION_ESTADO_PREVIO_NO_RECUPERABLE` |
| El túnel previo todavía existe | `REVERSION_ESTADO_PREVIO_NO_RECUPERABLE` |

Efecto: bandejas → `en_nursery` (con `mesa_id` y `fecha_trasplante` en `NULL`), se borran los `mesa_bandeja` y el evento de historial, y la mesa vuelve a `estado_previo` (estado, túnel, `posicion_actual = NULL`, `fecha_ultimo_trasplante` exacta). Las cosechas de *otras* mesas posteriores al trasplante no molestan: desplazan posiciones pero la mesa sigue siendo la última.

### Reversión de la cosecha

Aplica a una mesa `en_cosecha` sin posición. Guardas (todas → `409`):

| Guarda | Código |
|---|---|
| La mesa está `en_cosecha` y sin posición | `REVERSION_NO_APLICA` (si ya fue trasplantada, el mensaje indica usar `revertir-cosecha-y-trasplante`) |
| El último evento del historial es una `cosecha` | `REVERSION_NO_ES_ULTIMA_OPERACION` |
| El evento referencia una cosecha existente, de esta mesa y de este túnel | `REVERSION_DATOS_INCONSISTENTES` |
| La cosecha **no tiene lote de packing** | `REVERSION_NO_APLICA` |
| No hubo cosechas posteriores de otras mesas del mismo túnel | `REVERSION_NO_ES_ULTIMA_OPERACION` (con `details.cosechas_posteriores`) |
| No hay mesas dadas de baja que conserven posición en el túnel | `REVERSION_DATOS_INCONSISTENTES` |
| `posicion_al_momento` es válida (1 … última + 1) | `REVERSION_DATOS_INCONSISTENTES` |

Efecto: las mesas con posición ≥ `posicion_al_momento` bajan una posición (en dos pasadas con offset negativo, porque `UQ_mesas_tunel_posicion` es único, parcial y no diferible), la mesa vuelve a `activa` en `posicion_al_momento`, y se borran el evento de historial y la cosecha. Los trasplantes de otras mesas posteriores a la cosecha no molestan: entran al final y no afectan el lugar de esta.

### Reversión combinada

`revertir-cosecha-y-trasplante` ejecuta primero la inversa del trasplante y después la de la cosecha **en la misma transacción**. Exige que el estado previo al trasplante sea `en_cosecha`; si no, `409 REVERSION_NO_APLICA` ("no hay cosecha que deshacer: usa revertir-trasplante"). La mesa puede haberse trasplantado a **otro túnel** que el de la cosecha: la inversa la devuelve al túnel original.

### Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `REVERSION_NO_APLICA` | 409 | La mesa no está en un estado al que este tipo de reversión aplique, o hay un impedimento de negocio (packing). |
| `REVERSION_NO_ES_ULTIMA_OPERACION` | 409 | Pasó algo después: otro evento en la mesa, otra mesa entró al túnel, otra mesa se cosechó. Deshacer en orden inverso. |
| `REVERSION_ESTADO_PREVIO_NO_RECUPERABLE` | 409 | No se sabe (o ya no existe) el lugar donde estaba la mesa antes del trasplante. |
| `REVERSION_DATOS_INCONSISTENTES` | 409 | Los datos ya no coinciden con lo que dejó la operación original (bandejas modificadas, filas faltantes, nombre repetido, verificación posterior fallida). |
| `REVERSION_TUNEL_OCUPADO` | 409 | Otra operación tiene bloqueado el túnel (`lock_timeout`/`statement_timeout`). Reintentar en unos segundos. |
| `MESA_NOT_FOUND` | 404 | Mesa inexistente, dada de baja o de otro tenant. |

Si el índice único `UQ_mesas_tunel_nombre` salta al devolver la mesa a su túnel de origen (mientras estuvo en otro, alguien creó en el origen una mesa con el mismo nombre), se traduce a `409 REVERSION_DATOS_INCONSISTENTES` en vez de un `500`.

## Estado previo del trasplante

Para que deshacer un trasplante no requiera adivinar dónde estaba la mesa, `TrasplanteService` ahora agrega al `detalle` del evento de historial una clave nueva:

```json
"estado_previo": {
  "estado": "en_cosecha",
  "tunel_id": "…",
  "posicion_actual": null,
  "fecha_ultimo_trasplante": "2026-08-30 21:07:53.493271+00"
}
```

`fecha_ultimo_trasplante` se guarda **como texto** (`::text` en SQL): `timestamptz` tiene microsegundos y un `Date` de JavaScript los pierde, y la reversión tiene que poder restaurar la fecha exacta. El resto del `detalle` (`tunel_id`, `posicion_actual`, `bandeja_ids`, `observaciones`) no cambió: es un cambio aditivo y no hay migración.

### Trasplantes legacy (sin `estado_previo`)

Para eventos anteriores a esta feature, el estado previo se **infiere solo si es inequívoco**: el evento inmediatamente anterior del historial debe ser una cosecha (→ el estado era `en_cosecha`, en el túnel de esa cosecha) y debe existir la fecha del ciclo anterior (máxima `bandejas.fecha_trasplante` de las bandejas que siguen vinculadas a la mesa). Cualquier otro caso → `409 REVERSION_ESTADO_PREVIO_NO_RECUPERABLE`; no se adivina. La respuesta lo informa con `estado_previo_origen: "inferido"`.

## Auditoría

Una fila en `audit_logs` (`kind = 'admin'`, `entity = 'mesa'`) por reversión aplicada, con `action`:

- `reversion_trasplante`
- `reversion_cosecha`
- `reversion_cosecha_y_trasplante`

`payload.extra` contiene `motivo`, `tipo`, el resultado completo, `tuneles`, `posiciones_antes` (mapa mesa→posición de cada túnel antes de tocar nada) y `evidencia`: las **filas completas** (`to_jsonb`) de lo borrado o modificado — historial, `mesa_bandeja`, bandejas, cosecha y estado de la mesa antes — suficiente para reconstruir la operación original.

El `extra` va anidado y duplicado a propósito: `redactPayload` (kind `admin`) solo conserva ese campo. Además se emite un log estructurado `reversion_aplicada` tras cada `COMMIT`.

## Limitaciones conocidas

- **Carrera preexistente en la cosecha.** `CosechaService` lee `posicion_actual` fuera de su transacción; si dos operaciones sobre el mismo túnel se pisan, `cosechas.posicion_al_momento` podría quedar desactualizada. La reversión confía en ese valor y solo valida que esté en rango. No se modificó la cosecha en esta feature.
- **`POST /trasplante` a un túnel con una mesa del mismo nombre** responde `500` por `UQ_mesas_tunel_nombre`. Es un defecto preexistente y ajeno a esta feature; la reversión sí lo traduce a `409`.
- **Solo la última operación.** No hay reversión selectiva en el medio de la historia de una mesa: hay que deshacer en orden inverso, y las guardas lo exigen.
- **Cosechas con packing** no se pueden deshacer; hay que resolver primero el lote de packing por su propia vía.

## Archivos

- `src/modules/reversiones/` — `reversiones.{controller,service,module,rules}.ts`, `dto/revertir.dto.ts` y sus specs (`reversiones.rules.spec.ts`, `reversiones.controller.spec.ts`).
- `src/modules/audit/audit.service.ts` — `writeInTransaction`.
- `src/modules/trasplante/trasplante.service.ts` — `estado_previo` en el `detalle`.
- `src/common/errors/error-codes.ts` — códigos `REVERSION_*`.
- `src/app.module.ts` — registro de `ReversionesModule`.
- `test/reversiones.e2e-spec.ts` — 21 casos contra la base local; `test/jest-e2e.json` suma `modulePaths` para resolver `src/...`.
- `docs/handoff-frontend-revertir-cosecha-trasplante.md` — guía para el frontend.

## Verificación

- Unitarios: 33 casos nuevos (reglas puras y matriz de roles); suite completa 180/180.
- e2e (solo corre si `DATABASE_URL` apunta a `localhost`/`127.0.0.1`/`[::1]`; si no, se omite): ida y vuelta exacta de la mesa, `dry_run` sin rastro, rechazos por orden (LIFO), packing, bandejas tocadas, túnel cruzado, colisión de nombres, legacy inferido/no inferible, concurrencia, roles y validación del body.
- `npm run build` y `tsc --noEmit` limpios.
