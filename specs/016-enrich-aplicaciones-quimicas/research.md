# Research: Enriquecimiento de lectura de Aplicaciones Químicas

**Fase 0** — Todas las incógnitas se resolvieron leyendo el código y las migraciones (no quedan NEEDS CLARIFICATION).

## D1 — Dosis por línea química

**Decision**: `dose`, `dose_unit` y `withholding_period_days` solo se pueblan en la línea principal (detalle cuyo `lote_quimico_id` coincide con `aplicaciones_quimicas.lote_quimico_id`), tomados del snapshot en la raíz de la aplicación. Líneas adicionales: `null`.

**Rationale**: `aplicaciones_quimicas_detalle` solo persiste `lote_quimico_id`, `cantidad`, `unidad_medida` (verificado en entidad y migración `AplicacionesQuimicasInit` + `QuimicosLotesRefactor`). No existe dosis por detalle; inventarla desde el valor vigente del químico no sería histórico. Decisión confirmada por el solicitante.

**Alternatives considered**: (a) leer `quimicos.withholding_period_dias` vigente para cada línea — rechazado: no es snapshot histórico; (b) migración para agregar dosis por detalle — rechazado: fuera de alcance del ticket ("sin migraciones", "no modificar creación").

## D2 — Producto/variedad/lotes por seeding

**Decision**: derivar de las bandejas afectadas de cada siembra (`bandejas.lote_semilla_id → lotes.producto_id/variedad_id → productos/variedades`; `lote_sustrato_id → lotes`). Si el conjunto afectado es heterogéneo (más de un valor distinto), el campo devuelve `null`.

**Rationale**: `siembras` no tiene producto ni lote (verificado en entidad); `createSiembra` acepta múltiples grupos de bandejas con lotes de semilla distintos dentro de la misma siembra, así que la premisa del ticket ("1 producto por seeding") no siempre se cumple en el modelo real. La regla homogéneo→valor / heterogéneo→`null` respeta el shape del contrato propuesto sin mentir datos. Confirmada por el solicitante.

**Alternatives considered**: (a) agrupar por `(siembra_id, lote_semilla_id)` — rechazado: cambia la semántica de `seedings[]` del contrato (una siembra aparecería repetida); (b) devolver el primer valor — rechazado: dato engañoso.

## D3 — Estrategia anti-N+1

**Decision**: mantener la query paginada intacta y enriquecer con 4 queries batch (`IN` sobre IDs de página + `GROUP BY` para resúmenes), ejecutadas con `Promise.all`. Detalle: mismas queries acotadas a un ID, agrupamiento en memoria.

**Rationale**: agregar joins 1:N a la query paginada rompería `skip/take` (duplicación de filas — riesgo ya latente en el filtro `quimico_id` existente). El batch por página mantiene el número de queries constante (≤ 6) e independiente de la cantidad de targets, cumpliendo FR-009/SC-002.

**Alternatives considered**: (a) JSON aggregation (`json_agg`) en una sola query — viable en Postgres pero más frágil de tipar en TypeORM strict y más difícil de mantener; (b) subqueries correlacionadas por fila — rechazado: se acerca a N+1 en el planner y complica el conteo; (c) eager relations de TypeORM — rechazado: las entidades del módulo no declaran relaciones (patrón del proyecto es join crudo por tabla).

## D4 — Soft-deletes y recursos faltantes

**Decision**: `LEFT JOIN` crudo por nombre de tabla sin filtrar `deleted_at` en los joins de enriquecimiento; si la fila no existe, el objeto enriquecido es `null`.

**Rationale**: el proyecto usa soft-delete (`BaseEntity.deleted_at`); un túnel/mesa/lote borrado lógicamente aún puede enriquecer el histórico (comportamiento "fallback de snapshot" permitido por el ticket). Si el registro no existe físicamente, `null` cumple FR-008. El patrón de join crudo ya existe en `siembra.service.ts:98`.

**Alternatives considered**: filtrar `deleted_at IS NULL` — rechazado: convertiría en `null` enriquecimientos de recursos borrados que sí tienen datos útiles para el histórico.

## D5 — Usuario enriquecido

**Decision**: query batch a `users` con select explícito de `id, nombre, apellido, email`, filtrando `tenant_id`.

**Rationale**: `users.password_hash` existe en la misma tabla — select explícito obligatorio (FR-010). `nombre`/`apellido` son nullable en la entidad, coherente con el contrato.

**Alternatives considered**: exponer `UsersService` de otro módulo — rechazado: acoplamiento innecesario (Principio IX); una query de lectura local con select explícito es suficiente.

## D6 — Índices

**Decision**: no crear índices en este ticket.

**Rationale**: verificado en migraciones que ya existen: `IDX_aq_tenant_id`, `IDX_aq_establecimiento_id`, `IDX_aq_fecha_hora DESC`, `IDX_aqd_aplicacion_id`, `IDX_aqd_lote_quimico_id`, PKs compuestos de `aplicacion_quimica_mesa`/`aplicacion_quimica_bandeja` (cubren `aplicacion_id`), `IDX_aqm_mesa_id`, `IDX_aqb_bandeja_id`, `IDX_mesas_tunel_id`, `IDX_bandejas_siembra_id`, `IDX_lotes_quimicos_quimico_id`. Los compuestos `(tenant_id, fecha_hora DESC)` del ticket serían optimización futura; crear los equivalentes hoy duplicaría cobertura sin necesidad demostrada (el propio ticket pide evitar duplicados).

## D7 — Conversión de numéricos

**Decision**: los `numeric` de Postgres (que el driver entrega como `string`) se convierten a `number` con helper explícito que preserva `null` (nunca `?? 0`).

**Rationale**: el contrato pide consistencia de tipo y prohíbe convertir faltantes a cero. `parseFloat` guardado tras chequeo de `null`/`undefined` cumple ambos.
