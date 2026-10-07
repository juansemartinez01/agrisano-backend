# Handoff frontend — `cantidad` explícita del lote primario en aplicaciones químicas

**Estado**: desplegado en el entorno de desarrollo (Railway) y verificado de punta a punta.
**Tipo de cambio**: ⚠️ **breaking** en el body de `POST /aplicaciones-quimicas`. Sin este cambio, la creación de aplicaciones deja de funcionar (400).
**Referencia técnica**: `specs/017-cantidad-primario-explicita/contracts/create-aplicacion.md`.

---

## 1. Qué cambió, en una frase

El backend **ya no calcula** cuánto stock descontar del lote químico primario. Antes hacía `dosis × cantidad_de_targets`; ahora descuenta **exactamente el número que manden ustedes** en un campo nuevo obligatorio `cantidad`, en la raíz del body.

Es la misma mecánica que ya usaban para los lotes adicionales de `detalles[]`: ahí siempre mandaron `cantidad` y el backend descontó ese valor literal. Ahora el lote primario se comporta igual. La diferencia entre primario y adicionales desapareció.

### Por qué

El cálculo automático asumía que el consumo real era siempre `dosis × targets`, y en campo no siempre es así (sobrantes, mezclas preparadas de más, aplicaciones parciales). Quien registra la aplicación es dueño del número que se descuenta.

---

## 2. Endpoints afectados

| Endpoint | Impacto |
|---|---|
| `POST /aplicaciones-quimicas` | ⚠️ **Cambia el contrato de entrada**: nuevo campo obligatorio `cantidad`. Único endpoint que requiere trabajo del frontend. |
| `GET /aplicaciones-quimicas` | Sin cambios de shape. `chemical_lines[].quantity` ahora refleja la cantidad que enviaron (antes reflejaba el valor calculado). |
| `GET /aplicaciones-quimicas/:id` | Sin cambios de shape. `detalles[].cantidad` ídem. |
| `GET /mesas/:mesa_id/aplicaciones` | Sin cambios. |
| `GET /bandejas/:bandeja_id/aplicaciones` | Sin cambios. |
| Historial de mesa (`GET /mesas/:id/historial`) | **Aditivo**: el evento `aplicacion_quimica` ahora incluye `cantidad` además de `dosis`. |

**No hay que tocar ninguna pantalla de lectura.** Los tipos de las respuestas no cambiaron: ningún campo se agregó, renombró ni eliminó en las respuestas de los GET de aplicaciones.

---

## 3. `POST /aplicaciones-quimicas` — body nuevo

Ruta directa sobre el host base (sin prefijo `/api`). Requiere JWT + header `x-tenant-id`, y rol `operario`, `supervisor` o `admin_global`.

```ts
{
  establecimiento_id: string;         // uuid, requerido — sin cambios
  contexto: 'nursery' | 'greenhouse'; // requerido — sin cambios
  lote_quimico_id: string;            // uuid, requerido — lote primario, sin cambios

  dosis: number;                      // requerido, > 0 — SIGUE SIENDO OBLIGATORIA
                                      // Es informativa (dosis por target). NO afecta el stock.
  dosis_unidad?: 'kg/L' | 'g/L' | 'mL/L' | 'L/L';
                                      // opcional — default: rate_unidad del químico del lote primario

  cantidad: number;                   // ⭐ NUEVO — REQUERIDO, > 0
                                      // Es EXACTAMENTE lo que se descuenta del lote primario.

  observaciones?: string;             // opcional, máx 2000 caracteres — sin cambios

  detalles?: Array<{                  // opcional — lotes adicionales. SIN CAMBIOS.
    lote_quimico_id: string;          // uuid, requerido
    dosis: number;                    // requerido, > 0 — dosis real de ESTE lote
    dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate del químico de ESTE lote
    cantidad: number;                 // requerido, > 0 — lo que se descuenta de ESTE lote
  }>;                                 // si se envía, mínimo 1 y máximo 20 items

  bandeja_ids?: string[];             // requerido si contexto = 'nursery'   (máx 200)
  mesa_ids?: string[];                // requerido si contexto = 'greenhouse' (máx 200)

  operation_group_id?: string;        // opcional, uuid — ver sección 6 (troceo en chunks)
}
```

### Ejemplo — nursery

```json
{
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "contexto": "nursery",
  "lote_quimico_id": "620713b6-2eae-4db1-bcd1-bf021277e456",
  "dosis": 0.1,
  "dosis_unidad": "mL/L",
  "cantidad": 7.1,
  "observaciones": "Aplicación preventiva",
  "bandeja_ids": ["401ed4d7-...", "cc58d072-...", "... hasta 200"]
}
```

Con 71 bandejas y `dosis: 0.1`, si el consumo real fue el teórico mandan `cantidad: 7.1`. Si en la práctica gastaron 8, mandan `cantidad: 8` y el backend descuenta 8. **No valida coherencia entre `cantidad` y `dosis × targets`** — cualquier número positivo es aceptado.

### Ejemplo — greenhouse con lote adicional

```json
{
  "establecimiento_id": "00bb7c42-01fc-43ab-b4b7-39c4f18350e2",
  "contexto": "greenhouse",
  "lote_quimico_id": "620713b6-2eae-4db1-bcd1-bf021277e456",
  "dosis": 0.1,
  "cantidad": 0.03,
  "detalles": [
    { "lote_quimico_id": "14c5e257-...", "dosis": 0.2, "cantidad": 0.02 }
  ],
  "mesa_ids": ["f50cf9c8-..."]
}
```

Resultado verificado en dev: el lote primario bajó 0.030 y el adicional 0.020. Cada lote descuenta su propio número, sin multiplicar por la cantidad de mesas.

---

## 4. Cómo se descuenta el stock (regla completa)

| Lote | Cuánto se descuenta |
|---|---|
| Primario (`lote_quimico_id` de la raíz) | La `cantidad` de la raíz del body, literal |
| Adicionales (cada item de `detalles[]`) | La `cantidad` de ese item, literal (sin cambios) |

Puntos importantes:

- **El backend nunca multiplica por la cantidad de targets ni ajusta el valor.** El cálculo del total es 100% del frontend.
- **`dosis` no interviene en el stock.** Se guarda como snapshot informativo en la cabecera y en cada línea de detalle, y se muestra en las lecturas (`dose` / `dosis`). Sirve para trazabilidad, no para calcular.
- **La operación es atómica.** Si el stock de cualquier lote (primario o adicional) no alcanza, se revierte todo: no se crea la aplicación, ni los detalles, ni los vínculos con mesas/bandejas, ni el historial, ni la carencia. Se responde `422 LOTE_QUIMICO_STOCK_INSUFICIENTE`.
- **La precisión es de 6 decimales** (columna `numeric(13,6)`). Un valor con más de 6 decimales se rechaza con `400` (antes se redondeaba en silencio). Ver [handoff-frontend-cantidad-6-decimales.md](handoff-frontend-cantidad-6-decimales.md).
- Todo lo demás sigue igual: snapshot de `batch` y `withholding_period_dias`, carencia automática en mesas (`carencia_hasta`) cuando el químico tiene período de carencia, validación de estados de bandejas (`en_nursery`) y mesas (`activa` / `en_cosecha`).

### Sugerencia de UX

El formulario ya pide `dosis`. Recomendamos precargar `cantidad` con `dosis × cantidad_de_targets` como valor por defecto **editable**, y dejar que el operario lo corrija si el consumo real fue otro. Así el flujo actual no cambia para el usuario y se gana la capacidad de ajustar. Si prefieren un campo vacío y obligatorio, también funciona — pero validen en el cliente que sea `> 0` para no depender del 400 del servidor.

---

## 5. Respuesta `201` (sin cambios de shape)

```ts
{
  data: {
    aplicacion: {
      id: string;
      tenant_id: string;
      establecimiento_id: string;
      contexto: 'nursery' | 'greenhouse';
      observaciones: string | null;
      usuario_id: string;
      usuario_email_snapshot: string | null;
      usuario_nombre_snapshot: string | null;
      usuario_apellido_snapshot: string | null;
      fecha_hora: string;                     // ISO
      lote_quimico_id: string;
      dosis: string;                          // numeric → llega como string (ej. "0.100")
      dosis_unidad: string | null;
      batch: string | null;                   // snapshot del número de lote
      withholding_period_dias: number | null; // snapshot de la carencia
      operation_group_id: string;             // uuid (generado si no lo mandan)
      created_at: string;
      updated_at: string;
    };
    detalles: Array<{                         // [0] es SIEMPRE el lote primario
      id: string;
      aplicacion_id: string;
      lote_quimico_id: string;
      dosis: number;
      dosis_unidad: string | null;
      cantidad: number;                       // ← acá ven lo que realmente se descontó
      unidad_medida: string;                  // copiada del químico al aplicar
    }>;
    afectados: {
      bandeja_ids?: string[];                 // si contexto = nursery
      mesa_ids?: string[];                    // si contexto = greenhouse
    };
  }
}
```

> Ojo con los `numeric` de Postgres: `aplicacion.dosis` llega como **string** (`"0.100"`), mientras que `detalles[].cantidad` y `detalles[].dosis` llegan como **number**. Es el comportamiento previo, no cambió — pero si tipan la respuesta, tenlo en cuenta.

### Verificación de que se descontó lo correcto

`data.detalles[0].cantidad` debe ser igual al `cantidad` que enviaron. Si quieren mostrar el stock resultante, consulten `GET /lotes-quimicos/:id` después de crear.

---

## 6. Troceo en chunks (`operation_group_id`)

El límite es de **200 targets por request**. Para una aplicación de más de 200 mesas/bandejas, el frontend trocea en varios POST y manda el mismo `operation_group_id` (uuid v4 generado por ustedes) en todos, para que después se sepa que fueron parte de la misma operación lógica.

**La `cantidad` es por POST, no por operación completa.** Si aplican 10 litros repartidos en 3 chunks, la suma de las `cantidad` de los 3 requests debe dar 10 — el reparto lo deciden ustedes (proporcional a los targets de cada chunk es lo natural). El backend no conoce el total de la operación y no lo valida.

Si no mandan `operation_group_id`, el backend genera uno propio por request.

---

## 7. Errores

| Caso | Status | Código | Nota |
|---|---|---|---|
| `cantidad` ausente, `0`, negativa o no numérica | **400** | validación | **Nuevo**. Mensaje: `"cantidad must be a positive number..."` |
| `dosis` ausente o ≤ 0 | 400 | validación | Sin cambios: la dosis sigue siendo obligatoria |
| `dosis` o `cantidad` faltante en algún item de `detalles[]` | 400 | validación | Sin cambios |
| Stock insuficiente (primario o adicional) | 422 | `LOTE_QUIMICO_STOCK_INSUFICIENTE` | Revierte todo |
| Bandeja/mesa/lote de otro establecimiento o en estado inválido | 422 | `APLICACION_TARGET_INVALIDO` | Sin cambios |
| Falta `bandeja_ids` / `mesa_ids` según contexto | 422 | `APLICACION_TARGETS_VACIOS` | Sin cambios |
| `lote_quimico_id` inexistente | 404 | `LOTE_QUIMICO_NOT_FOUND` | Sin cambios |

No existe respuesta parcial ni warnings: o se crea todo, o no se crea nada.

---

## 8. Historial de mesa (solo greenhouse, cambio aditivo)

El evento `aplicacion_quimica` del historial ahora incluye `cantidad`:

```json
{
  "aplicacion_id": "017553f5-1c57-41de-9aa0-a71bcd717b95",
  "lote_quimico_id": "620713b6-2eae-4db1-bcd1-bf021277e456",
  "dosis": 0.1,
  "cantidad": 0.07,
  "batch": "NoWithholding-1",
  "quimicos_adicionales": [{ "lote_quimico_id": "...", "cantidad": 0.02 }]
}
```

Es aditivo: si hoy pintan `dosis` y `batch`, siguen funcionando. Los eventos históricos anteriores al deploy **no tienen** `cantidad` — trátenlo como opcional al leer.

---

## 9. Datos históricos

Las aplicaciones creadas antes de este cambio **no se modificaron**. Tienen el mismo shape que las nuevas; su `cantidad` es la que se calculó en su momento con `dosis × targets`. No hay forma (ni necesidad) de distinguirlas desde el frontend: en ambos casos `cantidad` es "lo que se descontó del stock".

---

## 10. Checklist de implementación

- [ ] Agregar el campo `cantidad` al formulario de creación de aplicación química (número, obligatorio, > 0, hasta 6 decimales).
- [ ] Sugerido: precargarlo con `dosis × cantidad_de_targets` y dejarlo editable.
- [ ] Incluir `cantidad` en el body de **todos** los POST a `/aplicaciones-quimicas`.
- [ ] En flujos con troceo por chunks, repartir el total entre los chunks y mandar el mismo `operation_group_id`.
- [ ] Validar en el cliente `cantidad > 0` para evitar el 400 del servidor.
- [ ] Manejar/mostrar el 422 de stock insuficiente (el mensaje del backend ya identifica el caso).
- [ ] Opcional: mostrar `cantidad` en el historial de mesa junto a la dosis.
- [ ] **Coordinar el deploy**: desde que esto sale a producción, cualquier cliente que no mande `cantidad` recibe 400. No hay fallback al cálculo anterior.

---

## 11. Verificación hecha en dev

Todo lo de este documento fue probado contra el entorno de desarrollo:

- Nursery con `cantidad: 0.05`, `dosis: 0.1` y 2 bandejas → el lote bajó exactamente **0.05** (con la lógica anterior habría bajado 0.2).
- Greenhouse con `cantidad: 0.07` sobre 1 mesa → bajó 0.07, y el evento de historial trae `cantidad`.
- POST sin `cantidad`, con `0` y con `-1` → 400 en los tres casos, sin tocar stock.
- POST sin `dosis` → 400.
- `cantidad: 999999` → 422 con rollback completo (stock intacto).
- Primario `0.03` + adicional `0.02` → cada lote descontó su valor literal.
- `GET /aplicaciones-quimicas` y `GET /aplicaciones-quimicas/:id` → shape idéntico, con `quantity` / `cantidad` iguales a lo enviado.
