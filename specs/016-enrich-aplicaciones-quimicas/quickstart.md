# Quickstart: verificación de la feature

## Compilación

```powershell
npx tsc --noEmit
```

## Verificación funcional (Postman o curl con JWT válido)

1. **Listado**: `GET /aplicaciones-quimicas?page=1&limit=10&sortOrder=DESC`
   - Cada item trae `usuario`, `target_count`, `target_summary`, `chemical_lines`.
   - Campos previos intactos (`id`, `contexto`, `fecha_hora`, `usuario_id`, `lote_quimico_id`, `dosis`, …).
   - `meta` = `{ page, limit, total }`.
   - Greenhouse: túneles con `table_count`; nursery: seedings con `tray_count`, `created_at`, `product`, `variety`.
   - `chemical_lines`: una línea por detalle; solo la principal lleva `dose`/`dose_unit`/`withholding_period_days`.

2. **Detalle greenhouse**: `GET /aplicaciones-quimicas/:id`
   - `mesa_ids` presente y sin cambios; `targets.total === mesa_ids.length`.
   - Mesas agrupadas por túnel con `nombre`, `posicion_actual`, `estado`.

3. **Detalle nursery**: ídem con `bandeja_ids` y `targets.seedings[]` (product, variety, seed_lot, substrate_lot, trays con código/estado).

4. **Degradación a null**: probar con una aplicación cuyo usuario/marca/proveedor falte ⇒ respuesta 200 con esos campos en `null`.

## Verificación de performance (SC-002)

Con logging SQL activado (o `pino` en debug), cargar una página de 10 aplicaciones y contar queries: deben ser ≤ 6 (1 paginada + hasta 4 batch + count), sin queries por mesa/bandeja individuales.

## Regresión

- `POST /aplicaciones-quimicas` sigue creando igual (stock, carencias, historial).
- `GET /mesas/:id/aplicaciones` y `GET /bandejas/:id/aplicaciones` sin cambios.
- Filtros del listado (`contexto`, `quimico_id`, fechas, `establecimiento_id`) siguen funcionando.
