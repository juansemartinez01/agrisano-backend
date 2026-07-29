# Research: Fecha de entrada a nursery retroactiva

**Feature**: 018-fecha-entrada-nursery-retroactiva | **Date**: 2026-07-29

No quedaron marcadores `NEEDS CLARIFICATION` en el Technical Context: las ocho decisiones de negocio se cerraron con el solicitante antes del spec. Este documento registra las cinco decisiones **técnicas** que quedaban por resolver.

---

## D1 — Anclaje horario del día informado

**Decision**: una fecha pasada `YYYY-MM-DD` se persiste como `new Date("YYYY-MM-DDT12:00:00.000Z")`, es decir el **mediodía UTC** de ese día.

**Rationale**: la columna es `timestamptz`, así que hay que elegir un instante para representar un día. El proyecto **no tiene ninguna noción de zona horaria** (no hay campo `timezone` en `establecimientos`, ni configuración TZ, ni conversión en ningún service), por lo que no se puede anclar al mediodía "local del establecimiento". El mediodía UTC preserva el día calendario para cualquier observador entre UTC-11 y UTC+11, que cubre toda América (Argentina UTC-3, Chile UTC-3/-4, Brasil UTC-3, México UTC-6, etc.) con más de 8 horas de margen a cada lado. Es la opción de menor costo que elimina por completo el corrimiento de un día.

**Alternatives considered**:
- **`00:00:00Z` (medianoche UTC)**: es la interpretación literal de un `date`, pero un cliente en UTC-3 renderizando ese instante ve el **día anterior a las 21:00**. Es exactamente el bug que hay que evitar.
- **`23:59:59Z`**: corre el día en sentido contrario para husos al este; mismo problema, espejado.
- **Cambiar la columna a `date`**: destruiría la precisión horaria de todos los registros existentes y requeriría migración, tocando también el `sortBy` de `GET /bandejas`. Desproporcionado.
- **Introducir timezone por establecimiento**: es la solución "correcta" a largo plazo, pero es una feature en sí misma (campo, migración, backfill, conversión en todos los flujos de fecha). Fuera de alcance. El anclaje a 12:00 UTC es compatible con esa evolución futura: si algún día se agrega TZ, el dato guardado sigue resolviendo al día correcto sin migración.

---

## D2 — Excepción para el día de hoy

**Decision**: si la fecha informada es igual al día actual (UTC), se usa `() => 'now()'` en lugar del ancla de las 12:00 UTC.

**Rationale**: sin esta excepción, un registro hecho hoy a las 09:00 UTC quedaría guardado a las 12:00 UTC — **tres horas en el futuro**. Además de ser un dato falso, un `timestamptz` futuro en una columna de "cuándo pasó esto" es una anomalía que ensucia cualquier reporte o comparación posterior. Con la excepción, el caso más frecuente (mover hoy lo que pasó hoy) queda **byte por byte idéntico** al comportamiento actual del sistema, lo que reduce a cero el riesgo de regresión en el camino feliz.

**Alternatives considered**:
- **Anclar siempre a 12:00 UTC**: simplifica el código en tres líneas a cambio de guardar instantes futuros. Rechazado.
- **`min(12:00 UTC, now())`**: evita el futuro pero produce un valor arbitrario y difícil de explicar (a veces la hora real, a veces el mediodía). Peor de ambos mundos.

---

## D3 — Validación del formato de fecha

**Decision**: `@Matches(/^\d{4}-\d{2}-\d{2}$/)` en el DTO (400 vía ValidationPipe) + verificación de **validez calendaria** en el service por round-trip (`new Date(...)` reformateado a `YYYY-MM-DD` debe coincidir con el input), que devuelve 422 `SIEMBRA_FECHA_ENTRADA_INVALIDA`.

**Rationale**: el contrato acordado es un **día calendario sin hora**. `@IsDateString()` aceptaría `"2026-07-20T10:00:00Z"` y `"2026-07-20T23:00:00-05:00"`, reintroduciendo por la ventana la ambigüedad horaria que D1 cierra por la puerta. El regex fija el contrato de forma exacta y produce un mensaje de error claro. Ahora bien, el regex por sí solo acepta `2026-02-31` y `2026-13-01` (son sintácticamente correctos), y `new Date("2026-02-31...")` en JS **no falla**: hace roll-over al 3 de marzo. Por eso hace falta el round-trip: reconstruir y comparar detecta cualquier fecha inexistente antes de tocar la base.

**Alternatives considered**:
- **`@IsDateString()` solo**: acepta timestamps completos. Rechazado por lo anterior.
- **`@IsDateString({ strict: true })`**: el flag no existe con esa semántica en class-validator; validator.js no ofrece un modo "solo día" configurable de forma estable.
- **Librería de fechas (date-fns / luxon)**: agregar una dependencia para una validación de cinco líneas no se justifica; el proyecto hoy no tiene ninguna.

---

## D4 — Comparación de fechas para los límites

**Decision**: comparar **strings** `YYYY-MM-DD` con `>` y `<` directamente: `fecha_entrada > hoyUTC` (donde `hoyUTC = new Date().toISOString().split('T')[0]`) y `fecha_entrada < siembra.fecha`.

**Rationale**: en ISO 8601 con campos de ancho fijo y cero a la izquierda, el orden lexicográfico **coincide exactamente** con el cronológico. Comparar strings evita construir objetos `Date`, evita cualquier corrimiento por horas y compara justo lo que el negocio pide: día calendario contra día calendario. Además `siembras.fecha` es una columna `date` que TypeORM entrega ya como string `'YYYY-MM-DD'`, así que no hay conversión intermedia ni riesgo de que el driver le agregue una hora. Es la comparación más simple posible y la que menos supuestos hace.

**Alternatives considered**:
- **Comparar objetos `Date`**: exige normalizar ambos lados a la misma hora antes de comparar; cualquier olvido reintroduce un off-by-one. Más código y más frágil para el mismo resultado.
- **Delegar la comparación a Postgres (`WHERE ... AND :fecha >= siembra.fecha`)**: mezclaría la validación de negocio con el UPDATE y haría imposible distinguir "fecha inválida" de "no hay bandejas en cooling" — ambos colapsarían en `affected = 0` y un solo código de error. Rompe FR-007.

---

## D5 — Hardening del UPDATE (tenant_id + deleted_at)

**Decision**: agregar `.andWhere('tenant_id = :tenantId')` y `.andWhere('deleted_at IS NULL')` al `UpdateQueryBuilder` existente de `ingresarNursery`.

**Rationale**: hoy el UPDATE filtra solo por `siembra_id` y `estado`, y se apoya en que el `findOne` previo ya verificó que la siembra pertenece al tenant. Es correcto por transitividad, pero es una garantía indirecta: depende de que nadie reordene, extraiga o refactorice ese `findOne`. El principio II de la constitución pide filtro explícito por tenant en toda query de escritura, y el resto del proyecto ya lo hace. Como esta feature edita esa misma query, agregar los dos filtros es costo cero y convierte una invariante implícita en explícita. `deleted_at IS NULL` evita además revivir bandejas soft-deleted, que hoy sí serían alcanzadas por el UPDATE.

**Riesgo de regresión**: nulo. Ambos filtros solo pueden reducir el conjunto afectado, y lo reducen exactamente en las filas que **no debían** actualizarse. Para una siembra sana del tenant correcto, el `affected` es idéntico. El quickstart verifica de todos modos el conteo de bandejas movidas.

**Alternatives considered**:
- **Dejarlo como está**: la feature funcionaría igual, pero se desaprovecha la única oportunidad limpia de corregirlo sin abrir un cambio dedicado.
- **Abrir una feature separada de hardening**: más ceremonia que código; el cambio son dos líneas en la query que ya se está editando.

---

## Resumen de artefactos afectados

| Archivo | Cambio |
|---|---|
| `src/common/errors/error-codes.ts` | + `SIEMBRA_FECHA_ENTRADA_INVALIDA` |
| `src/modules/siembra/dto/ingresar-nursery.dto.ts` | Nuevo (D3) |
| `src/modules/siembra/siembra.service.ts` | D1, D2, D3 (round-trip), D4, D5 |
| `src/modules/siembra/siembra.controller.ts` | `@Body()` + fecha en auditoría |
| `docs/siembra-frontend.md` | Contrato del endpoint |
| `postman/siembra.postman_collection.json` | Body del request |
