# Handoff frontend — guardas de estado en trasplante y aplicaciones químicas

**Estado**: implementado y verificado en la rama `023-fix-guardas-estado`. La carrera de trasplante se reprodujo por HTTP con dos requests concurrentes (ver sección 5).
**Tipo de cambio**: ⚠️ **corrección de bug con cambio de comportamiento observable**. No se agregó, renombró ni eliminó ningún campo. Lo que cambia es que dos operaciones que hoy "funcionan" en silencio pasan a devolver 422.
**Referencia técnica**: `specs/023-descarte-bandejas/plan.md`, sección "Prerrequisito: rama aparte con el fix de guardas de estado".

---

## 1. Qué cambió, en una frase

`POST /trasplante` y `POST /aplicaciones-quimicas` validaban el estado de la bandeja **fuera** de la transacción y después escribían sin volver a verificarlo. Ahora la verificación ocurre dentro de la transacción, sobre la fila bloqueada.

### Por qué

Entre la validación y la escritura hay una ventana en la que otro request puede cambiar el estado de la misma bandeja. Hoy eso permite que:

- **Dos trasplantes concurrentes de la misma bandeja** prosperen los dos. Quedan **dos eventos `trasplante`** en `historial_mesa` para un solo movimiento físico, y el registro en `mesa_bandeja` del primero queda pisado por el del segundo — se pierde quién y cuándo hizo el trasplante real.
- Una bandeja recién trasplantada reciba una aplicación química de contexto nursery.

No es teórico: alcanza con dos operarios cargando el mismo trasplante desde dos dispositivos, o un doble tap en el botón de confirmar.

---

## 2. Endpoints afectados

| Endpoint | Impacto |
|---|---|
| `POST /trasplante` | Si alguna bandeja dejó de estar en `en_nursery` entre la validación y la escritura, responde **422 `TRASPLANTE_BANDEJA_INVALIDA`**. Antes: escribía igual, dejando un segundo evento en `historial_mesa` y pisando el registro de `mesa_bandeja` del trasplante original. |
| `POST /aplicaciones-quimicas` (contexto `nursery`) | Si alguna bandeja dejó de estar en `en_nursery`, responde **422 `APLICACION_TARGET_INVALIDO`**. Antes: registraba la aplicación igual. |
| Todo el resto | Sin cambios. |

Ningún endpoint de lectura cambió. Ninguna respuesta cambió de shape.

---

## 3. El error nuevo

Los dos códigos de error **ya existían**; lo nuevo es que ahora se pueden recibir en un caso donde antes llegaba un 200/201.

Ambos vienen con los ids conflictivos en `details`, para que la pantalla pueda señalar cuál falló:

```jsonc
{
  "ok": false,
  "error": {
    "code": "TRASPLANTE_BANDEJA_INVALIDA",
    "message": "La bandeja 8f3c1e2a-… dejó de estar disponible para trasplante",
    "details": { "bandeja_ids": ["8f3c1e2a-0000-4000-8000-000000000001"] }
  }
}
```

```jsonc
{
  "ok": false,
  "error": {
    "code": "APLICACION_TARGET_INVALIDO",
    "message": "Las bandejas indicadas dejaron de estar en estado en_nursery",
    "details": { "bandeja_ids": ["8f3c1e2a-…", "8f3c1e2a-…"] }
  }
}
```

> El de aplicaciones químicas puede traer **varias** bandejas en `details.bandeja_ids`; el de trasplante trae siempre una (falla en la primera).

---

## 4. Qué hacer en el frontend

**Nada obligatorio.** Si ya manejan 422 de forma genérica, el mensaje del backend es suficiente.

Si quieren afinarlo:

1. **La operación fue atómica.** El 422 significa que **no se guardó nada**: ni el trasplante, ni la aplicación, ni el descuento de stock del lote químico. No hay estado a medias que limpiar.
2. **Refrescar la lista de bandejas** al recibir este error. El 422 casi siempre significa que la bandeja ya fue trasplantada por otra persona, así que la lista que tiene el usuario en pantalla está vieja.
3. **Señalar las bandejas conflictivas** usando `details.bandeja_ids`, en vez de mostrar un error global.

Un mensaje razonable: *"Alguna de las bandejas seleccionadas ya fue trasplantada o dada de baja. Actualizá la lista y volvé a intentar."*

---

## 5. Cómo verificarlo

| Caso | Antes | Ahora |
|---|---|---|
| Trasplantar la misma bandeja dos veces en simultáneo | 200 las dos veces, doble registro | 200 la primera, **422** la segunda |
| Aplicar un químico nursery a una bandeja ya trasplantada | 201 | **422** |
| Trasplante normal de bandejas en `en_nursery` | 200 | 200, sin cambios |
| Aplicación nursery normal | 201 | 201, sin cambios |

> `POST /trasplante` responde **200**, no 201 — el controller tiene `@HttpCode(200)`. La colección Postman ya asertaba 200; el dato va acá porque en un `POST` es fácil asumir lo contrario.

Las colecciones `postman/trasplante.postman_collection.json` y `postman/aplicaciones-quimicas.postman_collection.json` siguen pasando sin modificaciones.

### Lo que ya se verificó

**La carrera de trasplante, por HTTP.** Dos `POST /trasplante` concurrentes sobre la misma bandeja, con la API levantada: una responde 200 y la otra 422 `TRASPLANTE_BANDEJA_INVALIDA`, con la bandeja en `details.bandeja_ids`. En la base queda una sola fila en `mesa_bandeja`, un solo evento `trasplante` en `historial_mesa` y la mesa avanza una sola posición. 8/8 aserciones.

**Los casos de las dos colecciones, por HTTP.** 16/16, con el escenario armado vía API. Incluye el caso secuencial de aplicaciones: nursery sobre una bandeja ya trasplantada → 422 `APLICACION_TARGET_INVALIDO`, sin dejar registro ni descuento de stock.

**La carrera de aplicaciones químicas, a nivel SQL.** Esa no se puede provocar por HTTP: haría falta que el chequeo previo del perdedor pase *antes* de que el ganador commitee, y desde afuera no hay forma de intercalarlos. Se usaron dos conexiones concurrentes a Postgres ejecutando las mismas sentencias que el service, confirmando contra `pg_stat_activity` que la transacción perdedora quedaba esperando el lock de fila:

| Escenario | Código viejo | Código nuevo |
|---|---|---|
| Dos trasplantes de la misma bandeja | ambos afectan 1 fila → doble registro | 1 y 0 filas → la perdedora da 422 |
| Aplicación nursery sobre bandeja recién trasplantada | el chequeo previo la ve vigente y escribe igual | `FOR UPDATE` bloquea, re-evalúa y devuelve 0 filas → 422 |

Las dos filas de "código viejo" reproducen el bug, así que la prueba discrimina entre el antes y el después. `npm run build` y `npm test` (5 suites, 69 tests) quedaron en verde.

> La prueba SQL sola no alcanzaba: valida la semántica de Postgres, no el TypeScript que lee el resultado. La primera versión de la guarda de trasplante leía mal el resultado del `UPDATE` y no cortaba nada; eso lo detectó la prueba por HTTP, no la SQL.

---

## 6. Relación con el descarte de bandejas

Este fix es **prerrequisito** de `023-descarte-bandejas`. Sin él, una bandeja registrada como perdida podría trasplantarse igual, y la constancia de la pérdida quedaría contradicha por el estado de la propia bandeja.

Se separó en su propia rama porque corrige un bug que ya está en producción hoy y no depende del descarte para tener valor.
