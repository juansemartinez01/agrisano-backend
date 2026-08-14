# Handoff Frontend — Unidades de dosis por hectárea

**Fecha:** 2026-08-14
**Tipo de cambio:** aditivo en el backend. **Requiere deploy + migración.**
**Breaking:** no. Ningún contrato cambia de forma; ningún valor existente deja de ser válido.

---

## 1. TL;DR

El enum `QuimicoRateUnidad` pasa de 4 a 8 valores. Los cuatro nuevos son unidades **por superficie**:

```ts
enum QuimicoRateUnidad {
  // concentración — las de siempre, sin cambios
  KG_L = 'kg/L',
  G_L = 'g/L',
  ML_L = 'mL/L',
  L_L = 'L/L',
  // superficie — NUEVAS
  ML_HA = 'mL/Ha',
  L_HA = 'L/Ha',
  G_HA = 'g/Ha',
  KG_HA = 'kg/Ha',
}
```

Aplican en los **tres** lugares donde hoy se usa el enum:

| Campo | Endpoint | Qué es |
|---|---|---|
| `rate_unidad` | `POST`/`PATCH /quimicos` | Unidad de dosis por defecto del químico en el catálogo |
| `dosis_unidad` | `POST /aplicaciones-quimicas` (raíz) | Unidad de la dosis del lote primario |
| `detalles[].dosis_unidad` | `POST /aplicaciones-quimicas` | Unidad de la dosis de cada lote adicional |

La capitalización es **exacta**: `Ha` con H mayúscula y a minúscula, y la unidad de volumen mantiene la convención vigente (`mL`, `L`, `g`, `kg`). Mandar `l_ha`, `L/HA` o `l/ha` devuelve `400`.

---

## 2. ⚠️ Lo único que hay que cambiar en el front: la sugerencia de `cantidad`

Hoy el front sugiere `cantidad` multiplicando `dosis × cantidad_de_targets` (bandejas o mesas). Está documentado en [handoff-frontend-cantidad-primario.md](handoff-frontend-cantidad-primario.md): 71 bandejas con `dosis: 0.1` → `cantidad: 7.1`.

**Esa cuenta no aplica a las unidades `/Ha`.** El multiplicador de una dosis por hectárea es la superficie aplicada, no la cantidad de bandejas o mesas. Y **el sistema no conoce superficies**: ni bandejas, ni mesas, ni túneles tienen área modelada.

Regla a implementar:

> Si la unidad de dosis seleccionada termina en `/Ha`, **no sugerir `cantidad`**. Dejar el campo vacío para que el operario lo cargue a mano.

`cantidad` sigue siendo **obligatoria y > 0** en todos los casos — el backend la exige igual, solo que ahora no hay forma de precalcularla. Tampoco cambia `dosis`: sigue siendo obligatoria, > 0 e informativa.

---

## 3. Dónde impacta en pantallas de lectura

`dosis_unidad` vuelve en las respuestas de aplicaciones químicas y trazabilidad como **string**, no como enum tipado. Dos cosas:

- Cualquier dropdown, `switch`, mapa de etiquetas o validación del front que hoy asuma **solo 4 valores** tiene que contemplar 8. Un químico con `rate_unidad: "L/Ha"` va a hacer que `dosis_unidad` llegue como `"L/Ha"` aunque la aplicación no lo haya mandado explícito: cuando se omite, el backend copia el `rate_unidad` del químico del lote.
- **No sumar ni promediar `dosis` sin agrupar por `dosis_unidad`.** Ya era incorrecto con 4 unidades; ahora conviven dos familias que ni siquiera son convertibles entre sí. Lo mismo con `cantidad` y `unidad_medida` (`kg` / `l`).

---

## 4. ⚠️ Corrección de documentación previa

[trazabilidad-frontend.md](trazabilidad-frontend.md) tenía un ejemplo de respuesta con `"dosis_unidad": "l_ha"` y `"unidad_medida": "L"`. **Los dos valores eran inválidos** — la base nunca pudo haberlos devuelto. Ya está corregido a `"L/Ha"` y `"l"`.

Si alguien copió esa grafía al implementar, hay que corregirla: `l_ha` no existe y devuelve `400`.

---

## 5. Qué NO cambia

Confirmado contra el código:

- ❌ Ningún campo se agrega, renombra ni elimina en ninguna request o response.
- ❌ `unidad_medida` (`kg` / `l`) no se toca. Es otro enum, es la unidad de **stock**, y sigue con sus 2 valores.
- ❌ El descuento de stock no cambia: se sigue descontando literalmente el `cantidad` que manden, sin conversión ni validación.
- ❌ No hay validación nueva. El backend **no** valida que la unidad de dosis sea coherente con la `unidad_medida` del químico, ni entre `dosis` y `cantidad`. Un químico stockeado en `kg` con dosis en `L/Ha` se acepta.
- ❌ Las aplicaciones y químicos existentes quedan intactos, con sus unidades actuales.
- ❌ No hay endpoint que liste las unidades válidas. La lista sigue viviendo hardcodeada en el front — de ahí este documento.

---

## 6. Deploy

Requiere el deploy del backend con la migración `1774600000000-RateUnidadHectarea`, que corre sola en el boot. **Hasta que esté aplicada, mandar cualquier valor `/Ha` devuelve `400`.**

La migración es aditiva sobre el tipo de Postgres y no toca ninguna fila. No hay ventana de incompatibilidad: el front viejo sigue funcionando contra el backend nuevo sin cambios.

Para probar, el seed de QA (`scripts/sql/qa-seed-mesas-tuneles-quimicos-lotes.sql`) ahora incluye **`QA Quimico 11`** con `rate_unidad: "L/Ha"`, stockeado en `l`, con sus dos lotes (`QA-QUI-11-A`, `QA-QUI-11-B`).
