# Research: Módulo de tareas

**Feature**: `022-tareas` | **Date**: 2026-08-28

Decisiones técnicas tomadas antes del diseño, con la alternativa descartada y el motivo. Todas fueron acordadas explícitamente con el usuario durante la sesión de definición.

---

## D1 — El ámbito es un enum de Postgres, no una tabla catálogo

**Decisión**: tipo enum `tarea_ambito` con los valores `nursery` y `greenhouse`.

**Alternativas evaluadas**:

| Opción | Por qué se descartó |
|---|---|
| Tabla catálogo `tarea_ambitos` por tenant | Permite crear ámbitos sin deploy, pero suma un CRUD completo, un join en cada listado, reglas de borrado cuando el ámbito está referenciado y validación de unicidad por tenant. Es la respuesta correcta el día que cada cliente necesite sus propios ámbitos; hoy no es el caso |
| `varchar` validado solo en la aplicación | La base deja de garantizar el dominio del campo y basta un script o una carga manual para ensuciar los datos con typos |

**Motivo de la elección**: es el patrón ya vigente en el proyecto — `aplicacion_contexto` (`nursery` \| `greenhouse`) en `aplicaciones_quimicas` usa exactamente esta forma, y el módulo nuevo queda hablando el mismo vocabulario que el resto del sistema.

**Costo real de sumar un ámbito**: una migración de una línea, `ALTER TYPE "tarea_ambito" ADD VALUE 'packing'`. Postgres lo admite dentro de una transacción siempre que el valor nuevo no se use en esa misma transacción (sin backfill, sin CHECK, sin DEFAULT nuevo), que es exactamente el caso. Precedente en el repo: `1774600000000-RateUnidadHectarea.ts`, que agregó cuatro valores a `quimico_rate_unidad` de una sola vez.

**Limitación conocida y aceptada**: Postgres no soporta `DROP VALUE` en un enum. Un ámbito agregado por error queda inerte en el tipo mientras ninguna fila lo use. Ya está documentado en las migraciones `1772200000000` y `1774500000000`.

**Consecuencia de diseño**: para que agregar un ámbito no obligue a tocar el frontend, se expone `GET /tareas/ambitos` como fuente de verdad de la lista. El contrato es un array de `{ value, label }`, así que sumar un ámbito no cambia la forma de la respuesta.

---

## D2 — El ámbito es una etiqueta, no un vínculo a una entidad

**Decisión**: la tarea guarda `ambito` + `establecimiento_id` y nada más. No referencia mesa, túnel, siembra ni bandeja.

**Alternativas evaluadas**:

| Opción | Por qué se descartó ahora |
|---|---|
| Referencia polimórfica (`referencia_tipo` + `referencia_id`) | Es la extensión natural el día que se necesite ("regar la mesa 12"), pero sin caso de uso concreto obliga a decidir hoy la lista de tipos válidos, cómo se resuelve cada uno en las lecturas y qué pasa cuando el destino se elimina |
| Columnas FK opcionales tipadas (`mesa_id`, `siembra_id`, …) | Da integridad real, pero cada ámbito nuevo agrega una columna a la tabla: es justamente lo contrario a "escalable" |

**Motivo**: el pedido es una lista de tareas, no un sistema de órdenes de trabajo. El detalle de a qué se refiere la tarea va en el título y la descripción, y el día que haga falta el vínculo se agrega como columnas nullable sin romper nada de lo existente.

---

## D3 — Cuatro estados con matriz de transiciones explícita

**Decisión**: `pendiente`, `en_progreso`, `completada`, `cancelada`, en el enum `tarea_estado`, con transiciones validadas en el service.

```text
pendiente    → en_progreso | completada | cancelada
en_progreso  → pendiente | completada | cancelada
completada   → pendiente      [solo supervisor / admin_global]
cancelada    → pendiente      [solo supervisor / admin_global]
```

**Descartado**: dos estados (`pendiente`/`completada`) no permiten saber si alguien ya está trabajando en la tarea, que es el problema real de un equipo de campo. Cinco estados (agregando `bloqueada`) obliga a definir el criterio de desbloqueo sin que nadie lo haya pedido.

**Transición a sí mismo**: se rechaza con 422 `TAREA_TRANSICION_INVALIDA` en lugar de tratarse como no-op con 200. Motivo: si el cliente pide completar algo que ya está completado, su vista está desactualizada y conviene que se entere; además evita escribir un registro de auditoría que no corresponde a ningún cambio real.

**Reapertura**: siempre lleva a `pendiente`, nunca a `en_progreso`. Una sola regla, sin casos especiales según de dónde se venga.

---

## D4 — Sin columnas snapshot de usuario

**Decisión**: la tabla guarda `creada_por_usuario_id`, `asignado_a_usuario_id` y `completada_por_usuario_id`; los datos de la persona se resuelven en las lecturas con `buildUsuariosMap()` de `src/common/utils/usuario-resumen.util.ts`.

**Alternativa descartada**: replicar el patrón `usuario_email_snapshot` / `usuario_nombre_snapshot` / `usuario_apellido_snapshot` que usan `aplicaciones_quimicas` y `historial_mesa`.

**Motivo**: esas tablas son asientos históricos inmutables, donde el snapshot existe precisamente para que el registro no cambie si el usuario después se renombra o se da de baja. Una tarea es un registro vivo que se edita, se reasigna y se reabre; congelar el nombre del responsable en el momento de la asignación sería incorrecto, no prudente. Además, tres roles de usuario por fila darían nueve columnas de snapshot en una tabla que se quiere chica.

**Cobertura del caso histórico**: `buildUsuariosMap` no filtra por `is_active` ni por `deleted_at` a propósito, así que un responsable desactivado o borrado lógicamente se sigue identificando. La consulta es batch (un solo `IN` para todo el listado, sin N+1) y ya filtra por tenant.

---

## D5 — Un endpoint de estado, no cuatro endpoints semánticos

**Decisión**: `POST /tareas/:id/estado` con `{ estado }` en el body.

**Alternativa descartada**: `/iniciar`, `/completar`, `/cancelar`, `/reabrir`, siguiendo `mesas/:id/dar-de-baja`, `mesas/:id/reactivar` y `siembras/:id/ingresar-nursery`.

**Motivo**: en esos casos cada endpoint hace algo distinto (baja de mesa, reactivación, ingreso a nursery con su propia validación de fechas). Acá las cuatro transiciones son la misma operación con distinto destino: validar la matriz, escribir el estado, tocar los campos de cierre y auditar. Cuatro endpoints serían cuatro copias del mismo código, y sumar un estado en el futuro obligaría a sumar endpoints en vez de una fila en la matriz.

**Contrapartida aceptada**: es una desviación menor del estilo del repo. Se compensa con un contrato documentado y con la matriz de transiciones expresada como un único mapa constante en el service.

---

## D6 — Orden manual: entero por tablero + reordenamiento por lote

**Decisión**: columna `orden` (int) cuyo alcance es la combinación `(tenant_id, establecimiento_id, ambito)`, y un endpoint `POST /tareas/reordenar` que recibe la secuencia completa de tareas **activas** de ese tablero y reasigna `1..N` dentro de una transacción.

**Por qué el tablero es establecimiento + ámbito**: es la unidad que el usuario ve en pantalla. Un orden global por establecimiento dejaría huecos al filtrar por ámbito y haría incomprensible reordenar desde una vista filtrada.

**Por qué solo las activas**: el frontend muestra pendientes y en curso; pedirle que mande también las completadas (que no ve) para poder reordenar sería absurdo. Las cerradas conservan su `orden` histórico y no participan.

**Por qué la secuencia completa y no un movimiento parcial**: exigir que el conjunto enviado coincida exactamente con las tareas activas del tablero convierte una posible carrera (otro usuario agregó o cerró una tarea mientras se arrastraba) en un 422 explícito que obliga a recargar, en lugar de un orden silenciosamente corrupto. Se acepta hasta 500 ids por request.

**Alternativa evaluada**: `orden` como `numeric` con fractional indexing (mover una tarea = calcular el punto medio entre sus vecinos = un solo UPDATE). Es más eficiente y no exige mandar la lista completa, pero pierde precisión tras muchas reordenaciones entre los mismos dos vecinos y necesita una renormalización periódica. Para decenas de tareas por tablero no compensa la complejidad; queda documentado como el camino de escala si el volumen crece.

**Colisiones de `orden`**: pueden existir entre una tarea activa reordenada y una cerrada que conservó su posición. Es inofensivo siempre que todo `ORDER BY` desempate por `id`. Sin ese desempate el `OFFSET` de la paginación puede devolver la misma fila en dos páginas y saltear otra — el proyecto ya documentó ese problema exacto en `mesas.service.ts` al ordenar por `posicion_actual`.

**Carrera al crear**: el `MAX(orden) + 1` y el INSERT van en la misma transacción, igual que `createMesa` con `posicion_actual`. Si aun así dos tareas quedaran con el mismo `orden`, el desempate por `id` mantiene la lista estable.

---

## D7 — Aislamiento por tenant, `establecimiento_id` como filtro

**Decisión**: `establecimiento_id` es obligatorio en toda tarea, pero el aislamiento duro es por `tenant_id`; el establecimiento se usa como filtro de consulta, no como frontera de seguridad.

**Alternativa descartada**: restringir a cada usuario a los establecimientos que tiene vinculados en `usuario_establecimiento`, como hace `EstablecimientosService.findOneForUser`.

**Motivo**: es el comportamiento de todos los módulos operativos del proyecto (mesas, túneles, aplicaciones químicas, siembra listan por tenant y filtran por establecimiento). Introducir aquí una regla distinta generaría una inconsistencia difícil de explicar y un inner join extra en cada listado. Si en el futuro se decide acotar por establecimientos del usuario, es una decisión transversal que corresponde tomar para todos los módulos a la vez, no para éste solo.

---

## D8 — Sin tabla de historial; auditoría + campos de cierre

**Decisión**: cada cambio de estado se registra vía `AuditService` (obligatorio por el principio IV de la constitución) y la tarea guarda desnormalizados `completada_at` y `completada_por_usuario_id`.

**Alternativa descartada**: tabla `historial_tarea` al estilo `historial_mesa`, con timeline consultable desde el frontend.

**Motivo**: el dato que una to-do list necesita mostrar es "completada por X el día Y", y eso se resuelve con dos columnas y sin joins. El timeline completo es una entidad más, un endpoint más y un módulo más grande, en una feature cuyo requisito explícito era mantenerla chica. Si más adelante se necesita el historial navegable, la tabla se agrega sin migrar nada de lo existente: los eventos anteriores ya están en `audit_logs`.

---

## D9 — El módulo no importa `UsersModule`

**Decisión**: para validar que `asignado_a_usuario_id` existe y pertenece al tenant se hace una consulta directa a `users` con el mismo patrón de `buildUsuariosMap` (select explícito de columnas, jamás `password_hash`).

**Motivo**: el principio IX de la constitución prohíbe importar código de feature entre módulos. `UsersModule` es un módulo de IAM y `TareasModule` no tiene por qué depender de él para una validación de existencia. Los módulos que sí se importan (`TenancyModule`, `AuditModule`, `EstablecimientosModule`) son infraestructura compartida o validación de una entidad de catálogo, exactamente como hace `MesasModule`.

---

## D10 — `ambito` y `establecimiento_id` inmutables

**Decisión**: `PATCH /tareas/:id` acepta únicamente `titulo`, `descripcion` y `asignado_a_usuario_id`; cualquier otro campo en el body devuelve 400 `TAREA_FIELD_IMMUTABLE`.

**Motivo**: mover una tarea de tablero invalidaría su `orden` (quedaría con una posición que pertenece a otra lista) y obligaría a recalcular dos tableros dentro del update. Es una operación distinta a "editar una tarea" y, si se pide, merece su propio endpoint que recalcule el orden en destino. El guard de campos extra replica el que ya usa `MesasController.update`.
