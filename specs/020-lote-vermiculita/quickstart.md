# Quickstart: Lotes de vermiculita con grado

## Compilación, lint y tests

```bash
npx tsc --noEmit
```

```bash
npx eslint "src/modules/lotes/**/*.ts" "src/modules/siembra/**/*.ts" "src/modules/trazabilidad/**/*.ts" "src/modules/aplicaciones-quimicas/**/*.ts" "src/common/errors/error-codes.ts"
```

```bash
npx jest src/modules/lotes/lotes.service.spec.ts src/modules/siembra/siembra.service.spec.ts src/modules/trazabilidad/trazabilidad.service.spec.ts
```

No correr lint sobre todo el repo: `.prettierrc` usa `printWidth` 80 y el repo real
escribe a ~100, así que hay errores preexistentes en masa. El criterio de esta
feature es **no empeorar el baseline de HEAD por archivo**, medido con
`git stash push -- <archivo>` → lint → `git stash pop`. Las migraciones no se
lintean (estilo del CLI de TypeORM).

Baselines conocidos al cerrar la feature: `trazabilidad.service.ts` 57 → 59
(las dos líneas nuevas dentro del `.map()` que prettier ya quería reindentar
entero), `bandeja.service.ts` 2 → 1, resto de archivos tocados en 0.

## Preparación (verificación funcional en dev)

Entorno: `https://agrisano-backend-production.up.railway.app`
Credenciales dev: `{"email": "admin@innoview.local", "password": "admin123"}`
Header obligatorio en **todas** las requests, incluido `/auth/login`:
`x-tenant-id: <uuid del tenant>` (confirmar el valor vigente en dev antes de arrancar).

```powershell
$base = "https://agrisano-backend-production.up.railway.app"
$tenant = "00000000-0000-0000-0000-000000000001"
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post `
  -Headers @{ "x-tenant-id" = $tenant } -ContentType "application/json" `
  -Body '{"email":"admin@innoview.local","password":"admin123"}'
$headers = @{ Authorization = "Bearer $($login.access_token)"; "x-tenant-id" = $tenant }
```

Hace falta además un `establecimiento_id` válido y un lote de semilla y uno de
sustrato `habilitado` + `activo` para poder sembrar (`GET /lotes?disponible=true`).

Roles: `POST /lotes` y `PATCH /lotes/:id` piden `supervisor` o `admin_global`;
`POST /siembras` acepta también `operario`.

## Verificación funcional

### Alta y validación del grado (US1)

1. **Alta de vermiculita con grado**: `POST /lotes` con
   `{"tipo":"vermiculita","numero_lote":"V-001","proveedor_id":"<uuid>","grado":2}`
   → 201, la respuesta trae `"tipo":"vermiculita"`, `"grado":2`,
   `"estado":"habilitado"`, `"activo":true` (FR-001, FR-002).
2. **Grado obligatorio en vermiculita**: mismo POST sin `grado` → 400 de
   validación (FR-003).
3. **Grado fuera del dominio**: mismo POST con `"grado":4` (y con `"grado":0`)
   → 400. Con `"grado":"2"` (string) → 201, porque el `ValidationPipe` global
   convierte tipos (`enableImplicitConversion`); lo que importa es que el valor
   final sea 1, 2 o 3 (FR-004).
4. **Grado prohibido en los otros tipos**: `POST /lotes` con
   `{"tipo":"sustrato", ..., "grado":2}` → 422 `LOTE_GRADO_NO_PERMITIDO`.
   Repetir con `"tipo":"semilla"` → mismo código (FR-005).
5. **Numeración independiente por tipo**: crear `V-001` de vermiculita habiendo
   ya un `V-001` de sustrato (o al revés) → 201, sin 409. Crear dos veces
   `V-001` de vermiculita → la segunda da 409 `LOTE_NUMERO_DUPLICADO` (FR-006).
6. **Edición del grado**: `PATCH /lotes/:id` con `{"grado":3}` sobre el lote de
   vermiculita → 200, `"grado":3` (FR-007).
7. **Edición del grado sobre otro tipo**: `PATCH /lotes/:id` con `{"grado":3}`
   sobre un lote de **sustrato** → 422 `LOTE_GRADO_NO_PERMITIDO`, **no** 500.
   Este es el caso que se rompía si `grado` no entraba en la condición externa
   que carga el lote actual: sin eso la validación se saltea y explota el CHECK
   de la base (FR-008).
8. **`tipo` sigue siendo inmutable**: `PATCH /lotes/:id` con
   `{"tipo":"sustrato"}` sobre el lote de vermiculita → 400.
9. **Filtros**: `GET /lotes?tipo=vermiculita` → solo vermiculita;
   `GET /lotes?tipo=vermiculita&grado=2` → solo las de grado 2;
   `GET /lotes?grado=2` sin `tipo` → devuelve solo vermiculita igual, porque
   semilla y sustrato tienen `grado` NULL (FR-009).
10. **Consumir / rehabilitar**: `POST /lotes/:id/consumir` y luego
    `POST /lotes/:id/rehabilitar` sobre el lote de vermiculita → se comporta
    igual que semilla y sustrato, y `GET /lotes?disponible=true` lo excluye
    mientras está consumido (FR-010).

### Uso en la siembra (US2)

11. **Siembra con vermiculita**: `POST /siembras` con un grupo
    `{"lote_semilla_id":"...","lote_sustrato_id":"...","lote_vermiculita_id":"<uuid>","cantidad":2}`
    → 201, y `GET /siembras/:id` devuelve cada bandeja con
    `lote_vermiculita_id` y el objeto `lote_vermiculita` con
    `{id, numero_lote, tipo, grado}` (FR-011, FR-018).
12. **Siembra sin vermiculita sigue funcionando**: mismo POST omitiendo
    `lote_vermiculita_id` → 201, y en el detalle las bandejas traen
    `lote_vermiculita_id: null` y `lote_vermiculita: null` — **no** desaparecen
    ni fallan (FR-012).
13. **Tipo incorrecto**: `POST /siembras` pasando un lote de **sustrato** como
    `lote_vermiculita_id` → 422 `LOTE_TIPO_INCORRECTO` (FR-013).
14. **Vermiculita consumida**: consumir el lote y volver a sembrar con él
    → 422 `LOTE_CONSUMIDO`. Rehabilitar al terminar (FR-014).
15. **Vermiculita inactiva**: `PATCH` el lote a `{"activo":false}` y sembrar
    → 422 `LOTE_INACTIVO`. Reactivar al terminar (FR-014).
16. **Establecimiento cruzado**: usar un lote de vermiculita atado a otro
    establecimiento → 422 `LOTE_ESTABLECIMIENTO_MISMATCH` (FR-015).
17. **Orden de errores sin cambios**: una siembra con lote de semilla inválido
    **y** vermiculita inválida reporta primero el error de la semilla — la
    validación de vermiculita se agregó al final del grupo justo para no
    cambiar qué error ve el frontend en los casos que ya existían.

### Trazabilidad y reportes (US3)

18. **Trazabilidad con vermiculita**: trasplantar a mesa las bandejas del paso
    11, cosechar, y `GET /trazabilidad/cosecha/:cosecha_id` → cada entrada de
    `bandejas_ciclo` trae `lote_vermiculita_id`, y `siembra.lote_vermiculita`
    con `{id, numero_lote, tipo, grado}` (FR-016).
19. **Trazabilidad de un ciclo anterior a la feature**: `GET` sobre una cosecha
    vieja → las bandejas siguen apareciendo **enteras**, con
    `lote_vermiculita: null` y sin ningún `numero_lote: undefined` colado en
    `lote_semilla`/`lote_sustrato` (SC-007). Este es el punto que más importa
    de toda la batería: es el que detectaría una aserción de no-nulo copiada
    de las líneas vecinas.
20. **Aplicación química en nursery**: registrar una aplicación sobre las
    bandejas del paso 11 y hacer `GET /aplicaciones-quimicas/:id` →
    `targets.seedings[].vermiculite_lot` con `{id, numero_lote, grado}`
    (FR-017).
21. **Grupo heterogéneo degrada a null**: una aplicación sobre bandejas de dos
    siembras con distinta vermiculita → `vermiculite_lot: null` para ese grupo,
    igual que hacen hoy `seed_lot` y `substrate_lot`.
22. **Aplicación sin vermiculita**: aplicación sobre bandejas sin vermiculita
    → `vermiculite_lot: null`, y `seed_lot`/`substrate_lot` intactos.

### Rastreo por partida (US4)

23. **Filtro por lote de vermiculita**: `GET /bandejas?lote_vermiculita_id=<uuid>`
    → devuelve las bandejas sembradas con esa partida, en todos los
    establecimientos del tenant (FR-019). **Cuidado al verificar**: el endpoint
    filtra `estado=en_nursery` si no se manda `estado`, así que una bandeja ya
    trasplantada no aparece. Es el default histórico del listado (`b10f487`),
    no algo que traiga esta feature, y le pasa igual a `lote_semilla_id`; para
    el alcance completo de la partida hay que recorrer los estados.
24. **Filtro con partida sin uso**: mismo GET con un lote recién creado
    → `data: []`, `meta.total: 0`, sin error.

> El envelope de respuesta es `{ok, data, meta:{page,limit,total}}`, no
> `{items, total}`. Vale para todos los pasos de arriba.

## Regresión

- `GET /lotes`, `GET /lotes/:id`, `POST /lotes`, `PATCH /lotes/:id`,
  `DELETE /lotes/:id` para semilla y sustrato: idénticos, salvo el campo
  aditivo `grado: null` en la respuesta.
- `POST /siembras` sin `lote_vermiculita_id`: idéntico al camino previo.
- `DELETE /lotes/:id` sobre un lote de vermiculita en uso → 409
  `LOTE_REFERENCED_BY_BANDEJA` (antes de la feature el conteo no miraba
  `lote_vermiculita_id`, así que un lote en uso se podía borrar).
- Trazabilidad por mesa (`GET /trazabilidad/mesa/:mesa_id`): sin cambios, no
  incluye linaje de lotes.

## Nota para el frontend

Cualquier ternario de dos ramas sobre `tipo` (`tipo === 'semilla' ? ... : ...`)
ahora etiqueta mal la vermiculita como sustrato. Ver
`docs/handoff-frontend-lote-vermiculita.md`.
