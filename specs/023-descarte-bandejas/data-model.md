# Data Model: Descarte de bandejas

**Feature**: `023-descarte-bandejas` | **Date**: 2026-09-06

## Diagrama de relaciones

```
siembras 1 ── N bandejas 1 ── 0..1 bandeja_descartes
                  │                      │
                  │                      └── N ── 1 users (responsable, con snapshot)
                  │
                  └── 0..1 mesas (mesa_id, si fue trasplantada)
```

`bandeja_descartes` tiene **PK sobre `bandeja_id`**: como máximo una pérdida por bandeja, garantizado por la base. Es append-only: no se actualiza ni se elimina, y por eso no lleva `updated_at` ni `deleted_at`.

## Entidad nueva: `BandejaDescarte`

Tabla: `bandeja_descartes`

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `bandeja_id` | uuid | NO | — | **PK**. FK → `bandejas(id)`. Uno a uno con la bandeja perdida. |
| `tenant_id` | uuid | SÍ | — | Aislamiento por cliente. Indexado. Nullable como en `BaseEntity`. |
| `estado_anterior` | `bandeja_estado` | NO | — | Estado de la bandeja inmediatamente antes del descarte. Nunca `descartada`. |
| `motivo` | `bandeja_descarte_motivo` | NO | — | Causa de la pérdida. Indexado. |
| `observaciones` | text | SÍ | NULL | Texto libre. Obligatorio cuando el motivo es el genérico (regla de aplicación). |
| `fecha_descarte` | timestamptz | NO | `now()` | Fecha del incidente, no de la carga. Indexado. |
| `usuario_id` | uuid | NO | — | FK → `users(id)`. Quien registró la pérdida. |
| `usuario_email_snapshot` | varchar(150) | SÍ | NULL | Snapshot al momento del registro. |
| `usuario_nombre_snapshot` | varchar(100) | SÍ | NULL | Snapshot al momento del registro. |
| `usuario_apellido_snapshot` | varchar(100) | SÍ | NULL | Snapshot al momento del registro. |
| `created_at` | timestamptz | NO | `now()` | Fecha de carga en el sistema. Distinta de `fecha_descarte` si hubo carga retroactiva. |

### Por qué no extiende `BaseEntity`

`BaseEntity` aporta `id` propio, `updated_at` y `deleted_at`. Ninguno aplica: la identidad del descarte **es** la bandeja (por eso la PK), y un registro append-only e irreversible no se actualiza ni se borra lógicamente. Se declaran a mano las columnas que sí corresponden, siguiendo el mismo criterio que `mesa_bandeja`.

### Índices

| Índice | Columnas | Para qué |
|---|---|---|
| `PK_bandeja_descartes` | `bandeja_id` | Identidad + garantía de unicidad del descarte |
| `IDX_bandeja_descartes_tenant_id` | `tenant_id` | Aislamiento, presente en todas las consultas |
| `IDX_bandeja_descartes_motivo` | `motivo` | Análisis de mermas por causa |
| `IDX_bandeja_descartes_fecha` | `fecha_descarte` | Filtro por rango de fechas |

### Restricciones

- FK `bandeja_id` → `bandejas(id)`: no puede existir una pérdida de una bandeja inexistente.
- FK `usuario_id` → `users(id)`: el responsable existe al momento del registro; si luego se elimina, los snapshots preservan quién fue.
- Sin `ON DELETE CASCADE`: las bandejas no se borran físicamente (soft delete), y la constancia de la pérdida no debe poder desaparecer por un borrado en cascada.

## Enums

### `bandeja_estado` (existente, se agrega un valor)

| Valor | Significado |
|---|---|
| `cooling_period` | Sembrada, en período de enfriado |
| `en_nursery` | En el nursery, disponible para trasplante |
| `trasplantada` | Trasplantada a una mesa |
| `descartada` | **NUEVO**. Perdida. Estado terminal. |

Se agrega en su propia migración: Postgres no permite usar un valor de enum recién agregado en la misma transacción que lo agregó, y TypeORM corre todas las migraciones pendientes en una sola transacción. Precedente en el repo: `1772200000000-BandejaCoolingPeriod.ts`.

### `bandeja_descarte_motivo` (nuevo)

| Valor | Significado |
|---|---|
| `caida` | Se cayó al suelo |
| `rotura` | La bandeja física se rompió |
| `contaminacion` | Contaminación del sustrato o los plantines |
| `plaga` | Pérdida por plaga o enfermedad |
| `mala_germinacion` | Germinación insuficiente, no vale trasplantarla |
| `error_carga` | La bandeja nunca debió existir: error al registrar la siembra |
| `otro` | Cualquier otra causa. **Exige observaciones.** |

Conjunto cerrado. Incorporar un motivo es un `ALTER TYPE`, no una pantalla de administración.

### `historial_tipo_evento` (existente, se agrega un valor)

Se agrega `bandeja_descartada`, para dejar constancia en el historial de la mesa cuando la bandeja perdida estaba trasplantada. El `detalle` (jsonb) lleva `bandeja_id`, `motivo`, `observaciones` y `fecha_descarte`.

## Transiciones de estado de la bandeja

| Desde | Hacia | Disparador | Guarda en el UPDATE |
|---|---|---|---|
| `cooling_period` | `en_nursery` | Ingreso a nursery | estado = cooling_period |
| `en_nursery` | `trasplantada` | Trasplante a mesa | estado = en_nursery |
| `cooling_period` | `descartada` | Registro de pérdida | estado <> descartada |
| `en_nursery` | `descartada` | Registro de pérdida | estado <> descartada |
| `trasplantada` | `descartada` | Registro de pérdida | estado <> descartada |
| `descartada` | *(cualquiera)* | — | **Imposible.** Estado terminal. |

Las guardas viven en el `WHERE` de cada `UPDATE`, no en un `if` previo. Hoy trasplante y aplicaciones químicas validan el estado fuera de la transacción y escriben sin guarda; esta feature lo corrige.

## Operación de descarte (SQL)

Tres sentencias, en una transacción, con costo independiente de la cantidad de bandejas.

```sql
-- 1) Bloqueo y verificacion de elegibilidad
SELECT b.id, b.estado, b.mesa_id, b.establecimiento_id,
       b.fecha_trasplante, b.fecha_entrada_nursery, s.fecha AS fecha_siembra
  FROM bandejas b
  JOIN siembras s ON s.id = b.siembra_id
 WHERE b.id = ANY($1::uuid[]) AND b.tenant_id = $2 AND b.deleted_at IS NULL
   FOR UPDATE OF b;
-- ids faltantes         -> 404 BANDEJA_NOT_FOUND                 (details.ids)
-- estado descartada     -> 409 BANDEJA_YA_DESCARTADA             (details.ids)
-- fecha < ultimo hecho  -> 422 BANDEJA_DESCARTE_FECHA_INVALIDA   (details.ids)

-- 2) Constancia append-only; estado_anterior sale de la fila ya bloqueada
INSERT INTO bandeja_descartes
  (bandeja_id, tenant_id, estado_anterior, motivo, observaciones,
   fecha_descarte, usuario_id,
   usuario_email_snapshot, usuario_nombre_snapshot, usuario_apellido_snapshot)
SELECT b.id, b.tenant_id, b.estado, $3, $4, $5, $6, $7, $8, $9
  FROM bandejas b
 WHERE b.id = ANY($1::uuid[]) AND b.tenant_id = $2;

-- 3) Transicion con guarda
UPDATE bandejas
   SET estado = 'descartada', updated_at = now()
 WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado <> 'descartada';
```

Si alguna bandeja estaba `trasplantada`, se agrega un `INSERT` por conjunto en `historial_mesa` para las mesas involucradas.

`estado_anterior` se toma de la fila bloqueada dentro de la misma transacción, nunca del request: no hay ventana entre leer el estado y guardarlo.

## Lo que la operación NO toca

Enumerado explícitamente porque es la garantía de la User Story 5:

- `mesa_bandeja`: el vínculo con la mesa se conserva. La trazabilidad reconstruye el ciclo desde esta tabla.
- `aplicaciones_quimicas` y sus detalles: las aplicaciones recibidas por la bandeja siguen registradas.
- `bandejas.carencia_hasta`, `mesa_id`, `fecha_trasplante`, `fecha_entrada_nursery`: intactos.
- `mesas` y sus cosechas: no se modifican. `plantas_estimadas` no se recalcula (fuera de alcance, decisión explícita del negocio).
- Stock de lotes: la siembra no descuenta stock hoy; la pérdida tampoco lo devuelve.

Solo cambian dos cosas: `bandejas.estado` y una fila nueva en `bandeja_descartes` (más el evento de historial de la mesa cuando corresponde).

## Impacto en consultas existentes

| Consulta | Impacto |
|---|---|
| `listBandejas` | Hoy fuerza el estado a `en_nursery` cuando no se envía filtro. Pasa a filtro opcional real que excluye las descartadas por defecto, admite pedirlas explícitamente, agrega filtro `mesa_id` y desempate por `id` en el orden. |
| `getBandeja` | Devuelve `descarte` (objeto o `null`) con LEFT JOIN a `bandeja_descartes`. |
| `trasplante` | Sin cambios en esta feature: la guarda de estado en el `UPDATE` llega en la rama prerrequisito. Su efecto es que una bandeja descartada ya no puede trasplantarse. |
| `aplicaciones-quimicas` | Ídem: la guarda llega en la rama prerrequisito y evita aplicar químicos a una bandeja perdida. |
| `trazabilidad` | `bandejas_ciclo` suma `descarte` (objeto o `null`). La bandeja sigue apareciendo en el ciclo. |
| `deleteSiembra` | El `count` de bloqueo pasa a contar trasplantadas **y** descartadas. Se le suma el filtro `tenant_id` por Principio II (defensa en profundidad: hoy no es explotable, porque el `count` filtra por `siembra_id` y la siembra ya viene con scope de tenant). |
| `lotes.remove` | Sin cambios: ya cuenta bandejas en cualquier estado, y una bandeja perdida no debe liberar sus lotes. |
