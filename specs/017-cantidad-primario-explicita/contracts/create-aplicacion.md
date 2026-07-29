# Contract: POST /aplicaciones-quimicas (v. cantidad explícita)

Ruta, auth (JWT + `x-tenant-id`), roles (`operario`, `supervisor`, `admin_global`) y response `201` **sin cambios**. Solo cambia el body de entrada y la regla de descuento del lote primario.

## Body

```ts
{
  establecimiento_id: string;       // uuid, requerido — sin cambios
  contexto: 'nursery' | 'greenhouse'; // requerido — sin cambios
  lote_quimico_id: string;          // uuid, requerido — lote primario, sin cambios

  dosis: number;                    // requerido, > 0 — INFORMATIVO (por target), sin cambios
  dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate_unidad del químico, sin cambios

  cantidad: number;                 // ⭐ NUEVO — requerido, > 0
                                    // Es EXACTAMENTE lo que se descuenta del lote primario.
                                    // El backend no calcula ni valida contra dosis × targets.

  observaciones?: string;           // sin cambios
  detalles?: DetalleItemDto[];      // sin cambios (ya funcionaban así: cantidad literal)
  bandeja_ids?: string[];           // sin cambios
  mesa_ids?: string[];              // sin cambios
  operation_group_id?: string;      // sin cambios — con chunks, `cantidad` es POR CHUNK
}
```

## Reglas de descuento (después del cambio)

| Lote | Descuento |
|---|---|
| Primario | `cantidad` literal del body (**antes**: `dosis × cantidad_de_targets`) |
| Adicionales (`detalles[]`) | `cantidad` literal de cada item (sin cambios) |

- Guard atómico intacto: si `cantidad_actual < cantidad` → 422 `LOTE_QUIMICO_STOCK_INSUFICIENTE` y rollback total.
- El detalle primario persiste `cantidad` = valor enviado; `dosis`/`dosis_unidad` informativas.
- Historial de mesa (greenhouse): el evento `aplicacion_quimica` agrega `"cantidad": <valor>` junto a `dosis` (aditivo).

## Errores

| Caso | Status |
|---|---|
| `cantidad` ausente, ≤ 0 o no numérica | 400 (validación) — **nuevo comportamiento** |
| `dosis` ausente o ≤ 0 | 400 — sin cambios |
| Stock insuficiente (primario o adicional) | 422 — sin cambios |
| Targets vacíos / inválidos | 422 — sin cambios |

## ⚠️ Breaking change coordinado

Clientes que no envíen `cantidad` reciben 400 a partir del deploy. No hay fallback al cálculo anterior (decisión de negocio). El frontend debe calcular y enviar la cantidad total por request (en chunks: repartida por chunk).
