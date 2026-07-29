# Quickstart: verificación

## Compilación y lint

```powershell
npx tsc --noEmit
npx eslint "src/modules/aplicaciones-quimicas/**/*.ts"
```

## Verificación funcional (dev / Railway, JWT + x-tenant-id)

1. **Descuento explícito**: leer `cantidad_actual` del lote primario (`GET /lotes-quimicos/:id`), crear aplicación con `cantidad: X` distinta de `dosis × targets` (ej. `cantidad: 0.5`, `dosis: 0.1`, 3 bandejas), releer el lote → descontó exactamente `X` (no 0.3). El detalle primario de la respuesta trae `cantidad: X` y `dosis: 0.1`.
2. **400 sin cantidad**: mismo body sin `cantidad` → 400 de validación; el stock del lote no cambió.
3. **400 cantidad inválida**: `cantidad: 0` y `cantidad: -1` → 400.
4. **422 stock insuficiente**: `cantidad` mayor al stock → 422 `LOTE_QUIMICO_STOCK_INSUFICIENTE`; verificar rollback (ni aplicación ni descuento).
5. **Dosis intacta**: request sin `dosis` → 400 (sigue obligatoria).
6. **Historial de mesa** (greenhouse): tras crear con `mesa_ids`, `GET /mesas/:id/historial` → el evento `aplicacion_quimica` incluye `dosis` y `cantidad`.
7. **Lectura sin cambios**: `GET /aplicaciones-quimicas/:id` → `chemical_lines[0].quantity` = cantidad enviada; shape idéntico.
8. **Adicionales sin cambios**: crear con `detalles[]` → cada adicional descuenta su `cantidad` literal como siempre.

## Regresión

- Carencias (`carencia_hasta`) se siguen estampando igual (probar con químico con `withholding_period_dias > 0`).
- Validaciones de targets (bandeja no `en_nursery`, mesa `baja`) siguen en 422.
