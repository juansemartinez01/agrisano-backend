# Contrato: `POST /lotes/:id/rehabilitar`

## Request

| Campo | Valor |
|---|---|
| Método | `POST` |
| Path | `/lotes/:id/rehabilitar` |
| Auth | `JwtAuthGuard` (Bearer token) |
| Headers | `x-tenant-id` (requerido) |
| Roles | `supervisor`, `admin_global` — **no** `operario` (decisión explícita del solicitante) |
| Body | Ninguno |

## Semántica

Revierte un lote `consumido` a `habilitado`: vuelve a aparecer en listados/validaciones de disponibilidad. Limpia toda la metadata de consumo (`fecha_consumido`, `usuario_consumido_id` y sus 3 snapshots, `observaciones_consumo` → todos a `NULL`) — estas columnas describen el estado actual, no un historial; el hecho de que existió un ciclo consumido→rehabilitado queda registrado en `audit_logs` vía las dos acciones auditadas, no en columnas del lote.

Transición atómica: si el lote ya no está `consumido` en el momento del UPDATE (otro supervisor ya lo rehabilitó, o nunca estuvo consumido), responde 409 sin modificar nada.

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
    "estado": "habilitado",
    "fecha_consumido": null,
    "usuario_consumido_id": null,
    "usuario_consumido_email_snapshot": null,
    "usuario_consumido_nombre_snapshot": null,
    "usuario_consumido_apellido_snapshot": null,
    "observaciones_consumo": null,
    "...": "resto de columnas del lote sin cambios"
  }
}
```

### 401 Unauthorized

```json
{ "ok": false, "statusCode": 401, "error": { "code": "AUTH_INVALID", "message": "..." } }
```

### 403 Forbidden — rol `operario` (o cualquier rol fuera de supervisor/admin_global)

```json
{ "ok": false, "statusCode": 403, "error": { "code": "AUTH_FORBIDDEN", "message": "..." } }
```

### 404 Not Found

```json
{ "ok": false, "statusCode": 404, "error": { "code": "LOTE_NOT_FOUND", "message": "Lote no encontrado" } }
```

### 409 Conflict — el lote no estaba consumido

```json
{
  "ok": false,
  "statusCode": 409,
  "error": { "code": "LOTE_NO_CONSUMIDO", "message": "El lote no está consumido" }
}
```

## Tabla de errores

| Estado | Código | Cuándo |
|---|---|---|
| 401 | `AUTH_INVALID` | Token ausente/expirado/inválido |
| 403 | `AUTH_FORBIDDEN` | Rol `operario` u otro sin permiso |
| 404 | `LOTE_NOT_FOUND` | Id no existe o pertenece a otro tenant |
| 409 | `LOTE_NO_CONSUMIDO` | El lote ya estaba `habilitado` (incluye la carrera de doble clic) |

## Auditoría

```json
{
  "requestId": "...",
  "actorUserId": "supervisor-uuid",
  "actorEmail": "supervisor1@agrisano.com",
  "action": "lote_rehabilitado",
  "entity": "lote",
  "extra": { "loteId": "622a5b3f-...", "tipo": "sustrato", "numero_lote": "SUS-2026-014" }
}
```

## Compatibilidad

Endpoint nuevo — no rompe ningún contrato existente.

## Nota para el frontend

- Este botón solo debe mostrarse a usuarios con rol `supervisor` o `admin_global` — un `operario` que lo invoque recibe 403.
- Tras rehabilitar, el lote vuelve a aparecer inmediatamente en cualquier listado filtrado por `disponible=true` o sin filtrar por `estado`.
- No hay forma de recuperar la nota (`observaciones_consumo`) ni la fecha del consumo anterior desde la respuesta de este endpoint una vez rehabilitado — si se necesita ese dato, debe consultarse el log de auditoría (`lote_consumido` previo), no el lote.

---

## Addendum: filtros nuevos en `GET /lotes`

No ameritan un contrato separado — son query params opcionales agregados al endpoint existente `GET /lotes`.

| Query param | Tipo | Efecto |
|---|---|---|
| `estado` | `habilitado` \| `consumido` | Filtra por el valor exacto de `estado`. |
| `disponible` | `true` \| `false` | Atajo combinado: `true` equivale a `estado=habilitado AND activo=true`. Pensado para que el frontend no reimplemente la regla de "disponible para siembra". |

Ambos son opcionales y no alteran el comportamiento de `GET /lotes` sin query params (FR-016). Se pueden combinar con `tipo`, `activo`, `q`, `sortBy`, `sortOrder` ya existentes; `disponible` y `estado`/`activo` explícitos pueden combinarse libremente (el filtro es una condición `AND` más).
