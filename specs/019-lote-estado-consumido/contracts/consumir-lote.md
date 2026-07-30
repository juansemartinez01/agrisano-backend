# Contrato: `POST /lotes/:id/consumir`

## Request

| Campo | Valor |
|---|---|
| Método | `POST` |
| Path | `/lotes/:id/consumir` |
| Auth | `JwtAuthGuard` (Bearer token) |
| Headers | `x-tenant-id` (requerido, como el resto de la API) |
| Roles | `operario`, `supervisor`, `admin_global` |

### Body (opcional)

```json
{
  "observaciones_consumo": "Se terminó el stock físico, quedaron 0 bandejas disponibles"
}
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `observaciones_consumo` | string, máx 2000 | No | Nota libre del motivo. Si se omite, queda `null`. |

## Semántica

Marca el lote como `consumido`: deja de aparecer en cualquier listado/validación de disponibilidad para crear siembras (`GET /lotes?disponible=true`, `createSiembra`), pero sigue siendo consultable por `GET /lotes` (sin filtrar) y `GET /lotes/:id`. No afecta siembras/bandejas ya creadas con este lote.

Es una transición atómica: si dos requests llegan simultáneamente sobre el mismo lote `habilitado`, solo una tiene éxito; la otra recibe 409.

## Respuestas

### 200 OK

```json
{
  "ok": true,
  "data": {
    "id": "622a5b3f-e9d6-4401-a00a-0ff987899458",
    "tipo": "sustrato",
    "numero_lote": "SUS-2026-014",
    "activo": true,
    "estado": "consumido",
    "fecha_consumido": "2026-07-29T15:32:10.000Z",
    "usuario_consumido_id": "a1b2c3d4-...",
    "usuario_consumido_email_snapshot": "operario1@agrisano.com",
    "usuario_consumido_nombre_snapshot": "Juan",
    "usuario_consumido_apellido_snapshot": "Pérez",
    "observaciones_consumo": "Se terminó el stock físico, quedaron 0 bandejas disponibles",
    "...": "resto de columnas del lote sin cambios"
  }
}
```

### 400 Bad Request — body con campos no permitidos (ej. intentar mandar `estado` directamente)

```json
{
  "ok": false,
  "statusCode": 400,
  "error": { "code": "BAD_REQUEST", "message": "property estado should not exist", "details": {} }
}
```

### 401 Unauthorized — token ausente/ inválido

```json
{ "ok": false, "statusCode": 401, "error": { "code": "AUTH_INVALID", "message": "..." } }
```

### 403 Forbidden — rol sin permiso (no debería ocurrir para `consumir`, ya que incluye `operario`; se documenta por completitud del guard)

```json
{ "ok": false, "statusCode": 403, "error": { "code": "AUTH_FORBIDDEN", "message": "..." } }
```

### 404 Not Found — id inexistente o de otro tenant

```json
{ "ok": false, "statusCode": 404, "error": { "code": "LOTE_NOT_FOUND", "message": "Lote no encontrado" } }
```

### 409 Conflict — el lote ya estaba consumido

```json
{
  "ok": false,
  "statusCode": 409,
  "error": { "code": "LOTE_YA_CONSUMIDO", "message": "El lote ya está consumido" }
}
```

## Tabla de errores

| Estado | Código | Cuándo |
|---|---|---|
| 400 | `BAD_REQUEST` | Body con campos fuera del DTO (whitelist) |
| 401 | `AUTH_INVALID` | Token ausente/expirado/inválido |
| 403 | `AUTH_FORBIDDEN` | Rol sin permiso |
| 404 | `LOTE_NOT_FOUND` | Id no existe o pertenece a otro tenant |
| 409 | `LOTE_YA_CONSUMIDO` | El lote ya estaba `consumido` (incluye la carrera de doble clic) |

## Auditoría

```json
{
  "requestId": "...",
  "actorUserId": "a1b2c3d4-...",
  "actorEmail": "operario1@agrisano.com",
  "action": "lote_consumido",
  "entity": "lote",
  "extra": { "loteId": "622a5b3f-...", "tipo": "sustrato", "numero_lote": "SUS-2026-014" }
}
```

Escrito vía `AuditService.write('admin', ...)` + `logger.info(..., 'admin_audit')`, mismo patrón que `create`/`update`/`delete` de `lotes.controller.ts`.

## Compatibilidad

Endpoint nuevo — no rompe ningún contrato existente. `GET /lotes` y `GET /lotes/:id` ganan las columnas nuevas en la respuesta (aditivo, no rompe clientes que ya ignoran campos desconocidos).

## Nota para el frontend

- Mostrar un botón "Marcar como consumido" con un campo de texto opcional para el motivo, visible para cualquier rol operativo.
- Tras un 409 `LOTE_YA_CONSUMIDO`, refrescar el lote (probablemente otro usuario ya lo marcó) en vez de reintentar.
- El lote consumido sigue apareciendo en el listado general (`GET /lotes` sin filtros) — si el frontend quiere ocultarlo de una vista de "lotes disponibles para siembra", debe usar `?disponible=true` o `?estado=habilitado` explícitamente.
