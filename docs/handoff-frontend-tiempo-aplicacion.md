# Handoff frontend — inicio y fin de cada aplicación química

**Estado**: implementado en la rama `027-tiempo-aplicacion-quimica`. Pendiente de desplegar.
**Tipo de cambio**: ⚠️ **breaking** en escritura (`POST` exige un campo nuevo; `PATCH` deja de aceptar `fecha_hora`) y **aditivo** en lectura (campos nuevos, nada se quita).
**Orden de despliegue**: **coordinado**. El front viejo no puede crear aplicaciones contra el backend nuevo (falta `fecha_hora_inicio` → `400`) y el front nuevo no funciona contra el backend viejo (campos desconocidos → `400`). Desplegar los dos juntos.

Spec completa: `specs/027-tiempo-aplicacion-quimica/` (contrato en `contracts/api-changes.md`). Referencia general del módulo: [aplicaciones-quimicas-frontend.md](aplicaciones-quimicas-frontend.md).

---

## 1. Qué cambia

Cada aplicación (nursery y greenhouse) registra **cuándo empezó y cuándo terminó** el operario, para saber cuánto tardó.

| Campo | Dónde | Descripción |
|---|---|---|
| `fecha_hora_inicio` | request y response | ISO 8601 con hora **y zona** |
| `fecha_hora_fin` | request y response | ídem |
| `duracion_segundos` | **solo response** | `fin − inicio` en segundos, calculado al leer. No se envía |
| `fecha_hora` | **solo response** | Campo de siempre. Ahora es **siempre igual a `fecha_hora_fin`**. Se sigue devolviendo para no romper lecturas |

Las aplicaciones anteriores a esta feature **no se rellenan**: tienen `fecha_hora_inicio`, `fecha_hora_fin` y `duracion_segundos` en `null`. El front debe tolerar `null` al mostrarlos.

---

## 2. Cambios en los requests (breaking)

### `POST /aplicaciones-quimicas`

```ts
{
  // ...campos de siempre...
  fecha_hora_inicio: string;   // REQUERIDO
  fecha_hora_fin?: string;     // opcional — si falta, el backend usa el instante de la request
}
```

Un request sin `fecha_hora_inicio` responde `400`.

### `PATCH /aplicaciones-quimicas/:id`

`fecha_hora` **ya no se acepta** (`400 BAD_REQUEST`, "property fecha_hora should not exist": lo rechaza la validación global de campos desconocidos). Se reemplaza por `fecha_hora_inicio?` y/o `fecha_hora_fin?`.

- Se puede mandar uno solo: se valida contra el otro ya guardado.
- En una aplicación **vieja** (extremos en `null`) hay que mandar **los dos** o responde `422 APLICACION_HORARIO_INVALIDO`.

### `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id`

Igual: `fecha_hora` se reemplaza por `fecha_hora_inicio?` / `fecha_hora_fin?`, que son de **nivel grupo** (aplican a todas las filas creadas o actualizadas por el request).

- Un ítem `create` hereda los horarios de la fila de referencia del grupo si el body no los trae.
- Si el grupo es viejo (sin horarios) y se agrega un `create`, hay que mandar inicio y fin en el body; si no, `422 APLICACION_HORARIO_INVALIDO` y no se cambia nada.

### Pedidos troceados (`operation_group_id`)

Enviar **el mismo** `fecha_hora_inicio` y `fecha_hora_fin` en cada `POST` del grupo. Si se omite el fin, cada chunk tomaría su propio "ahora" y las filas quedarían con fines distintos.

---

## 3. Formato y validaciones

### Formato (`400` si no se cumple)

ISO 8601 **con hora y zona horaria**:

| Valor | ¿Válido? |
|---|---|
| `2026-10-28T10:00:00-03:00` | ✅ |
| `2026-10-28T13:00:00Z` | ✅ |
| `2026-10-28T13:00:00.000Z` (`new Date().toISOString()`) | ✅ |
| `2026-10-28` (sin hora) | ❌ `400` |
| `2026-10-28T10:00:00` (sin zona) | ❌ `400` |
| texto, número, vacío | ❌ `400` |

Con `Date`, `date.toISOString()` ya sale bien.

### Reglas de negocio (`422`)

| Regla | Código |
|---|---|
| `inicio <= fin` (**iguales se aceptan**) | `APLICACION_HORARIO_INVALIDO` |
| `fin` no puede estar más de **5 minutos** en el futuro (tolerancia por desfase de reloj). Solo se evalúa al crear o cuando se envía `fecha_hora_fin` | `APLICACION_HORARIO_INVALIDO` |
| Duración (`fin − inicio`) **máx. 24 h** | `APLICACION_DURACION_EXCESIVA` |

Respuesta de error de ejemplo:

```json
{ "ok": false, "error": { "code": "APLICACION_HORARIO_INVALIDO", "message": "..." } }
```

---

## 4. Cambios en las respuestas (aditivos)

`fecha_hora_inicio`, `fecha_hora_fin` y `duracion_segundos` aparecen en:

- `POST /aplicaciones-quimicas` → `data.aplicacion` (`fecha_hora_inicio`/`fecha_hora_fin`).
- `GET /aplicaciones-quimicas` (cada item) y `GET /mesas/:mesa_id/aplicaciones`, `GET /bandejas/:bandeja_id/aplicaciones`.
- `GET /aplicaciones-quimicas/:id` → `data.aplicacion`; ambos `PATCH` devuelven el mismo shape.
- Trazabilidad (`aplicaciones_nursery` y `aplicaciones_greenhouse`, por cosecha y por mesa).
- Historial de mesa: el `detalle` de los eventos `aplicacion_quimica` y `en_carencia` ahora trae `fecha_hora_inicio`/`fecha_hora_fin` (ISO; `null` si el evento no los tiene).

### Listados

- `sortBy` acepta además `fecha_hora_inicio` (las filas sin inicio van al final). El default sigue siendo `fecha_hora`.
- `fecha_desde` / `fecha_hasta` siguen filtrando por `fecha_hora` (o sea, por el **fin**).

---

## 5. Carencia (WHP)

- `carencia_hasta` se cuenta desde el **fin** de la aplicación (`fecha_hora_fin`), no desde el inicio.
- El cálculo es ahora **siempre en UTC**: día UTC del fin + `withholding_period_dias`, formato `YYYY-MM-DD`. Antes dependía de la zona horaria del servidor; una aplicación hecha cerca de medianoche puede caer un día distinto al que se veía antes.
- Editar inicio o fin dispara el recálculo de carencia de todos los targets afectados, igual que editar químicos o targets.
- En trazabilidad, `carencia_hasta_calculada` **no cambia de formato** (sigue siendo un datetime ISO).

---

## 6. Checklist para el front

- [ ] Formulario de creación: pedir **fecha/hora de inicio** (obligatoria) y fin (opcional); enviar con zona (`toISOString()`).
- [ ] En pedidos troceados, mandar el mismo inicio/fin en todos los chunks.
- [ ] Formulario de corrección (fila y grupo): reemplazar `fecha_hora` por `fecha_hora_inicio`/`fecha_hora_fin`. En aplicaciones viejas, enviar ambos.
- [ ] Manejar `422 APLICACION_HORARIO_INVALIDO` y `APLICACION_DURACION_EXCESIVA`, y `400` por formato.
- [ ] Mostrar inicio, fin y `duracion_segundos` en tarjetas/detalle/trazabilidad; tolerar `null` en aplicaciones viejas.
- [ ] Dejar de leer/escribir `fecha_hora` como "momento de la aplicación" en pantallas nuevas (se mantiene solo por compatibilidad y es igual al fin).
- [ ] Desplegar junto con el backend.

---

## 7. Notas de despliegue (backend)

- Migración `1775200000000-AplicacionQuimicaInicioFin`: agrega las dos columnas `timestamptz` nullables y tres `CHECK` (`fecha_hora_fin = fecha_hora`, ambos extremos presentes o ausentes a la vez, `inicio <= fin`). Filas existentes quedan en `NULL`; los `CHECK` no las rechazan.
- No hay backfill ni índices nuevos.
