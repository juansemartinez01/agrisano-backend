# Handoff frontend — `cantidad` con hasta 6 decimales (aplicaciones y lotes químicos)

**Estado**: implementado en la rama `024-cantidad-6-decimales` y verificado de punta a punta contra una base local (ver sección 6). Pendiente de desplegar.
**Tipo de cambio**: ⚠️ **más estricto** en la validación (más de 6 decimales ahora responde `400`) y **aditivo** en la precisión (los valores de 3 decimales siguen funcionando igual).
**Orden de despliegue**: primero backend, después front. El backend nuevo acepta todo lo que mandaba el front viejo.

---

## 1. Respuestas al listado del brief

| Pregunta | Respuesta |
|---|---|
| Máximo de decimales soportado | **6** (mínimo `0.000001`) |
| Precisión / escala en base de datos | **`numeric(13,6)`** → hasta 7 dígitos enteros y 6 decimales (máximo `9999999.999999`, el mismo rango entero que antes con `numeric(10,3)`) |
| `POST /aplicaciones-quimicas` | ✅ `cantidad` (raíz) y `detalles[].cantidad` |
| `PATCH /aplicaciones-quimicas/:id` | ✅ `chemical_lines[].cantidad` |
| `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id` | ✅ `items[].chemical_lines[].cantidad` (ops `create` y `update`) |
| Aritmética de stock | Exacta. El descuento, la reversión y el re-aplicado se hacen **dentro de PostgreSQL con `numeric`** (`cantidad_actual = cantidad_actual ± :cantidad`), sin pasar por floats de JavaScript. Al revertir una línea vieja se usa el valor tal cual está en la base (string), no un `number` re-parseado |
| ¿Las respuestas preservan la precisión? | Sí, con una diferencia de **tipo** según el endpoint (ver sección 3) |

También se extendió a la **creación de lotes** (`cantidad_inicial`) y al **ajuste** (`POST /lotes-quimicos/:id/ajuste`, `cantidad`), porque el stock del lote es la misma columna.

---

## 2. Validación (importante)

`cantidad` debe cumplir **todo** esto:

- Número JSON (no string).
- `> 0`.
- **Como máximo 6 decimales.**
- `<= 9999999.999999`.

Si no se cumple, el backend responde **`400`** con el mensaje:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "details": {
      "validationErrors": [
        { "message": "cantidad must be a number greater than 0 with at most 6 decimal places and not greater than 9999999.999999" }
      ]
    }
  }
}
```

Antes de este cambio el backend **no rechazaba** más de 3 decimales: guardaba el valor redondeado en silencio, y un valor como `0.0004` se persistía como `0.000` sin descontar stock. Ahora eso es un `400` explícito y no se toca el stock.

### ⚠️ Ruido de punto flotante

`0.1 + 0.2` en JavaScript es `0.30000000000000004` (17 decimales) y **se rechaza**. Hay que redondear **en todos los caminos de envío** (POST, PATCH simple, PATCH de grupo, lotes):

```ts
const cantidad6 = (x: number) => Number(x.toFixed(6));
```

Los valores de hasta 6 decimales escritos por una persona o calculados y redondeados así pasan siempre: se verificó con 200 000 valores aleatorios de todo el rango.

---

## 3. Formato de las respuestas

| Endpoint | Tipo de `cantidad` | Ejemplo |
|---|---|---|
| `GET /aplicaciones-quimicas`, `/:id`, `chemical_lines[].quantity`, `detalles[].cantidad` | `number` | `0.000272` |
| `POST /aplicaciones-quimicas` → `data.detalles[].cantidad` | `number` | `0.000272` |
| `GET /lotes-quimicos`, `/:id` → `cantidad_inicial`, `cantidad_actual` | **`string`** (valor crudo de PostgreSQL) | `"10.000000"` |
| Historial de mesa (`cantidad` del evento `aplicacion_quimica`) | `number` (tal como se envió) | `0.000272` |

Cambio visible para el front: los lotes antes devolvían `"10.000"` y ahora devuelven `"10.000000"`. Si el front compara strings o formatea con una cantidad fija de decimales, hay que revisarlo. Convertir con `Number(...)` para mostrar o calcular sigue funcionando.

---

## 4. Cómo repartir un total entre chunks sin perder exactitud

El backend no reparte ni ajusta nada (`operation_group_id`, el límite de 200 targets por chunk y la semántica de `dosis` no cambiaron). Si el front reparte un total entre varios POST, conviene hacerlo en **enteros de micro-unidades** para que la suma sea exacta:

```ts
// Reparte `total` (hasta 6 decimales) en `n` chunks cuya suma es EXACTAMENTE `total`.
function repartir(total: number, n: number): number[] {
  const micros = Math.round(total * 1e6);
  const base = Math.floor(micros / n);
  const resto = micros - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 1e6);
}

repartir(0.003, 11); // 8 chunks de 0.000273 + 3 chunks de 0.000272 → suma 0.003000
```

Cada elemento ya tiene como máximo 6 decimales, así que pasa la validación.

---

## 5. Compatibilidad y qué NO cambió

- **Valores de 3 decimales** (`0.125`, `1.5`, `0.001`): funcionan idéntico. Los datos históricos no cambian (`1.500` pasa a `1.500000`).
- Sin cambios: límite de 200 targets por chunk, `operation_group_id`, `dosis` (es solo informativa; también pasó a 6 decimales, ver [handoff-frontend-dosis-6-decimales.md](handoff-frontend-dosis-6-decimales.md)), selección FEFO, período de carencia (WHP), validación de targets, roles, tenancy, y el rechazo `422 LOTE_QUIMICO_STOCK_INSUFICIENTE` cuando falta stock.
- El `PATCH` de grupo mantiene su regla de que el grupo no puede quedar vacío (`422 APLICACION_TARGETS_VACIOS`).

---

## 6. Verificación realizada

Prueba HTTP real contra el backend local (base PostgreSQL local, lote con stock `994.000000`):

| Escenario | Resultado |
|---|---|
| 11 POST con el mismo `operation_group_id`: 10 × `0.000272` + 1 × `0.00028` | `201` ×11. Suma de detalles = `0.003000`. Stock bajó exactamente `0.003000` (`994.000000` → `993.997000`) |
| `PATCH /:id` cambiando `0.000272` → `0.000123` | `200`. Stock subió exactamente `0.000149`. Detalle persistido como `0.000123` |
| `PATCH` de grupo con `update` (`0.000999`) + `delete` + `create` (`0.000555`) | `200`. Stock bajó exactamente `0.001010` |
| `POST` legacy con `0.125` | `201`. Persistido como `0.125000` |
| `cantidad` con 7 decimales, `5e-7`, `1e-7`, `0.1 + 0.2`, `0`, negativo, `> 9999999.999999` | `400` en todos. Stock intacto |
| `PATCH /:id` y `PATCH` de grupo con 7 decimales | `400` |
| `POST /lotes-quimicos/:id/ajuste` con `0.000001` / con 7 decimales | `201` (resta exacta `0.000001`) / `400` |
| `POST /lotes-quimicos` con `cantidad_inicial: 0.999727` / con 7 decimales | `201` / `400` |
| Borrar 10 de las 11 filas del grupo con `PATCH` de grupo | `200`. El stock se restituyó exactamente (`0.003738`, igual a la suma de las filas borradas) |

Además, 112 tests unitarios pasan (incluye los DTOs reales pasados por un `ValidationPipe` idéntico al de `main.ts`).

---

## 7. Checklist para el front

- [ ] Redondear `cantidad` con `Number(x.toFixed(6))` (o repartir en micro-unidades) antes de **todo** envío: POST, PATCH simple, PATCH de grupo, creación y ajuste de lotes.
- [ ] Permitir hasta 6 decimales en los inputs de `cantidad` (y en `cantidad_inicial` / ajuste de lotes).
- [ ] Manejar `400` con `error.details.validationErrors[].message` para mostrar el error de decimales.
- [ ] Revisar cualquier formateo/comparación de `cantidad_inicial` / `cantidad_actual` de lotes: ahora son strings con 6 decimales (`"10.000000"`).
- [ ] `dosis` tiene su propio cambio (también 6 decimales, misma regla): ver [handoff-frontend-dosis-6-decimales.md](handoff-frontend-dosis-6-decimales.md).
