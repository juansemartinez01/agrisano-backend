# Quickstart: Estado de consumido para lotes de semilla y sustrato

## Compilación y lint

```bash
npx tsc --noEmit
npx eslint "src/modules/lotes/**/*.ts" "src/modules/siembra/**/*.ts" "src/common/errors/error-codes.ts" "migrations/1774400000000-LoteEstadoConsumido.ts"
npx jest src/modules/lotes/lotes.service.spec.ts src/modules/siembra/siembra.service.spec.ts
```

No correr `eslint`/lint sobre todo el repo — `.prettierrc` (printWidth 80) no coincide con el ancho real usado en el repo (~100); mantener el lint acotado a los globs tocados por esta feature.

## Preparación (verificación funcional en dev)

Entorno: `https://agrisano-backend-production.up.railway.app`
Credenciales: `{"email": "admin@agrisano.com", "password": "Admin1234!"}`
Header obligatorio en **todas** las requests, incluido `/auth/login`: `x-tenant-id: 00000000-0000-0000-0000-000000000001`

```powershell
$login = Invoke-RestMethod -Uri "https://agrisano-backend-production.up.railway.app/auth/login" `
  -Method Post -Headers @{ "x-tenant-id" = "00000000-0000-0000-0000-000000000001" } `
  -ContentType "application/json" -Body '{"email":"admin@agrisano.com","password":"Admin1234!"}'
$token = $login.access_token
$headers = @{ Authorization = "Bearer $token"; "x-tenant-id" = "00000000-0000-0000-0000-000000000001" }
```

Fixtures ya existentes en dev a reutilizar:
- Lote semilla: `14e715e1-9e98-4f89-bdb0-89aa7586936a`
- Lote sustrato: `622a5b3f-e9d6-4401-a00a-0ff987899458`
- Establecimiento: `00bb7c42-01fc-43ab-b4b7-39c4f18350e2`

Se necesitará además un usuario `operario` y uno `supervisor` (o reusar los que ya existan en dev) para probar el enforcement de roles en `consumir`/`rehabilitar`.

## Verificación funcional

1. **Migración aplicada sin romper nada existente**: `GET /lotes` (sin filtros) devuelve la misma cantidad de items que antes de desplegar, y cada item trae `"estado": "habilitado"` por defecto (backfill vía `DEFAULT`).
2. **`POST /lotes` crea en `habilitado`**: crear un lote nuevo (semilla o sustrato) y confirmar que la respuesta trae `"estado": "habilitado"`, `fecha_consumido: null`, `usuario_consumido_id: null` (FR-002).
3. **Operario puede consumir**: con token de `operario`, `POST /lotes/:id/consumir` con `{"observaciones_consumo": "prueba"}` sobre un lote `habilitado` → 200, `estado: "consumido"`, `fecha_consumido` seteada, `observaciones_consumo` guardada.
4. **Operario NO puede rehabilitar**: con el mismo token de `operario`, `POST /lotes/:id/rehabilitar` sobre el lote recién consumido → 403 `AUTH_FORBIDDEN`.
5. **Supervisor puede rehabilitar**: con token de `supervisor`, `POST /lotes/:id/rehabilitar` sobre ese lote → 200, `estado: "habilitado"`, y los 5 campos de metadata de consumo (`fecha_consumido`, `usuario_consumido_id`, 3 snapshots, `observaciones_consumo`) vueltos a `null`.
6. **Doble consumir → 409**: `POST /lotes/:id/consumir` dos veces seguidas sobre el mismo lote → la segunda responde 409 `LOTE_YA_CONSUMIDO`, y el primer registro de consumo no se altera (repetir `GET /lotes/:id` entre medio para confirmar que la primera fecha/usuario persiste).
7. **Doble rehabilitar → 409**: `POST /lotes/:id/rehabilitar` sobre un lote ya `habilitado` → 409 `LOTE_NO_CONSUMIDO`.
8. **Filtro `disponible=true` excluye consumidos**: consumir un lote de prueba, luego `GET /lotes?disponible=true` → el lote consumido no aparece; `GET /lotes` sin filtros → sigue apareciendo.
9. **Filtro `disponible=true` excluye inactivos**: `PATCH /lotes/:id` con `{"activo": false}` sobre un lote habilitado, luego `GET /lotes?disponible=true` → tampoco aparece, aunque `estado` siga en `habilitado` (confirma que `activo` y `estado` son ejes independientes evaluados juntos solo en el filtro combinado).
10. **Filtro `estado=consumido` funciona**: `GET /lotes?estado=consumido` → devuelve únicamente lotes marcados como consumidos, sin importar `activo`.
11. **`createSiembra` rechaza lote de semilla consumido**: consumir el lote semilla `14e715e1-...`, luego `POST /siembras` referenciándolo → 422 `LOTE_CONSUMIDO`, mensaje identifica `lote_semilla_id`. Rehabilitar el lote al terminar la prueba.
12. **`createSiembra` rechaza lote de sustrato consumido**: mismo test con el lote sustrato `622a5b3f-...` → 422 `LOTE_CONSUMIDO`, mensaje identifica `lote_sustrato_id`. Rehabilitar al terminar.
13. **`createSiembra` rechaza lote inactivo (no solo consumido)**: `PATCH` un lote a `activo: false` (sin tocar `estado`), luego `POST /siembras` con ese lote → 422 `LOTE_INACTIVO` (cierra el gap que existía antes de esta feature, donde `activo=false` no se chequeaba en `createSiembra`). Reactivar al terminar.
14. **Historial previo no se ve afectado**: antes de consumir un lote, anotar una siembra/bandeja existente que lo referencie (`GET /siembras/:id` o `GET /bandejas?lote_semilla_id=...`); consumir el lote; repetir la misma consulta → la siembra/bandeja sigue idéntica, sin cambios (FR-016).
15. **`PATCH /lotes/:id` con `estado` en el body → 400**: `PATCH /lotes/:id` con `{"estado": "consumido"}` → 400 `BAD_REQUEST` (whitelist), el lote no cambia de estado por esa vía (FR-019).

## Regresión

- `GET /lotes`, `GET /lotes/:id`, `POST /lotes`, `PATCH /lotes/:id`, `DELETE /lotes/:id` — comportamiento idéntico al actual salvo por los campos nuevos aditivos en la respuesta.
- `POST /siembras` con lotes `habilitado` + `activo` — sigue funcionando exactamente igual que antes (los guards nuevos solo agregan rechazos, no tocan el camino feliz).
- Ningún otro módulo (`lotes-quimicos`, `marcas`, `trazabilidad`, `cosecha`, `packing`, `trasplante`, `aplicaciones-quimicas`) se ve afectado — no referencian `lotes.estado`.
