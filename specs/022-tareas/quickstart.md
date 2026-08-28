# Quickstart: Módulo de tareas

## Compilación y lint

```bash
npx tsc --noEmit
```

```bash
npx eslint "src/modules/tareas/**/*.ts" "src/common/errors/error-codes.ts" "migrations/1774700000000-TareasInit.ts"
```

```bash
npx jest src/modules/tareas/tareas.service.spec.ts
```

No correr `eslint` sobre todo el repo: `.prettierrc` (printWidth 80) no coincide con el ancho real usado en el código (~100), así que el lint se mantiene acotado a los globs tocados por esta feature.

## Migración

```bash
npm run db:migration:run
```

Verificar en la base que existen los dos tipos y la tabla:

```sql
SELECT typname FROM pg_type WHERE typname IN ('tarea_ambito', 'tarea_estado');
SELECT indexname FROM pg_indexes WHERE tablename = 'tareas';
```

Deben aparecer los dos tipos y los cuatro índices (`IDX_tareas_tenant_id`, `IDX_tareas_tablero`, `IDX_tareas_estado`, `IDX_tareas_asignado`).

## Preparación (verificación funcional en dev)

Entorno: `https://agrisano-backend-production.up.railway.app`

Header obligatorio en **todas** las requests, incluido `/auth/login`: `x-tenant-id`. Se usa el tenant de **pruebas** para no ensuciar datos reales:

- Tenant de pruebas: `00000000-0000-0000-0000-000000000002`
- Tenant productivo: `00000000-0000-0000-0000-000000000001` (no usar acá)

```powershell
$TENANT = "00000000-0000-0000-0000-000000000002"
$BASE = "https://agrisano-backend-production.up.railway.app"

$login = Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post `
  -Headers @{ "x-tenant-id" = $TENANT } -ContentType "application/json" `
  -Body '{"email":"admin@agrisano.com","password":"Admin1234!"}'

$headers = @{ Authorization = "Bearer $($login.access_token)"; "x-tenant-id" = $TENANT }
```

Si el tenant de pruebas no tiene usuarios cargados, correr la verificación contra el productivo y **borrar al final** todas las tareas creadas durante la prueba (paso 30).

Fixtures necesarios, obtenidos en el momento en vez de hardcodeados:

```powershell
# Establecimiento de trabajo
$est = (Invoke-RestMethod -Uri "$BASE/establecimientos?limit=1" -Headers $headers).data[0].id

# Un usuario operario y uno supervisor del tenant (para probar roles y asignación)
Invoke-RestMethod -Uri "$BASE/users?limit=50" -Headers $headers | ConvertTo-Json -Depth 4
```

Se necesitan tokens de tres roles distintos: `operario`, `supervisor` y `admin_global`.

## Verificación funcional

### Creación y valores por defecto

1. **Crear con lo mínimo**: `POST /tareas` con `{ establecimiento_id, ambito: "nursery", titulo: "Tarea A" }` → 201, `estado: "pendiente"`, `orden: 1` (si el tablero estaba vacío), `descripcion: null`, `asignado_a: null`, `completada_at: null`, y `creada_por` con los datos del usuario del token (FR-001, FR-005, FR-011).
2. **El orden se autoincrementa por tablero**: crear "Tarea B" y "Tarea C" en el mismo establecimiento y ámbito → `orden` 2 y 3. Crear "Tarea D" con `ambito: "greenhouse"` → vuelve a `orden: 1`, porque el tablero es la combinación establecimiento + ámbito (FR-014).
3. **Campos no aceptados en el body**: `POST /tareas` con `{ ..., "estado": "completada" }` o `{ ..., "orden": 99 }` → 400 de validación (`forbidNonWhitelisted`), no se crea nada.
4. **Título obligatorio y acotado**: título vacío, solo espacios, o de más de 150 caracteres → 400. Un título con espacios al principio y al final se guarda trimmeado.
5. **Establecimiento inexistente**: `POST /tareas` con un uuid de establecimiento que no existe en el tenant → 404 `ESTABLECIMIENTO_NOT_FOUND`.
6. **Asignado inválido**: `POST /tareas` con `asignado_a_usuario_id` de un uuid que no es usuario del tenant (FR-012) → 422 `TAREA_ASIGNADO_INVALIDO`.
7. **Operario no puede crear**: con token de `operario`, `POST /tareas` → 403 `AUTH_FORBIDDEN` (FR-001).

### Listado, filtros y orden

8. **Listado por tablero**: `GET /tareas?establecimiento_id=$est&ambito=nursery` → devuelve A, B y C en orden 1, 2, 3, con `meta.total = 3`.
9. **Filtros**: `?estado=pendiente`, `?ambito=greenhouse` y `?q=tarea a` devuelven subconjuntos coherentes; `?asignado_a=me` con el token de un usuario devuelve solo las tareas asignadas a ese usuario, y ninguna si no tiene (FR-016).
10. **`/tareas/ambitos` no se confunde con un id**: `GET /tareas/ambitos` → 200 con `[{ value: "nursery", ... }, { value: "greenhouse", ... }]`, **no** un 404 `TAREA_NOT_FOUND` ni un 400 por uuid inválido. Es el caso de colisión de rutas más fácil de romper al reordenar el controller (FR-003, FR-004).
11. **Paginación estable**: con al menos 5 tareas en un tablero, pedir `?limit=2&page=1`, `page=2` y `page=3` → los ids no se repiten entre páginas y la unión de las tres páginas es exactamente el conjunto completo (FR-017, SC-007). Repetir la secuencia dos veces seguidas: el resultado debe ser idéntico.
12. **Sort whitelist**: `?sortBy=titulo&sortOrder=ASC` ordena alfabéticamente; `?sortBy=password` (columna no permitida) no rompe y cae al orden por defecto (`orden ASC`).

### Estados

13. **Camino feliz completo**: con token de `operario`, sobre la Tarea A: `POST /tareas/:id/estado` con `en_progreso` → 200; luego `completada` → 200 con `completada_at` seteada y `completada_por` igual al operario (FR-006, FR-009).
14. **Transición a sí mismo rechazada**: repetir `POST /tareas/:id/estado` con `completada` sobre la tarea ya completada → 422 `TAREA_TRANSICION_INVALIDA` con `details: { from: "completada", to: "completada" }` (FR-008).
15. **Transición inválida rechazada**: sobre la tarea completada, pedir `en_progreso` → 422 `TAREA_TRANSICION_INVALIDA`.
16. **Reapertura solo supervisor+**: con token de `operario`, pedir `pendiente` sobre la tarea completada → 403 `AUTH_FORBIDDEN`. Con token de `supervisor`, la misma llamada → 200, `estado: "pendiente"`, y `completada_at` y `completada_por` vueltos a `null` (FR-007, FR-010).
17. **Cancelar y reabrir**: `cancelada` sobre la Tarea B con token de operario → 200 sin tocar `completada_at`; luego `pendiente` con token de supervisor → 200.

### Edición y borrado

18. **Editar los tres campos permitidos**: `PATCH /tareas/:id` con `{ titulo, descripcion, asignado_a_usuario_id }` → 200 con los valores nuevos; mandar `asignado_a_usuario_id: null` desasigna (FR-013).
19. **Campos inmutables**: `PATCH /tareas/:id` con `{ "ambito": "greenhouse" }`, `{ "establecimiento_id": "..." }`, `{ "estado": "completada" }` o `{ "orden": 1 }` → 400 `TAREA_FIELD_IMMUTABLE`, y la tarea queda sin cambios (FR-002, FR-013).
20. **Soft delete**: `DELETE /tareas/:id` sobre la Tarea C → 200; `GET /tareas/:id` de esa tarea → 404 `TAREA_NOT_FOUND`; el listado del tablero ya no la incluye y `meta.total` baja en uno (FR-018).
21. **Operario no puede editar ni borrar**: con token de `operario`, `PATCH` y `DELETE` → 403 `AUTH_FORBIDDEN`.

### Reordenamiento

22. **Reordenar el tablero**: con las tareas activas del tablero nursery (`GET /tareas?establecimiento_id=$est&ambito=nursery&estado=pendiente` más `estado=en_progreso`), mandar `POST /tareas/reordenar` con los ids invertidos → 200 y `orden` reasignado 1..N en el orden enviado. Volver a listar confirma el orden nuevo (FR-015).
23. **Conjunto incompleto → 422**: repetir el reordenamiento omitiendo un id → 422 `TAREA_REORDEN_INVALIDO` con `details.esperadas` y `details.recibidas`, y el orden anterior intacto (FR-015).
24. **Id ajeno al tablero → 422**: incluir el id de la Tarea D (que es de `greenhouse`) en el reordenamiento de `nursery` → 422 `TAREA_REORDEN_INVALIDO`.
25. **Las cerradas no participan**: completar una tarea del tablero y reordenar mandando solo las activas restantes → 200. Incluir la completada en el array → 422.
26. **Operario no puede reordenar**: con token de `operario` → 403 `AUTH_FORBIDDEN`.

### Aislamiento por tenant

27. **Otro tenant no ve nada**: repetir `GET /tareas` con `x-tenant-id: 00000000-0000-0000-0000-000000000001` y un token válido de ese tenant → ninguna de las tareas creadas en el tenant de pruebas aparece. `GET /tareas/:id` de una tarea del otro tenant → 404 `TAREA_NOT_FOUND`, no 403 ni 200 (FR-019, SC-006).
28. **Sin header de tenant**: `GET /tareas` sin `x-tenant-id` → 400 `TENANT_REQUIRED`, nunca un listado vacío con 200.

### Auditoría

29. **Los cinco eventos quedan registrados**: consultar `audit_logs` (o el endpoint de auditoría) filtrando por las tareas de prueba → aparecen `tarea_created`, `tarea_updated`, `tarea_estado_changed` (con `from` y `to`), `tarea_reordenada` y `tarea_deleted`, cada uno con el usuario correcto (FR-020, SC-004).

### Limpieza

30. **Borrar los datos de prueba**: `DELETE /tareas/:id` sobre todas las tareas creadas durante la verificación. Obligatorio si la prueba se corrió contra el tenant productivo.

## Regresión

Esta feature es puramente aditiva: no modifica ninguna tabla, endpoint ni módulo existente. La regresión se limita a confirmar que el arranque de la app sigue siendo correcto después de registrar `TareasModule`:

- La aplicación levanta sin errores de dependencias (`TareasModule` resuelve `TenancyModule`, `AuditModule` y `EstablecimientosModule`).
- `GET /establecimientos` y `GET /users` siguen respondiendo igual que antes (son los únicos módulos que `tareas` referencia).
- La migración `down()` deja la base exactamente como estaba: `DROP TABLE tareas` y `DROP TYPE` de los dos enums, sin residuos.
