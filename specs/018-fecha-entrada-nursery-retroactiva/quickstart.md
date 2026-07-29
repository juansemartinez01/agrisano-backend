# Quickstart: verificación

## Compilación y lint

```powershell
npx tsc --noEmit
npx eslint "src/modules/siembra/**/*.ts"
```

## Preparación (dev / Railway, JWT + `x-tenant-id`)

Se necesitan **cuatro** siembras con bandejas en `cooling_period` (cada escenario de éxito consume las suyas, porque el movimiento es irreversible). Crearlas con `POST /siembras` y anotar `id` y `fecha` de cada una. Para el paso 4 conviene una siembra con `fecha` retroactiva (ej. `2026-07-01`) para tener margen de días pasados válidos.

## Verificación funcional

1. **Sin fecha (regresión, camino actual)**: `POST /siembras/S1/ingresar-nursery` sin body → 200. En la respuesta, todas las bandejas quedan `en_nursery` con `fecha_entrada_nursery` ≈ el instante de la llamada (hora real, no 12:00).
2. **Body vacío**: `POST /siembras/S2/ingresar-nursery` con `{}` → 200, mismo resultado que el paso 1 (instante real).
3. **Fecha de hoy explícita**: `POST /siembras/S3/ingresar-nursery` con `{ "fecha_entrada": "<hoy>" }` → 200 y `fecha_entrada_nursery` es el instante real, **no** `T12:00:00.000Z`. (Confirma la excepción D2: nunca se guarda un timestamp futuro.)
4. **Fecha pasada (caso principal)**: siembra S4 con `fecha` = `2026-07-01`, `POST` con `{ "fecha_entrada": "2026-07-20" }` → 200 y **todas** sus bandejas con `fecha_entrada_nursery` = `2026-07-20T12:00:00.000Z`, idéntico valor en todas.
5. **Límite inferior válido**: sobre una siembra nueva con `fecha` = `F`, enviar `fecha_entrada` = `F` → 200 (el mismo día de la siembra es válido).
6. **422 fecha futura**: `{ "fecha_entrada": "<mañana>" }` → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`. Releer la siembra: todas las bandejas siguen en `cooling_period` con `fecha_entrada_nursery: null`.
7. **422 fecha anterior a la siembra**: sobre una siembra con `fecha` = `2026-07-15`, enviar `2026-07-10` → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`; nada cambió.
8. **422 fecha inexistente**: `{ "fecha_entrada": "2026-02-31" }` → 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA` (no debe hacer roll-over al 3 de marzo); nada cambió.
9. **400 formato inválido**: `"20/07/2026"`, `"2026-7-1"`, `"2026-07-20T10:00:00Z"` y `123` → 400 de validación en los cuatro casos; nada cambió.
10. **400 campo desconocido**: `{ "fecha": "2026-07-20" }` → 400 (`forbidNonWhitelisted`); nada cambió. Confirma que el nombre del campo es `fecha_entrada`.
11. **422 sin bandejas en cooling**: repetir el paso 4 sobre la misma siembra S4 con otra fecha → 422 `SIEMBRA_SIN_BANDEJAS_EN_COOLING`, y `GET /siembras/S4` confirma que las fechas del paso 4 **no** se modificaron (US3: no se puede re-fechar).
12. **404 siembra inexistente / de otro tenant**: `POST` con un uuid inexistente → 404 `SIEMBRA_NOT_FOUND`, con y sin `fecha_entrada`.
13. **Auditoría**: tras los pasos 1 y 4, verificar en los logs de auditoría que la acción `INGRESO_NURSERY` registra `extra.fechaEntrada` = `null` (paso 1) y `"2026-07-20"` (paso 4).

## Regresión

- `GET /siembras/:id` y `GET /siembras` devuelven exactamente el mismo shape que antes (ningún campo agregado, renombrado ni eliminado).
- `GET /bandejas?sortBy=fecha_entrada_nursery&sortDir=desc` sigue funcionando y ordena correctamente mezclando bandejas con fecha retroactiva y con fecha automática.
- El conteo de bandejas movidas en el paso 4 coincide con el total de bandejas en `cooling_period` de esa siembra (confirma que los filtros nuevos `tenant_id` y `deleted_at IS NULL` no excluyen filas legítimas).
- El trasplante (nursery → mesa) sigue registrando `fecha_trasplante` con el instante real; no acepta fecha informada.
