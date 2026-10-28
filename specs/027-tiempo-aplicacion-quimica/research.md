# Research: Tiempo de ejecución de la aplicación química

Todas las decisiones de alcance se tomaron con el usuario en la fase de análisis (sin
`NEEDS CLARIFICATION` abiertos). Este documento deja el porqué técnico y las alternativas
descartadas.

## R1. ¿Qué pasa con `fecha_hora` existente?

- **Decisión**: se conserva y pasa a ser siempre igual a `fecha_hora_fin`. CHECK en base
  (`fecha_hora_fin IS NULL OR fecha_hora_fin = fecha_hora`).
- **Por qué**: `fecha_hora` es el ancla de carencia, orden por defecto, filtros
  `fecha_desde/hasta`, ventana de ciclo en trazabilidad y fecha de los eventos de historial.
  Mantenerla igual al fin deja todo ese código y sus consultas sin cambios (menor superficie
  de regresión) y las filas viejas siguen siendo válidas.
- **Alternativas descartadas**:
  - *Renombrar `fecha_hora` a `fecha_hora_fin`*: obliga a tocar ~60 usos en servicio,
    trazabilidad y consultas SQL crudas, y rompe lectores externos (scripts SQL del repo).
  - *Que `fecha_hora` pase a ser el inicio*: cambiaría el significado de carencia/ciclo para
    aplicaciones nuevas vs. viejas (inconsistencia entre filas).
  - *Solo convención sin CHECK*: un UPDATE crudo (hay varios en el servicio) podría desfasarlas
    sin que nadie lo note; el CHECK lo vuelve imposible.

## R2. Carencia desde el fin

- **Decisión**: `carencia_hasta = fin + días`.
- **Por qué**: criterio conservador; el período de espera empieza al terminar de aplicar.
  Al ser `fecha_hora = fin`, las consultas que ya usan `fecha_hora` quedan correctas sin tocarlas.

## R3. Cálculo de `carencia_hasta` en UTC

- **Hallazgo**: `recomputeCarenciaHastaBatch` usa `new Date(r.fecha_hora)` + `setDate` (hora
  local del proceso) y `toISOString().split('T')[0]` (UTC); trazabilidad usa `setUTCDate`.
  Es consistente solo si el proceso corre en UTC.
- **Decisión**: util común `calcularCarenciaHasta(fin, dias)` con `setUTCDate`, usado por
  ambos. Producción (contenedor Railway) corre en UTC, por lo que no cambia ningún valor
  ya calculado; solo elimina la dependencia de la zona del servidor (p. ej. entorno local).
- **Consecuencia documentada**: el día se toma en UTC. Una aplicación que termina a las 22:00
  hora Argentina (01:00 UTC del día siguiente) cuenta la carencia desde el día UTC siguiente
  (un día más: lado conservador). Es el comportamiento que ya tenía trazabilidad.

## R4. Validación de formato: `IsISO8601` no alcanza

- **Hallazgo**: `@IsISO8601()` acepta `2026-10-28` (solo fecha) y hora sin zona; un horario
  sin zona se interpretaría en la zona del servidor y uno sin hora sería medianoche, ambos
  silenciosamente erróneos para medir minutos de trabajo.
- **Decisión**: validador propio `@IsFechaHoraConZona()` (regex de fecha+hora+`Z`/offset y
  verificación de fecha real). Mismo patrón que `IsDosis` (`ValidateBy` + `buildMessage`).
- **Alternativa descartada**: `@IsISO8601({ strict: true })` — sigue permitiendo fecha sola.

## R5. Reglas de negocio de los horarios

| Regla | Valor | Motivo |
|-------|-------|--------|
| `inicio <= fin` | igualdad permitida | un registro instantáneo (inicio == fin) es válido; duración 0 |
| `fin <= ahora + 5 min` | tolerancia 5 min | desfase habitual del reloj del celular del operario |
| `fin - inicio <= 24 h` | máximo 24 h | corta errores de tipeo de fecha (día/mes) sin impedir turnos que cruzan medianoche |
| Código HTTP | 422 con código de dominio | igual que `SIEMBRA_FECHA_ENTRADA_INVALIDA` (spec 018); formato → 400 |

El "futuro" se valida solo sobre `fin` y solo cuando `fin` se envía (en una corrección que
toca solo el inicio no se vuelve a evaluar un fin ya guardado).

## R6. Alta: inicio obligatorio, fin opcional

- **Decisión**: POST exige `fecha_hora_inicio`; `fecha_hora_fin` opcional con default `now`.
  Mismo patrón que la spec 018 (`fecha_entrada` retroactiva con default a hoy).
- **Por qué**: el operario típicamente marca "empecé" y al terminar manda el registro; el
  backend no necesita que el cliente repita la hora actual. Inicio obligatorio desde el día
  uno evita acumular filas nuevas sin duración (decisión del usuario; deploy coordinado).

## R7. PATCH: reemplazo de `fecha_hora`

- **Decisión**: `fecha_hora` deja de aceptarse en PATCH de fila y de grupo (se reemplaza por
  inicio/fin). Si llega solo uno de los dos, se valida contra el otro ya guardado. Si la
  fila es vieja (sin horarios) hay que mandar ambos.
- **Por qué**: aceptar `fecha_hora` suelto permitiría mover el fin sin pasar por la validación
  del par. Es un cambio de contrato (breaking) documentado en el handoff.

## R8. Operation group (>200 targets en varios POST)

- **Decisión**: cada chunk lleva el mismo inicio y fin (los manda el cliente; es una sola
  acción lógica del operario). En PATCH de grupo son campos de nivel grupo. Un `create` sin
  horarios hereda de la primera fila del grupo con horarios (`created_at, id`).
- **Por qué**: el backend no puede inferir que dos POST distintos son una misma acción sin
  `operation_group_id`; confiar en el cliente es consistente con cómo ya se reparte
  `cantidad` por chunk. Para evitar ambigüedad, la regla de herencia es determinística.
- **Caso borde**: grupo cuyas filas son todas viejas (sin horarios) y un `create` sin
  horarios → error explícito en vez de inventar un valor.

## R9. Duración derivada, no almacenada

- **Decisión**: `duracion_segundos = round((fin − inicio) / 1000)`, calculada al leer;
  `null` si faltan extremos.
- **Por qué**: dato redundante almacenado puede desincronizarse; el costo de calcularlo es
  trivial. Con el CHECK de orden no puede ser negativa.

## R10. Historial de mesa

- **Decisión**: los eventos `aplicacion_quimica` y `en_carencia` toman `fecha = fin` e
  incluyen `fecha_hora_inicio`/`fecha_hora_fin` en `detalle` (JSON, sin migración de
  `historial_mesa`).
- **Por qué**: el historial no tenía esa información y es la vista cronológica de la mesa;
  el detalle JSON ya es el lugar de metadatos del evento.

## R11. Índices y reportes

- **Decisión**: no se agrega índice ni reporte agregado. El orden por defecto sigue sobre
  `fecha_hora`. Si luego se pide "promedio por operario/túnel", se evalúa un índice y un
  endpoint de reporte en otra spec.

## R12. Migración y despliegue

- Migración aditiva: `ADD COLUMN ... NULL` es de metadatos en Postgres (instantáneo, sin
  reescribir la tabla); los CHECK se validan sobre filas con NULL (pasan por la rama
  `IS NULL`). Corre sola al arrancar la app (como 024/025).
- Orden de despliegue: backend con la migración y front actualizado en la misma ventana;
  entre ambos, el front viejo no podrá crear aplicaciones (decisión aceptada).
- Registro en prod: verificar en la tabla `migrations` de Railway que quedó
  `AplicacionQuimicaInicioFin1775200000000` (consulta de solo lectura).
