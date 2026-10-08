# Handoff frontend — `dosis` con hasta 6 decimales (aplicaciones químicas)

**Estado**: implementado en la rama `025-dosis-6-decimales` y verificado de punta a punta contra una base local (ver sección 6). Pendiente de desplegar.
**Tipo de cambio**: ⚠️ **más estricto** en la validación (más de 6 decimales ahora responde `400`) y **aditivo** en la precisión (los valores de 3 decimales siguen funcionando igual). Es el mismo cambio que se hizo para `cantidad` en [handoff-frontend-cantidad-6-decimales.md](handoff-frontend-cantidad-6-decimales.md), aplicado ahora a `dosis`.
**Orden de despliegue**: primero backend, después front. El backend nuevo acepta todo lo que mandaba el front viejo.

---

## 1. Qué pasaba

`dosis` se guardaba en columnas `numeric(10,3)`. Un valor con más de 3 decimales no daba error: Postgres lo **redondeaba en silencio** al guardar.

| Se enviaba | Se guardaba antes |
|---|---|
| `0.00025` (0.25 mL/L expresado en `L/L`) | `0.000` |
| `0.000273` | `0.000` |
| `0.0005` | `0.001` |

No afectaba el stock (la dosis es informativa), pero la trazabilidad y el detalle de la aplicación mostraban una dosis falsa. Con unidades como `L/L` o `kg/L` una dosis real casi siempre cae por debajo de `0.001`.

---

## 2. Qué cambió

| Pregunta | Respuesta |
|---|---|
| Máximo de decimales | **6** (mínimo `0.000001`) |
| Columna en base de datos | **`numeric(13,6)`** en `aplicaciones_quimicas.dosis` y `aplicaciones_quimicas_detalle.dosis` → máximo `9999999.999999` (el mismo rango entero que antes) |
| `POST /aplicaciones-quimicas` | ✅ `dosis` (raíz) y `detalles[].dosis` |
| `PATCH /aplicaciones-quimicas/:id` | ✅ `chemical_lines[].dosis` |
| `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id` | ✅ `items[].chemical_lines[].dosis` (ops `create` y `update`) |
| Datos históricos | No cambian (`2.000` pasa a `2.000000`) |

La regla es **idéntica a la de `cantidad`**.

---

## 3. Validación (importante)

`dosis` debe cumplir **todo** esto:

- Número JSON (no string).
- `> 0`.
- **Como máximo 6 decimales.**
- `<= 9999999.999999`.

Si no se cumple, el backend responde **`400`**:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "details": {
      "validationErrors": [
        { "message": "dosis must be a number greater than 0 with at most 6 decimal places and not greater than 9999999.999999" }
      ]
    }
  }
}
```

En `detalles[]` y en `chemical_lines[]` el mensaje lleva la ruta (`detalles.0.dosis ...`, `chemical_lines.0.dosis ...`, `items.0.chemical_lines.0.dosis ...`).

### ⚠️ Ruido de punto flotante

`0.1 + 0.2` en JavaScript es `0.30000000000000004` y **se rechaza**. Si la dosis se **calcula** (por ejemplo convirtiendo `mL/L` a `L/L` dividiendo por 1000) hay que redondear antes de enviar, en **todos** los caminos (POST, PATCH simple, PATCH de grupo):

```ts
const dosis6 = (x: number) => Number(x.toFixed(6));

dosis6(0.25 / 1000); // 0.00025
```

Una dosis escrita a mano con hasta 6 decimales pasa siempre.

---

## 4. Formato de las respuestas

| Dónde | Tipo de `dosis` | Ejemplo |
|---|---|---|
| `GET /aplicaciones-quimicas/:id` → `detalles[].dosis` | `number` | `0.000273` |
| `POST /aplicaciones-quimicas` → `data.detalles[].dosis` | `number` | `0.000273` |
| `GET /aplicaciones-quimicas` (listado) → `chemical_lines[].dose` | `number` | `0.000273` |
| Trazabilidad (`/trazabilidad/cosecha/:id`, `/trazabilidad/mesa/:id`) → `aplicacion.dosis` (**cabecera**) | **`string`** (valor crudo de PostgreSQL) | `"0.000273"`, `"2.000000"` |
| Trazabilidad → `aplicacion.detalles[].dosis` | `number` | `0.000273` |
| Historial de mesa (`dosis` del evento `aplicacion_quimica`) | `number` (tal como se envió) | `0.000273` |

**Cambio visible para el front**: la `dosis` de la cabecera en trazabilidad antes llegaba como `"2.000"` y ahora llega como `"2.000000"`. Convertir con `Number(...)` para mostrar o calcular sigue funcionando. Si el front compara el string literal, o lo muestra sin formatear, hay que revisarlo.

> La cabecera de trazabilidad llega como string porque Postgres entrega los `numeric` como string; los items de `detalles` salen de un `json_build_object` y llegan como number. Es comportamiento previo, no cambió. Si tipan la respuesta usen `number | string` (como ya indica [trazabilidad-frontend.md](trazabilidad-frontend.md)).

---

## 5. Compatibilidad y qué NO cambió

- **Valores de 3 decimales o enteros** (`0.125`, `2`, `0.5`): funcionan idéntico.
- `dosis` sigue siendo **obligatoria** y **puramente informativa**: no interviene en el stock, FEFO ni el período de carencia. El descuento sigue siendo la `cantidad` literal.
- Sin cambios: `dosis_unidad` (8 valores del enum), `cantidad` (ya admitía 6 decimales), `operation_group_id`, límite de 200 targets, roles, tenancy.
- El `PATCH` de grupo mantiene su regla de que el grupo no puede quedar vacío (`422 APLICACION_TARGETS_VACIOS`).

---

## 6. Verificación realizada

Prueba HTTP real contra el backend local (base PostgreSQL local; la migración corrió sola al arrancar la app):

| Escenario | Resultado |
|---|---|
| Columnas `dosis` tras la migración | Las dos en `numeric(13,6)` |
| 23 cabeceras y 25 detalles existentes | Mismos valores (`2.000` → `2.000000`) |
| `POST` con `dosis: 0.000273` | `201`. Persistido `0.000273` en cabecera y detalle (antes `0.000`) |
| `POST` con `dosis: 0.0005` | `201`. Persistido `0.000500` (antes `0.001`) |
| `POST` con `detalles[]` de `dosis` `0.00025` y `0.000124` | `201`. Persistido exacto en cada línea |
| `POST` legacy con `dosis: 2` y `0.125` | `201`. Persistido `2.000000` y `0.125000` |
| `GET /aplicaciones-quimicas/:id` | `detalles[0].dosis` = `0.000273` (number) |
| `PATCH /:id` cambiando la dosis a `0.000124` | `200`. Persistido `0.000124` en cabecera y detalle. Stock sin cambios |
| `PATCH` de grupo con `update` (`0.000273`) y `create` (`0.000282`) | `200`. Persistido exacto |
| `dosis` con 7 decimales, `5e-7`, `1e-7`, `0.1 + 0.2`, `0`, negativo, `> 9999999.999999` | `400` en todos. Stock intacto |
| `detalles[].dosis`, `chemical_lines[].dosis` y `items[].chemical_lines[].dosis` con más de 6 decimales | `400` con la ruta del campo |

El formato de trazabilidad (`"2.000000"` en cabecera, number en `detalles`) se confirmó consultando Postgres con las mismas expresiones que usa el servicio, porque la base local no tiene cosechas con aplicaciones.

Además, 147 tests unitarios pasan en total (incluye los DTOs reales pasados por un `ValidationPipe` idéntico al de `main.ts`).

---

## 7. Checklist para el front

- [ ] Permitir hasta 6 decimales en los inputs de `dosis` (raíz, `detalles[]` y `chemical_lines[]`).
- [ ] Redondear con `Number(x.toFixed(6))` toda `dosis` **calculada** antes de enviar: POST, PATCH simple, PATCH de grupo.
- [ ] Manejar `400` con `error.details.validationErrors[].message` para mostrar el error de decimales.
- [ ] Revisar el formateo/comparación de la `dosis` de cabecera en trazabilidad: ahora es un string con 6 decimales (`"2.000000"`).
- [ ] No cambiar nada más: `dosis_unidad` y `cantidad` se mantienen como están.
