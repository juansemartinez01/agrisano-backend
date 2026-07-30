# Data Model: Estado de consumido para lotes de semilla y sustrato

## Migración

`migrations/1774400000000-LoteEstadoConsumido.ts` — agrega un enum y 6 columnas a `lotes`. Sin backfill: `DEFAULT 'habilitado'` cubre todas las filas existentes (consistente con FR-002 — todo lote, nuevo o preexistente, es `habilitado` salvo que alguien lo consuma explícitamente).

```sql
-- up
CREATE TYPE lotes_estado_enum AS ENUM ('habilitado', 'consumido');

ALTER TABLE lotes
  ADD COLUMN estado lotes_estado_enum NOT NULL DEFAULT 'habilitado',
  ADD COLUMN fecha_consumido timestamptz NULL,
  ADD COLUMN usuario_consumido_id uuid NULL,
  ADD COLUMN usuario_consumido_email_snapshot varchar NULL,
  ADD COLUMN usuario_consumido_nombre_snapshot varchar NULL,
  ADD COLUMN usuario_consumido_apellido_snapshot varchar NULL,
  ADD COLUMN observaciones_consumo text NULL;

-- down
ALTER TABLE lotes
  DROP COLUMN estado,
  DROP COLUMN fecha_consumido,
  DROP COLUMN usuario_consumido_id,
  DROP COLUMN usuario_consumido_email_snapshot,
  DROP COLUMN usuario_consumido_nombre_snapshot,
  DROP COLUMN usuario_consumido_apellido_snapshot,
  DROP COLUMN observaciones_consumo;

DROP TYPE lotes_estado_enum;
```

## Entidad: `Lote` (campos nuevos)

| Campo | Tipo | Rol en esta feature |
|---|---|---|
| `estado` | `LoteEstado` enum (`habilitado`\|`consumido`), NOT NULL, default `habilitado` | Eje nuevo, independiente de `activo`. Único campo que determina si el lote puede usarse en `createSiembra` junto con `activo`. |
| `fecha_consumido` | `timestamptz`, nullable | Cuándo se marcó consumido. `NULL` mientras esté `habilitado`; se limpia al rehabilitar (no es historial). |
| `usuario_consumido_id` | `uuid`, nullable, sin FK | Quién lo consumió (mismo criterio "sin FK" que el resto del codebase). |
| `usuario_consumido_email_snapshot` / `_nombre_snapshot` / `_apellido_snapshot` | `varchar`, nullable | Snapshot del usuario al momento de consumir, para no depender de que el usuario siga existiendo/activo (mismo patrón que `usuario_email_snapshot` en `siembras`/`cosechas`, ver `usuario-resumen.util.ts`). |
| `observaciones_consumo` | `text`, nullable | Nota opcional del motivo de consumo (FR-004). Independiente de `observaciones` (campo general del lote, D5 en research.md). |

`activo` (ya existente, `boolean default true`) **no cambia** — sigue siendo la baja administrativa, eje totalmente independiente de `estado` (FR-010, edge case de spec.md).

## Máquina de estados: `estado`

```text
        POST /lotes (create)
                │
                ▼
         ┌─────────────┐
         │  habilitado  │◄────────────────┐
         └──────┬───────┘                 │
                │ POST /:id/consumir      │ POST /:id/rehabilitar
                │ (operario+)             │ (solo supervisor+)
                ▼                         │
         ┌─────────────┐                 │
         │  consumido   │─────────────────┘
         └─────────────┘
```

- Solo dos transiciones válidas, cada una vía su endpoint dedicado — **no** existe una transición vía `PATCH /lotes/:id` (FR-019, D6 en research.md).
- `consumir` sobre un lote ya `consumido` → 409 `LOTE_YA_CONSUMIDO`, sin alterar el registro de consumo original (FR-005).
- `rehabilitar` sobre un lote ya `habilitado` → 409 `LOTE_NO_CONSUMIDO` (FR-008).
- Ambas transiciones son atómicas por fila (UPDATE condicional, ver research.md D2) — no requieren transacción explícita porque no tocan más de una fila ni más de una tabla (además del `INSERT` en `audit_logs`, que corre después y fuera del alcance del `AppError` si la transición ya falló).

## Reglas de validación

| # | Regla | Dónde | Respuesta |
|---|---|---|---|
| V1 | `consumir` requiere `estado = habilitado` en el momento del UPDATE | `LotesService.consumirLote` | 409 `LOTE_YA_CONSUMIDO` si no |
| V2 | `rehabilitar` requiere `estado = consumido` en el momento del UPDATE | `LotesService.rehabilitarLote` | 409 `LOTE_NO_CONSUMIDO` si no |
| V3 | `rehabilitar` requiere rol `supervisor` o `admin_global` | `RolesGuard` sobre el controller | 403 `AUTH_FORBIDDEN` (guard estándar, sin código nuevo) |
| V4 | `consumir` requiere rol `operario`, `supervisor` o `admin_global` | `RolesGuard` sobre el controller | 403 `AUTH_FORBIDDEN` si rol distinto |
| V5 | `createSiembra` rechaza cualquier lote (semilla o sustrato) con `estado = consumido` | `SiembraService.createSiembra` | 422 `LOTE_CONSUMIDO`, identifica cuál lote |
| V6 | `createSiembra` rechaza cualquier lote (semilla o sustrato) con `activo = false` | `SiembraService.createSiembra` | 422 `LOTE_INACTIVO`, identifica cuál lote |
| V7 | `estado` no es aceptado en `POST`/`PATCH /lotes` (whitelist) | `ValidationPipe` global | 400 `BAD_REQUEST` genérico (sin código nuevo, D6) |
| V8 | id inexistente/de otro tenant en cualquier operación sobre `lotes` | `mustFindById` | 404 `LOTE_NOT_FOUND` (ya existente, sin cambios) |

## Códigos de error nuevos

| Código | Estado HTTP | Nuevo |
|---|---|---|
| `LOTE_CONSUMIDO` | 422 | ✅ |
| `LOTE_INACTIVO` | 422 | ✅ |
| `LOTE_YA_CONSUMIDO` | 409 | ✅ |
| `LOTE_NO_CONSUMIDO` | 409 | ✅ |

## Invariantes preservadas

- `activo` y `estado` son ejes ortogonales — ninguna transición de uno modifica al otro (FR-010).
- Marcar/revertir consumo **nunca** modifica siembras, bandejas ni cualquier otro registro existente (FR-016) — no hay cascada, trigger ni FK que lo permita.
- Editar `numero_lote`, `observaciones`, `marca_id`, etc. vía `PATCH /lotes/:id` sigue funcionando exactamente igual sobre un lote `consumido` (FR-017) — `UpdateLoteDto` no valida ni depende de `estado`.
- El listado sin filtros de `GET /lotes` no cambia de tamaño ni de orden por esta feature (FR-016 / SC-005) — `estado`/`disponible` son estrictamente opt-in.
- Ningún lote puede pasar a `consumido` fuera de `POST /:id/consumir`, ni a `habilitado` fuera de `POST /:id/rehabilitar` o su creación inicial (FR-019).
