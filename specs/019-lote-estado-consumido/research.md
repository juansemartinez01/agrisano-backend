# Research: Estado de consumido para lotes de semilla y sustrato

Las decisiones de **negocio** (modelo de dos ejes activo/estado, roles de reversión, alcance de filtros, enforcement en `createSiembra`, observaciones opcionales, tests en alcance) ya fueron cerradas explícitamente con el solicitante antes de escribir `spec.md` y no se repiten aquí. Este documento cubre únicamente las decisiones **técnicas** necesarias para implementar esas decisiones sobre el código real.

## D1: Nombrado de columnas `usuario_consumido_*` (prefijadas) en vez de las claves canónicas del helper compartido

**Decisión**: Las nuevas columnas se llaman `usuario_consumido_id`, `usuario_consumido_email_snapshot`, `usuario_consumido_nombre_snapshot`, `usuario_consumido_apellido_snapshot` — prefijadas con `consumido`, no los nombres canónicos (`usuario_id`, `usuario_email_snapshot`, ...) que usa `src/common/utils/usuario-resumen.util.ts` en `siembras`, `cosechas`, `lotes_packing`, etc.

**Rationale**: `lotes` no tiene (ni tuvo nunca) un `usuario_id` de "quién lo creó" — a diferencia de esas otras tablas, donde `usuario_id` significa "quién hizo el registro". Acá `usuario_id` significaría específicamente "quién lo consumió", y como la reversión debe **borrar** ese dato (D4), reusar el nombre canónico habría sido ambiguo si en el futuro se agrega un `usuario_id` de "quién creó el lote". El prefijo deja la intención explícita y evita colisión futura.

**Implicación de código**: `fetchUsuarioSnapshot()` sigue devolviendo las claves canónicas (`usuario_email_snapshot`, `usuario_nombre_snapshot`, `usuario_apellido_snapshot`) sin modificarse — se remapean a mano a las columnas prefijadas en el `.set()` de `consumirLote` (ver plan.md §5). No se toca el helper compartido para no afectar a los demás módulos que lo consumen.

**Alternativas consideradas**:
- Modificar `usuario-resumen.util.ts` para aceptar un prefijo configurable → rechazada, over-engineering para un solo caso de uso; el resto del código nunca necesitó esa flexibilidad.
- Usar los nombres canónicos igual → rechazada por la ambigüedad futura descrita arriba.

## D2: UPDATE atómico condicional en vez de read-then-write

**Decisión**: `consumirLote` y `rehabilitarLote` usan un `UPDATE ... WHERE id = :id AND tenant_id = :tenantId AND estado = <esperado>` y verifican `result.affected === 0` para decidir si fue un conflicto (409) — exactamente el patrón de `ajustarLote` en `src/modules/lotes-quimicos/lotes-quimicos.service.ts:155-181`.

**Rationale**: Un `mustFindById` seguido de un `update()` separado deja una ventana de carrera entre el chequeo del estado actual y la escritura — dos clics simultáneos en "Consumir" podrían ambos leer `habilitado`, ambos escribir, y ambos generar una entrada de auditoría (spec.md, edge case de doble clic). El UPDATE condicional hace que la base de datos resuelva la carrera: solo una de las dos escrituras afecta una fila; la otra ve `affected === 0` y responde 409 sin tocar nada ni auditar.

**Alternativas consideradas**:
- `SELECT ... FOR UPDATE` + transacción explícita → rechazada, agrega una transacción para un caso donde el UPDATE condicional de una sola fila ya es atómico por sí mismo (mismo criterio que `ajustarLote`, que tampoco usa transacción explícita).
- Read-then-write sin protección → rechazada, es exactamente el bug que el edge case de spec.md pide evitar.

## D3: Sin `SELECT ... FOR UPDATE` en la ventana de carrera de `createSiembra`

**Decisión**: El chequeo de `estado`/`activo` de los lotes en `createSiembra` usa el mismo `mustFindById` de lectura simple que ya existía para los chequeos de `tipo`/`establecimiento_id`. No se agrega locking pesimista.

**Rationale**: Ya existía una ventana de carrera idéntica con `activo` antes de esta feature (un lote podía darse de baja entre el chequeo y el `INSERT` de la siembra) y nunca se resolvió con locking — no es una regresión introducida por este cambio, es el mismo riesgo aceptado que ya corría el sistema. Agregar `FOR UPDATE` acá sería inconsistente (protegería solo la mitad de la validación) y aumentaría el alcance más allá de lo pedido.

**Alternativas consideradas**:
- `SELECT ... FOR UPDATE` sobre `lote_semilla_id`/`lote_sustrato_id` dentro de la transacción de `createSiembra` → rechazada, fuera de alcance y no pedida; el riesgo ya existía para `activo`.

## D4: Limpiar metadata de consumo al rehabilitar, no preservarla

**Decisión**: `rehabilitarLote` pone `fecha_consumido`, `usuario_consumido_id` y los 3 snapshots, y `observaciones_consumo` en `NULL` — no los conserva "por si acaso".

**Rationale**: Estas columnas describen el **estado actual** ("¿por qué/quién lo consumió, si está consumido?"), no un historial. El historial de que existió un ciclo consumido→rehabilitado ya vive en `audit_logs` vía las dos acciones auditadas (`lote_consumido`, `lote_rehabilitado`) — exactamente la separación de responsabilidades que ya usa el resto del sistema (ej. `lotes_quimicos.cantidad_actual` no guarda historial de ajustes, `AuditService` sí). Preservar los campos habría dejado un lote `habilitado` con datos de una consumición vieja, engañoso para cualquier UI que lea esas columnas.

**Alternativas consideradas**:
- Mantener los campos y agregar un `fecha_rehabilitado` → rechazada, es construir una tabla de historial disfrazada de columnas sueltas; spec.md marca explícitamente "una vista dedicada de historial" como fuera de alcance.

## D5: `observaciones_consumo` como columna separada, no reutilizar `observaciones`

**Decisión**: Nueva columna `text` nullable `observaciones_consumo`, independiente de la columna `observaciones` ya existente en `lotes`.

**Rationale**: Son conceptos distintos — `observaciones` es una descripción general y permanente del lote (editable en cualquier momento vía `PATCH`), `observaciones_consumo` es la nota puntual de por qué se marcó consumido en ese momento, y se borra al rehabilitar (D4) igual que el resto de la metadata de consumo. Concatenar ambas en la misma columna mezclaría un dato permanente con uno transitorio y complicaría la limpieza al revertir.

**Alternativas consideradas**:
- Reusar `observaciones` agregando el texto de consumo al final → rechazada, mezclaría dos ciclos de vida distintos en un solo campo.

## D6: `estado` excluido de `CreateLoteDto`/`UpdateLoteDto`, confiando en `forbidNonWhitelisted`

**Decisión**: Ni `CreateLoteDto` ni `UpdateLoteDto` declaran un campo `estado`. Las únicas dos formas de cambiarlo son los endpoints dedicados `POST /lotes/:id/consumir` y `POST /lotes/:id/rehabilitar`.

**Rationale**: El `ValidationPipe` global tiene `whitelist: true, forbidNonWhitelisted: true` — cualquier `estado` en el body de `POST`/`PATCH /lotes` que no esté declarado en el DTO ya produce un 400 automático sin código de error nuevo ni lógica adicional. Es exactamente el mismo mecanismo que ya protege `tipo` en `UpdateLoteDto` (ausente del DTO + chequeo explícito de `req.body` en el controller para dar un mensaje más específico — acá no hace falta ese chequeo explícito porque no hay un mensaje de dominio especial que dar, un 400 genérico de whitelist es suficiente, FR-019).

**Alternativas consideradas**:
- Declarar `estado` en `UpdateLoteDto` como `@IsOptional()` pero rechazarlo en el service si viene → rechazada, agrega código para replicar algo que el ValidationPipe ya hace gratis.

## Resumen de artefactos afectados

| Archivo | Cambio |
|---|---|
| `migrations/1774400000000-LoteEstadoConsumido.ts` | Nuevo — enum + 6 columnas en `lotes` |
| `src/modules/lotes/entities/lote.entity.ts` | `enum LoteEstado` + 6 columnas nuevas |
| `src/common/errors/error-codes.ts` | 4 códigos nuevos |
| `src/modules/lotes/dto/consumir-lote.dto.ts` | Nuevo |
| `src/modules/lotes/dto/query-lotes.dto.ts` | + `estado`, `disponible` |
| `src/modules/lotes/lotes.service.ts` | `consumirLote`, `rehabilitarLote`, `listLotes` (filtro `estado`/`disponible`) |
| `src/modules/lotes/lotes.controller.ts` | `POST :id/consumir`, `POST :id/rehabilitar` + auditoría |
| `src/modules/lotes/lotes.service.spec.ts` | Nuevo — tests unitarios |
| `src/modules/siembra/siembra.service.ts` | 4 guards nuevos en `createSiembra` |
| `src/modules/siembra/siembra.service.spec.ts` | Nuevo/ampliado — tests de los guards nuevos |
