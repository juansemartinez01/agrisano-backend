# Contrato HTTP: cambios por la feature 027

Solo se listan los endpoints de aplicaciones químicas que cambian. Formato de fecha-hora:
ISO-8601 **con hora y zona** (`2026-10-28T08:00:00-03:00` o `...Z`). Una fecha sola
(`2026-10-28`) o una hora sin zona se rechaza con 400.

## POST `/aplicaciones-quimicas` (operario, supervisor, admin_global)

Campos nuevos en el body:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `fecha_hora_inicio` | **Sí** | Cuándo empezó la aplicación |
| `fecha_hora_fin` | No | Cuándo terminó; si falta, el momento del registro |

Ejemplo:

```json
{
  "establecimiento_id": "…",
  "contexto": "greenhouse",
  "lote_quimico_id": "…",
  "dosis": 0.00025,
  "cantidad": 0.5,
  "mesa_ids": ["…"],
  "fecha_hora_inicio": "2026-10-28T08:00:00-03:00",
  "fecha_hora_fin": "2026-10-28T08:45:00-03:00"
}
```

Con `operation_group_id` (pedidos de más de 200 targets en varios POST): **cada chunk envía el
mismo inicio y el mismo fin**.

Errores nuevos:

| HTTP | code | Cuándo |
|------|------|--------|
| 400 | (validación) | falta `fecha_hora_inicio` o un valor sin hora/zona |
| 422 | `APLICACION_HORARIO_INVALIDO` | fin < inicio, o fin más de 5 min en el futuro |
| 422 | `APLICACION_DURACION_EXCESIVA` | fin − inicio > 24 h |

## PATCH `/aplicaciones-quimicas/:id` (supervisor, admin_global)

- **Se quita** `fecha_hora` (enviarlo devuelve 400 `BAD_REQUEST` "property fecha_hora should not exist", de la validación global de campos desconocidos).
- **Se agregan** `fecha_hora_inicio` y `fecha_hora_fin`, ambos opcionales. Si se envía solo uno
  se valida contra el otro ya guardado. Sobre una aplicación vieja (sin horarios) hay que enviar
  los dos.
- Cambiar inicio o fin recalcula la carencia de los targets afectados.
- Errores: los mismos 422 de arriba.

## PATCH `/aplicaciones-quimicas/operation-group/:operation_group_id` (supervisor, admin_global)

- **Se quita** `fecha_hora` de nivel grupo; **se agregan** `fecha_hora_inicio` y
  `fecha_hora_fin` de nivel grupo, que se aplican a toda fila creada o actualizada en el request.
- Un item `create` sin horarios hereda los del grupo (primera fila con horarios, por orden de
  creación). Si el grupo no tiene ninguna fila con horarios y no se enviaron a nivel grupo →
  422 `APLICACION_HORARIO_INVALIDO`.

## GET (respuestas)

Aplican a: `GET /aplicaciones-quimicas`, `GET /aplicaciones-quimicas/:id`,
`GET /mesas/:id/aplicaciones`, `GET /bandejas/:id/aplicaciones` y a la lista de aplicaciones
dentro de trazabilidad de cosecha.

Campos nuevos en cada aplicación:

| Campo | Tipo | Notas |
|-------|------|-------|
| `fecha_hora_inicio` | `string (ISO UTC) \| null` | `null` en aplicaciones antiguas |
| `fecha_hora_fin` | `string (ISO UTC) \| null` | `null` en aplicaciones antiguas |
| `duracion_segundos` | `number \| null` | derivado; `null` si falta algún extremo |

`fecha_hora` se sigue devolviendo y, en aplicaciones nuevas, es igual a `fecha_hora_fin`.

### GET `/aplicaciones-quimicas` (query)

- `sortBy` acepta además `fecha_hora_inicio` (las aplicaciones antiguas, sin inicio, quedan
  al final en ambos sentidos).
- `fecha_desde` / `fecha_hasta` y el orden por defecto siguen aplicándose sobre `fecha_hora`
  (= fin).

### Historial de mesa

Los eventos `aplicacion_quimica` y `en_carencia` incluyen `fecha_hora_inicio` y
`fecha_hora_fin` en `detalle`.
