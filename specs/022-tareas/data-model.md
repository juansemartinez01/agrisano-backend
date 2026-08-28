# Data Model: Módulo de tareas

**Feature**: `022-tareas` | **Date**: 2026-08-28

## Resumen

Una sola tabla nueva (`tareas`) y dos tipos enum nuevos. No se modifica ninguna tabla existente.

---

## Tipos enum

| Tipo | Valores | Notas |
|---|---|---|
| `tarea_ambito` | `nursery`, `greenhouse` | Ampliable con `ALTER TYPE ... ADD VALUE`. Ver research D1 |
| `tarea_estado` | `pendiente`, `en_progreso`, `completada`, `cancelada` | Transiciones controladas en el service, no en la base |

Los nombres de tipo se declaran explícitamente con `enumName` en la entidad, como ya hacen `mesa_estado`, `aplicacion_contexto` y `quimico_rate_unidad`. Sin `enumName`, TypeORM genera un nombre derivado de la tabla y la columna que resulta imposible de referenciar limpiamente en migraciones posteriores.

---

## Tabla `tareas`

La entidad extiende `BaseEntity` (`src/common/database/base.entity.ts`), que aporta `id`, `tenant_id`, `created_at`, `updated_at` y `deleted_at`.

| Columna | Tipo | Null | Default | Descripción |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK — de `BaseEntity` |
| `tenant_id` | uuid | sí | — | Cliente dueño de la tarea. De `BaseEntity`. En la práctica siempre presente: el service usa `strictTenant` |
| `establecimiento_id` | uuid | no | — | Establecimiento al que pertenece. Inmutable |
| `ambito` | `tarea_ambito` | no | — | Clasificación operativa. Inmutable |
| `estado` | `tarea_estado` | no | `pendiente` | Situación actual |
| `titulo` | varchar(150) | no | — | Qué hay que hacer. Se guarda trimmeado |
| `descripcion` | text | sí | `null` | Detalle libre |
| `asignado_a_usuario_id` | uuid | sí | `null` | Responsable. `null` = la toma quien pueda |
| `orden` | int | no | — | Posición dentro de `(tenant_id, establecimiento_id, ambito)`. Al crear: `MAX + 1` |
| `creada_por_usuario_id` | uuid | no | — | Del JWT, nunca del body |
| `completada_at` | timestamptz | sí | `null` | Se setea al entrar en `completada`, se limpia al reabrir |
| `completada_por_usuario_id` | uuid | sí | `null` | Ídem. Puede diferir del asignado |
| `created_at` | timestamptz | no | `now()` | De `BaseEntity` |
| `updated_at` | timestamptz | no | `now()` | De `BaseEntity` |
| `deleted_at` | timestamptz | sí | `null` | Soft delete — de `BaseEntity` |

### Por qué `varchar(150)` en `titulo`

Coherente con las longitudes ya usadas en el proyecto (`users.email` 150, `mesas.nombre` 100, `proveedores.nombre` 150). Un título más largo que eso es una descripción, y para eso está `descripcion`.

### Campos deliberadamente ausentes

- **Columnas snapshot de usuario** (`usuario_email_snapshot`, etc.): ver research D4.
- **`prioridad` y `fecha_limite`**: fuera de alcance decidido; la prioridad se expresa con `orden`.
- **Vínculo a mesa/siembra/túnel**: ver research D2.

---

## Índices

| Nombre | Columnas | Para qué |
|---|---|---|
| `IDX_tareas_tenant_id` | `tenant_id` | Lo crea `BaseEntity` con `@Index()` |
| `IDX_tareas_tablero` | `tenant_id, establecimiento_id, ambito, orden` | Listado ordenado del tablero y cálculo del `MAX(orden)` al crear |
| `IDX_tareas_estado` | `tenant_id, establecimiento_id, estado` | Filtro por estado, el más frecuente después del tablero |
| `IDX_tareas_asignado` | `tenant_id, asignado_a_usuario_id` `WHERE asignado_a_usuario_id IS NOT NULL` | Filtro "mis tareas". Parcial porque la mayoría de las filas tendrá `null` |

No hay índice único: dos tareas pueden llamarse igual, y `orden` puede repetirse entre activas y cerradas por diseño (ver research D6).

---

## Claves foráneas

| Columna | Referencia | ON DELETE | Motivo |
|---|---|---|---|
| `establecimiento_id` | `establecimientos(id)` | `NO ACTION` | Una tarea sin establecimiento no tiene sentido; los establecimientos se borran lógicamente, no físicamente |
| `asignado_a_usuario_id` | `users(id)` | `NO ACTION` | Ídem: los usuarios se dan de baja con `is_active` o `deleted_at`, la fila permanece |
| `creada_por_usuario_id` | `users(id)` | `NO ACTION` | Dato de auditoría, nunca debe perderse |
| `completada_por_usuario_id` | `users(id)` | `NO ACTION` | Ídem |

`NO ACTION` en las cuatro, sin `CASCADE` ni `SET NULL`: el proyecto no borra físicamente ninguna de esas entidades, así que una cascada solo podría dispararse por un borrado manual en la base, y en ese caso es preferible que falle a que se pierda el rastro. Sigue el criterio de la migración `1772700000000-AddMissingForeignKeys.ts`.

---

## Máquina de estados

```text
                 ┌──────────────┐
       ┌────────►│  pendiente   │◄────────┐
       │         └──────┬───────┘         │
       │                │                 │  reabrir
       │  soltar        │ iniciar         │  (supervisor+)
       │                ▼                 │
       │         ┌──────────────┐         │
       └─────────┤ en_progreso  │         │
                 └──────┬───────┘         │
                        │                 │
        completar ──────┼────── cancelar  │
                        │                 │
              ┌─────────┴────────┐        │
              ▼                  ▼        │
      ┌──────────────┐   ┌──────────────┐ │
      │  completada  ├───┤  cancelada   ├─┘
      └──────────────┘   └──────────────┘
```

### Matriz de transiciones

| Desde \ Hacia | `pendiente` | `en_progreso` | `completada` | `cancelada` |
|---|---|---|---|---|
| `pendiente` | ✗ | ✓ | ✓ | ✓ |
| `en_progreso` | ✓ | ✗ | ✓ | ✓ |
| `completada` | ✓ *(supervisor+)* | ✗ | ✗ | ✗ |
| `cancelada` | ✓ *(supervisor+)* | ✗ | ✗ | ✗ |

Toda celda ✗ responde 422 `TAREA_TRANSICION_INVALIDA`, incluida la diagonal (transición a sí mismo).

### Efectos colaterales de cada transición

| Transición | Efecto |
|---|---|
| cualquiera → `completada` | `completada_at = now()`, `completada_por_usuario_id = actor` |
| `completada` → `pendiente` | `completada_at = null`, `completada_por_usuario_id = null` |
| `cancelada` → `pendiente` | Sin efectos adicionales (cancelar nunca escribió los campos de cierre) |
| resto | Solo cambia `estado` |

En ninguna transición cambia `orden`: la tarea no se mueve de tablero.

---

## Invariantes

1. `tenant_id` presente en toda fila creada por la API (`strictTenant`).
2. `establecimiento_id` y `ambito` nunca cambian después del INSERT.
3. `completada_at` y `completada_por_usuario_id` están ambos seteados o ambos en `null`, y solo pueden estar seteados si `estado = 'completada'`.
4. `orden` es único entre las tareas **activas** (`pendiente`, `en_progreso`) no borradas de un mismo `(tenant_id, establecimiento_id, ambito)`. No se declara como constraint porque el reordenamiento reasigna varias filas a la vez; se garantiza en el service dentro de la transacción.
5. `asignado_a_usuario_id`, cuando no es `null`, referencia a un usuario del mismo tenant (o global).
6. Todo `ORDER BY` incluye `id` como último criterio de desempate.

---

## Relaciones con entidades existentes

```text
establecimientos 1 ──── N tareas
users            1 ──── N tareas   (creada_por)
users            1 ──── N tareas   (asignado_a, opcional)
users            1 ──── N tareas   (completada_por, opcional)
```

Ninguna entidad existente se modifica ni gana columnas. El módulo es puramente aditivo: si se elimina la tabla `tareas`, el resto del sistema funciona exactamente igual.

---

## Forma de lectura (DTO de salida)

Las lecturas no devuelven la fila cruda: los tres ids de usuario se resuelven a un objeto con la forma compartida `UsuarioResumen` (`{ id, email, nombre, apellido }`), con una sola consulta batch por página.

```jsonc
{
  "id": "uuid",
  "establecimiento_id": "uuid",
  "ambito": "nursery",
  "estado": "pendiente",
  "titulo": "Revisar bandejas del sector 3",
  "descripcion": null,
  "orden": 4,
  "asignado_a": { "id": "uuid", "email": "...", "nombre": "...", "apellido": "..." },
  "creada_por": { "id": "uuid", "email": "...", "nombre": "...", "apellido": "..." },
  "completada_at": null,
  "completada_por": null,
  "created_at": "2026-08-28T13:04:11.000Z",
  "updated_at": "2026-08-28T13:04:11.000Z"
}
```

`asignado_a`, `creada_por` y `completada_por` son `null` cuando no aplican. Nunca se expone `password_hash` ni ningún otro campo de `users` fuera de los cuatro de `UsuarioResumen`.

---

## Migración

Archivo: `migrations/1774700000000-TareasInit.ts` (el timestamp sigue a `1774600000000-RateUnidadHectarea.ts`, la última existente).

**`up`**: `CREATE TYPE` de los dos enums → `CREATE TABLE tareas` → los cuatro índices → las cuatro FKs.

**`down`**: reverso exacto — FKs, índices, `DROP TABLE`, `DROP TYPE` de ambos enums. A diferencia de las migraciones que solo agregan valores a un enum existente, ésta **sí tiene un `down` completo y verificable**, porque crea sus propios tipos y puede destruirlos.
