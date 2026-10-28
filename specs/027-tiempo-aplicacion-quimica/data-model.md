# Data Model: Tiempo de ejecución de la aplicación química

## Entidad `aplicaciones_quimicas` (cambios)

| Columna | Tipo | Null | Notas |
|---------|------|------|-------|
| `fecha_hora` (existente) | `timestamptz` default `now()` | NO | **Siempre = `fecha_hora_fin`** en filas nuevas. Ancla de carencia / orden / filtros / ciclo de trazabilidad |
| `fecha_hora_inicio` (nueva) | `timestamptz` | SÍ | Momento en que el operario empezó. NULL en filas anteriores a la feature |
| `fecha_hora_fin` (nueva) | `timestamptz` | SÍ | Momento en que terminó. NULL en filas anteriores |

`duracion_segundos` **no es columna**: se calcula al leer (`round((fin − inicio)/1000)`, `null`
si falta algún extremo).

### Restricciones de base (migración `1775200000000-AplicacionQuimicaInicioFin`)

```sql
ALTER TABLE "aplicaciones_quimicas" ADD "fecha_hora_inicio" timestamptz;
ALTER TABLE "aplicaciones_quimicas" ADD "fecha_hora_fin" timestamptz;

ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_fin_eq_fecha_hora"
  CHECK ("fecha_hora_fin" IS NULL OR "fecha_hora_fin" = "fecha_hora");
ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_inicio_fin_par"
  CHECK (("fecha_hora_inicio" IS NULL) = ("fecha_hora_fin" IS NULL));
ALTER TABLE "aplicaciones_quimicas" ADD CONSTRAINT "CHK_aplicacion_inicio_lte_fin"
  CHECK ("fecha_hora_inicio" IS NULL OR "fecha_hora_inicio" <= "fecha_hora_fin");
```

`down`: `DROP CONSTRAINT` de los tres y `DROP COLUMN` de las dos columnas.

Sin backfill (FR-023), sin índice nuevo.

La duración máxima (24 h) y la tolerancia de futuro (5 min) **no** se ponen en la base: son
reglas de negocio que dependen de "ahora" y pueden ajustarse sin migración; viven en el helper.

### Entidad TypeORM

```ts
@Column({ type: 'timestamptz', nullable: true })
fecha_hora_inicio!: Date | null;

@Column({ type: 'timestamptz', nullable: true })
fecha_hora_fin!: Date | null;
```

## Reglas de validación (helper `resolverTiempoAplicacion`)

| # | Regla | Cuándo aplica | Error |
|---|-------|---------------|-------|
| V1 | inicio y fin tienen fecha+hora+zona | DTO (class-validator) | 400 |
| V2 | `inicio` presente | POST siempre | 400 (DTO) |
| V3 | `inicio <= fin` | siempre | 422 `APLICACION_HORARIO_INVALIDO` |
| V4 | `fin <= ahora + 5 min` | POST, o PATCH que envía `fin` | 422 `APLICACION_HORARIO_INVALIDO` |
| V5 | `fin − inicio <= 24 h` | siempre | 422 `APLICACION_DURACION_EXCESIVA` |
| V6 | si la fila no tiene horarios (vieja), PATCH debe enviar ambos | PATCH sobre fila vieja | 422 `APLICACION_HORARIO_INVALIDO` |
| V7 | `create` en PATCH de grupo sin horarios y grupo sin horarios de referencia | PATCH grupo | 422 `APLICACION_HORARIO_INVALIDO` |

Orden de evaluación: V1 → V3 → V4 → V5 (V6/V7 antes de V3 al resolver el par).

## Transiciones de estado del par

| Operación | inicio | fin | fecha_hora |
|-----------|--------|-----|------------|
| POST | requerido | `fin ?? ahora` | = fin |
| PATCH solo `fecha_hora_inicio` | nuevo | guardado | sin cambio |
| PATCH solo `fecha_hora_fin` | guardado | nuevo | = nuevo fin |
| PATCH ambos | nuevo | nuevo | = nuevo fin |
| PATCH grupo (`update`/`create`) | nivel grupo | nivel grupo | = fin |
| `create` en PATCH grupo sin horarios | hereda | hereda | = fin heredado |

Todo cambio de inicio o fin dispara el recálculo de carencia de los targets afectados.

## Datos derivados en respuestas

| Campo | Fuente |
|-------|--------|
| `fecha_hora` | columna (= fin en filas nuevas) — se sigue devolviendo |
| `fecha_hora_inicio` | columna (ISO UTC o `null`) |
| `fecha_hora_fin` | columna (ISO UTC o `null`) |
| `duracion_segundos` | derivado, entero o `null` |

## Historial de mesa (`historial_mesa.detalle` JSON)

Eventos `aplicacion_quimica` y `en_carencia` agregan:

```json
{ "fecha_hora_inicio": "2026-10-28T11:00:00.000Z", "fecha_hora_fin": "2026-10-28T11:45:00.000Z" }
```

y su fecha de evento es el fin de la aplicación. Sin cambios de esquema.

## Compatibilidad con datos existentes

- Filas viejas: inicio/fin/duración `null`; `fecha_hora` intacto; todo sigue funcionando.
- Grupos mixtos (filas viejas + nuevas): permitido; la herencia usa solo filas con horarios.
