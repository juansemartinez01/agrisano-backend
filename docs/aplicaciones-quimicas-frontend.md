# Aplicaciones Químicas — Guía de Frontend

Módulo para registrar aplicaciones de productos químicos (fertilizantes, fitosanitarios, etc.) sobre bandejas (contexto `nursery`) o mesas (contexto `greenhouse`). Cada aplicación referencia un lote de químico primario (con descuento automático de stock) y opcionalmente lotes/químicos adicionales vía `detalles[]`.

> El módulo de "Recetas" (`recetas`) fue eliminado del sistema. No existe `receta_id` ni endpoints de recetas — ver [quimicos-frontend.md](quimicos-frontend.md).

## 1. Rutas y autenticación

Controlador: `AplicacionesQuimicasController`, sin prefijo global `/api` (rutas directas sobre el host base, ej. `http://localhost:3000/aplicaciones-quimicas`).

Todos los endpoints requieren JWT (`JwtAuthGuard`). Reglas por endpoint:

- `POST /aplicaciones-quimicas` — requiere rol `operario`, `supervisor` o `admin_global`.
- `PATCH /aplicaciones-quimicas/:id` — requiere rol `supervisor` o `admin_global` (no `operario`).
- `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id` — requiere rol `supervisor` o `admin_global` (no `operario`). Corrige atómicamente todas las filas de un grupo — sección 5a.
- El resto de los endpoints (`GET`) solo requieren estar autenticado (no tienen restricción de rol adicional).

## 2. Enum `AplicacionContexto`

```ts
enum AplicacionContexto {
  NURSERY = 'nursery',
  GREENHOUSE = 'greenhouse',
}
```

- `nursery`: la aplicación se hace sobre **bandejas** (`bandeja_ids`). Las bandejas deben estar en estado `en_nursery`.
- `greenhouse`: la aplicación se hace sobre **mesas** (`mesa_ids`). Las mesas deben estar en estado `activa` o `en_cosecha`.

## 3. Enum `QuimicoRateUnidad` (para `dosis_unidad`)

```ts
enum QuimicoRateUnidad {
  // concentración (X por litro de caldo)
  KG_L = 'kg/L',
  G_L = 'g/L',
  ML_L = 'mL/L',
  L_L = 'L/L',
  // superficie (X por hectárea) — agregadas el 2026-08-14
  ML_HA = 'mL/Ha',
  L_HA = 'L/Ha',
  G_HA = 'g/Ha',
  KG_HA = 'kg/Ha',
}
```

Estos son los valores actuales (con esta capitalización exacta). Si no se envía `dosis_unidad` en el request, se toma por defecto el `rate_unidad` del químico del lote primario.

⚠️ Las unidades `/Ha` cambian cómo debe calcularse `cantidad` en el frontend: el multiplicador deja de ser la cantidad de bandejas o mesas. Ver [handoff-frontend-dosis-unidad-hectarea.md](handoff-frontend-dosis-unidad-hectarea.md).

## 4. Crear aplicación — `POST /aplicaciones-quimicas`

### Body

```ts
{
  establecimiento_id: string;      // uuid, requerido
  contexto: AplicacionContexto;    // requerido
  lote_quimico_id: string;         // uuid, requerido — lote químico primario
  dosis: number;                   // requerido, > 0 — INFORMATIVA (por target); no afecta el stock
  dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate_unidad del químico del lote primario
  cantidad: number;                // ⭐ NUEVO — requerido, > 0, hasta 6 decimales (ver abajo). Es EXACTAMENTE lo que se
                                   // descuenta del lote primario; el backend ya no calcula
                                   // dosis × targets ni valida coherencia. Con requests
                                   // troceados (operation_group_id), la cantidad es POR CHUNK.
  observaciones?: string;          // opcional, máx 2000 caracteres
  detalles?: Array<{               // opcional — lotes/químicos adicionales aplicados junto al primario
    lote_quimico_id: string;       // uuid, requerido
    dosis: number;                 // requerido, > 0 — dosis real de ESTE lote (no se asume igual a la del primario)
    dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate_unidad del químico de ESTE lote
    cantidad: number;              // requerido, > 0, hasta 6 decimales
  }>;                              // si se envía, debe tener al menos 1 elemento
  bandeja_ids?: string[];          // uuid[] — requerido si contexto = nursery
  mesa_ids?: string[];             // uuid[] — requerido si contexto = greenhouse
}
```

> ⚠️ **Cambio breaking**: antes de esta versión, cada item de `detalles[]` solo aceptaba `lote_quimico_id`/`cantidad`. Ahora `dosis` es **obligatoria** por item — un request que omita `dosis` en algún elemento de `detalles[]` recibirá `400` (validación). Motivo: la base nunca guardaba la dosis de los químicos adicionales, así que no había forma de mostrarla después en trazabilidad ni en el detalle de la aplicación. Si el frontend no captura hoy una dosis por lote adicional, debe agregar ese campo al formulario antes de actualizar contra este endpoint.

> ⚠️ **Cambio breaking (cantidad del lote primario)**: `cantidad` es ahora **obligatoria en la raíz del body** y es exactamente lo que se descuenta del lote primario. El backend **ya no calcula** `dosis × cantidad_de_targets` ni valida coherencia entre `cantidad` y la dosis — el cálculo del total es 100% responsabilidad del frontend, igual que siempre lo fue para `detalles[]`. Un request sin `cantidad` (o con valor ≤ 0) recibe `400`. Con pedidos troceados en varios POST (`operation_group_id`), la `cantidad` se manda **por chunk**. Contrato completo: `specs/017-cantidad-primario-explicita/contracts/create-aplicacion.md`.

> **Precisión de `cantidad` (6 decimales)**: todas las `cantidad` de este módulo (`POST`, `PATCH /:id` y `PATCH /operation-group/:id`) admiten **hasta 6 decimales** (mínimo `0.000001`, máximo `9999999.999999`). Más de 6 decimales responde `400` — también el ruido de punto flotante (`0.1 + 0.2` = `0.30000000000000004`), así que el front debe redondear con `Number(x.toFixed(6))` antes de enviar. Los valores de 3 decimales siguen funcionando igual. Detalle en [handoff-frontend-cantidad-6-decimales.md](handoff-frontend-cantidad-6-decimales.md).

### Reglas de negocio

1. El `establecimiento_id` debe existir y pertenecer al tenant actual.
2. El `lote_quimico_id` primario debe existir, y el químico asociado debe pertenecer al mismo `establecimiento_id` del body.
3. Según `contexto`:
   - `nursery` → `bandeja_ids` es obligatorio (al menos 1). Cada bandeja debe estar en estado `en_nursery` y pertenecer al mismo establecimiento.
   - `greenhouse` → `mesa_ids` es obligatorio (al menos 1). Cada mesa debe estar en estado `activa` o `en_cosecha` y pertenecer al mismo establecimiento.
4. Cada lote referenciado en `detalles[]` se valida igual que el lote primario (debe existir y pertenecer al mismo establecimiento).
5. **Descuento de stock**: el lote primario descuenta exactamente la `cantidad` de la raíz del body; los lotes de `detalles[]` descuentan exactamente la `cantidad` indicada en cada item. En ningún caso el backend multiplica por targets ni ajusta el valor — `dosis` es un dato informativo (por mesa/bandeja) que se guarda como snapshot pero no interviene en el stock.
6. Si el stock de cualquier lote (primario o de `detalles[]`) es insuficiente para el descuento, la operación completa se revierte (transacción) y se responde `LOTE_QUIMICO_STOCK_INSUFICIENTE` (422).
7. **Snapshot / recálculo**: al crear la aplicación, se copia `batch` (número de lote) desde el lote primario — ese campo sí queda fijo (snapshot histórico). `withholding_period_dias`, en cambio, **no es un snapshot fijo**: es el MAX entre la carencia del químico primario y la de todos los químicos de `detalles[]`, y se **recalcula** (junto con `carencia_hasta` de cada target afectado) cada vez que esta aplicación o cualquier otra que comparta un target se crea o se edita — ver sección 5 (`PATCH`).
8. **Carencia (`nursery` y `greenhouse`)**: si la carencia efectiva (MAX entre primario y `detalles[]`, ver regla 7) es `> 0`, cada target afectado recibe `carencia_hasta = fecha_aplicación + withholding_period_dias` (columna `carencia_hasta` en `bandejas` o `mesas`, según el contexto). En `greenhouse` además se registra un evento de historial `en_carencia` en la mesa (además del evento `aplicacion_quimica`); `bandejas` no tiene historial equivalente.
9. Toda la operación (crear aplicación, detalles, descuentos de stock, links a bandejas/mesas, historial, carencia) ocurre dentro de una única transacción.

### Response `201`

```ts
{
  data: {
    aplicacion: {
      id: string;
      tenant_id: string;
      establecimiento_id: string;
      contexto: AplicacionContexto;
      observaciones: string | null;
      usuario_id: string;
      fecha_hora: string;             // ISO timestamp
      lote_quimico_id: string;
      dosis: number;
      dosis_unidad: QuimicoRateUnidad | null;
      batch: string | null;                    // snapshot
      withholding_period_dias: number | null;   // snapshot
      updated_by: string | null;                // uuid de quien hizo la última corrección (PATCH) — null si nunca se editó
      updated_by_email_snapshot: string | null;
      updated_by_nombre_snapshot: string | null;
      updated_by_apellido_snapshot: string | null;
      created_at: string;
      updated_at: string;
    };
    detalles: Array<{
      id: string;
      aplicacion_id: string;
      lote_quimico_id: string;
      dosis: number;                 // dosis real de esta línea (principal o adicional)
      dosis_unidad: QuimicoRateUnidad | null;
      cantidad: number;
      unidad_medida: string;         // copiada del químico al momento de aplicar
    }>;                              // [0] es siempre el detalle del lote primario
    afectados: {
      bandeja_ids?: string[];        // presente si contexto = nursery
      mesa_ids?: string[];           // presente si contexto = greenhouse
    };
  }
}
```

### Errores posibles

| Código | Status | Causa |
|---|---|---|
| `APLICACION_TARGET_INVALIDO` | 422 | Lote/bandeja/mesa no pertenece al establecimiento, o bandeja/mesa en estado inválido |
| `APLICACION_TARGETS_VACIOS` | 422 | Falta `bandeja_ids` (nursery) o `mesa_ids` (greenhouse) |
| `LOTE_QUIMICO_STOCK_INSUFICIENTE` | 422 | Stock insuficiente en el lote primario o en algún lote de `detalles[]` |
| `LOTE_QUIMICO_NOT_FOUND` | 404 | Un `lote_quimico_id` referenciado no existe |
| 400 (validación) | 400 | Body inválido según las reglas de `class-validator` (uuid, enum, `dosis > 0`, `detalles` no vacío si se envía, etc.) |

## 5. Corregir aplicación — `PATCH /aplicaciones-quimicas/:id`

Permite corregir una aplicación ya registrada (fecha, observaciones, químicos/dosis/cantidades, o los targets afectados) sin pasar por la base de datos directamente. Requiere rol `supervisor` o `admin_global` (no `operario`).

`contexto` y `establecimiento_id` son **inmutables**: no existen como campos de este DTO, y si se envían igual (o cualquier otro campo fuera de la lista de abajo) la request se rechaza con `APLICACION_FIELD_IMMUTABLE` (400) sin tocar nada. Un body vacío `{}` también se rechaza con el mismo error (no hay nada que editar).

### Body

Todos los campos son opcionales — se edita solo lo que se envía; lo que no se envía queda igual.

```ts
{
  fecha_hora?: string;             // ISO 8601
  observaciones?: string | null;   // null limpia el campo explícitamente
  chemical_lines?: Array<{         // reemplaza TODAS las líneas de químico (no hace merge parcial)
    lote_quimico_id: string;       // uuid
    dosis: number;                 // > 0
    dosis_unidad?: QuimicoRateUnidad;
    cantidad: number;              // > 0, hasta 6 decimales — se descuenta literal, igual que en create
  }>;                              // si se envía, al menos 1 elemento; [0] pasa a ser la línea primaria
  bandeja_ids?: string[];          // uuid[] — reemplaza TODOS los targets (solo si contexto = nursery)
  mesa_ids?: string[];             // uuid[] — reemplaza TODOS los targets (solo si contexto = greenhouse)
}
```

Ejemplo — corregir dosis/cantidad de un químico y agregar uno adicional:

```json
{
  "chemical_lines": [
    { "lote_quimico_id": "b1e2...", "dosis": 2.5, "dosis_unidad": "mL/L", "cantidad": 12 },
    { "lote_quimico_id": "9fa0...", "dosis": 1, "dosis_unidad": "g/L", "cantidad": 4 }
  ]
}
```

Notas sobre `chemical_lines`:

- Reemplaza **todo** el conjunto de líneas de la aplicación (primaria + `detalles[]` de create) de una vez — no permite editar una sola línea a la vez ni hacer merge con las líneas existentes. Para dejar una línea sin cambios hay que reenviarla tal cual.
- El stock se revierte primero (se le devuelve al lote viejo exactamente la `cantidad` que tenía cada línea reemplazada) y recién después se valida y descuenta el stock de las líneas nuevas. Si en cualquier punto falta stock, **toda la operación se revierte** (incluida la reversión que ya se había hecho) y no queda nada aplicado a medias.
- Cada `lote_quimico_id` nuevo se valida igual que en `create` (debe existir y pertenecer al mismo `establecimiento_id` de la aplicación).

Notas sobre `bandeja_ids` / `mesa_ids`:

- Reemplaza **todos** los targets de la aplicación — no agrega ni quita targets individuales. No puede dejar la aplicación sin targets (mínimo 1).
- Solo se puede enviar el campo que corresponde al `contexto` real de la aplicación: mandar `mesa_ids` en una aplicación `nursery`, o `bandeja_ids` en una `greenhouse`, responde `APLICACION_TARGET_INVALIDO` (422).
- Los targets nuevos se validan igual que en `create` (estado, establecimiento).

### Comportamiento de carencia (WHP)

`withholding_period_dias` y `carencia_hasta` **no son un valor fijo de creación**: cada vez que se edita `fecha_hora`, `chemical_lines`, `bandeja_ids` o `mesa_ids`, el backend recalcula la carencia de **todos los targets afectados** (los que tenía antes de la edición, unión con los que tiene después) considerando el **histórico completo** de aplicaciones que siguen ligadas a cada uno — no solo esta fila.

Ejemplo: una mesa tiene dos aplicaciones — A (carencia hasta 15/10) y B (carencia hasta 20/10). Si se edita o se acorta la carencia de A, la mesa **sigue bloqueada hasta el 20/10** porque B sigue vigente; `carencia_hasta` es siempre el MAX entre todas las aplicaciones que siguen ligadas al target, no un valor que "pertenece" a una sola aplicación.

Este recálculo también corrige (para esta fila y para cualquier otra que comparta target) el valor guardado en `withholding_period_dias` del header, que pasa a ser el MAX entre el químico primario y todos los de `chemical_lines`.

### `operation_group_id`

Cuando una operación supera el límite de 200 targets por request, el frontend la trocea en varios `POST` que comparten un `operation_group_id` (el primer `POST` lo genera si no se envía; los siguientes lo reciben en el body para unirse al mismo grupo — sección 4).

Este PATCH edita **únicamente la fila física `:id`** — sirve para corregir un valor puntual de una sola fila, distinto al resto del grupo. Para corregir **todas** las filas del grupo a la vez (crear, actualizar y borrar filas en un solo request atómico, sin reconciliación manual), usar `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id` — sección 5a.

### Response `200`

Mismo shape que `GET /aplicaciones-quimicas/:id` (sección 7) — incluye `aplicacion`, `detalles` y `targets` ya con los datos corregidos.

### Errores posibles

| Código | Status | Causa |
|---|---|---|
| `APLICACION_NOT_FOUND` | 404 | No existe una aplicación con ese id en el tenant actual |
| `APLICACION_FIELD_IMMUTABLE` | 400 | Se envió `contexto`, `establecimiento_id`, o cualquier campo fuera de `{fecha_hora, observaciones, chemical_lines, bandeja_ids, mesa_ids}`; o el body está vacío |
| `APLICACION_TARGET_INVALIDO` | 422 | Se envió `mesa_ids` en una aplicación `nursery` (o `bandeja_ids` en `greenhouse`); un target/lote no pertenece al establecimiento; o un target no está en estado válido |
| `LOTE_QUIMICO_STOCK_INSUFICIENTE` | 422 | Stock insuficiente en alguna línea nueva de `chemical_lines` (la reversión de las líneas viejas también se deshace) |
| `LOTE_QUIMICO_NOT_FOUND` | 404 | Un `lote_quimico_id` de `chemical_lines` no existe |
| 400 (validación) | 400 | Body inválido según `class-validator` |

## 5a. Corregir grupo completo — `PATCH /aplicaciones-quimicas/operation-group/:operation_group_id`

Corrige **todas** las filas físicas de un mismo `operation_group_id` en una sola transacción: crea, actualiza y borra filas del grupo en un solo request, sin dejarlo nunca a mitad de camino entre la versión vieja y la nueva. Requiere rol `supervisor` o `admin_global` (no `operario`).

**El backend nunca inventa ni reparte `cantidad`.** No existe un modo "un `chemical_lines` y un array de targets para todo el grupo" — cada fila física (crear, actualizar o borrar) se declara por separado en `items[]`, con su propio `cantidad` real, exactamente como en `POST`/`PATCH` de fila única.

`:operation_group_id` en la URL identifica el grupo — no es el id de ninguna fila individual.

### Body

```ts
{
  fecha_hora?: string;              // ISO 8601 — nivel grupo: aplica a TODA fila creada o
                                     // actualizada por este request; nunca a las borradas, nunca
                                     // a filas del grupo ausentes de items[]
  observaciones?: string | null;    // ídem, nivel grupo

  items: Array<{                    // requerido, 1 a 50 elementos — un ítem por fila física
    op: 'create' | 'update' | 'delete';

    id?: string;                    // uuid — requerido en update/delete, prohibido en create

    chemical_lines?: Array<{        // mismo shape que en create/PATCH de fila única
      lote_quimico_id: string;
      dosis: number;                // > 0
      dosis_unidad?: QuimicoRateUnidad;
      cantidad: number;             // > 0, hasta 6 decimales — se descuenta literal
    }>;                             // requerido en create; opcional en update (solo si se
                                     // reemplazan las líneas de esa fila); prohibido en delete

    bandeja_ids?: string[];         // uuid[] — solo si el contexto del grupo es nursery
    mesa_ids?: string[];            // uuid[] — solo si el contexto del grupo es greenhouse
                                     // (uno de los dos requerido en create junto con
                                     // chemical_lines; opcional en update; prohibido en delete)
  }>;
}
```

Reglas de forma por `op` (se validan contra el `contexto` real del grupo, no contra lo que declare el body):

- `create`: sin `id`. Requiere `chemical_lines` y el campo de target que corresponde al contexto del grupo (`bandeja_ids` en `nursery`, `mesa_ids` en `greenhouse`).
- `update`: requiere `id` de una fila que pertenezca a este grupo. Todo lo demás es opcional — un `update` sin `chemical_lines` ni targets simplemente re-estampa `fecha_hora`/`observaciones` de nivel grupo (si vinieron) y quién hizo la corrección.
- `delete`: requiere `id`; no debe traer `chemical_lines`, `bandeja_ids` ni `mesa_ids`.
- Ningún `id` puede repetirse entre ítems.
- Una fila del grupo que no aparece en `items[]` queda intacta (no se borra ni se toca).

### Reglas de negocio

1. Se lockea (`FOR UPDATE`) todo el grupo por `operation_group_id` + tenant. Si no hay ninguna fila, `APLICACION_NOT_FOUND` (404).
2. Todas las filas lockeadas deben compartir `contexto` y `establecimiento_id` — si un grupo pre-existente resultara no uniforme, `CONFLICT` (409); esto es un chequeo defensivo sobre datos ya guardados, no algo que el caller pueda provocar con este request.
3. Cada `id` de `update`/`delete` debe pertenecer a este grupo y tenant — si no, `APLICACION_NOT_FOUND` (404).
4. El grupo no puede quedar en 0 filas tras aplicar creates/updates/deletes — si quedaría vacío, `APLICACION_TARGETS_VACIOS` (422), sin aplicar ningún cambio.
5. Descuento/reversión de stock: igual que en `PATCH` de fila única, por cada línea de `chemical_lines` tocada (reemplazada en un `update`, agregada en un `create`, revertida en un `delete`). Si falta stock en cualquier línea de cualquier ítem, **toda la operación se revierte** — ninguna fila del grupo cambia, aunque otros ítems del mismo request fueran válidos.
6. Cada fila `create` nace con el mismo shape que un `POST` normal (`usuario_id` = quien ejecuta el PATCH, `updated_by` = `null`). Cada fila `update` siempre re-estampa `updated_by` + snapshot, sin importar qué campo puntual cambió.
7. Carencia (WHP): se recalcula, **siempre y sin excepción**, para la unión de todos los targets que el grupo tenía antes del request y los que tiene después — no solo los targets tocados por un ítem en particular. Mismo criterio que la sección "Comportamiento de carencia" de arriba (MAX entre todas las aplicaciones que siguen ligadas a cada target).

### Response `200`

```ts
{
  data: {
    operation_group_id: string;
    applications: Array<{           // filas sobrevivientes del grupo (no incluye las borradas),
      // mismo shape que cada item de GET /aplicaciones-quimicas/:id (sección 7):
      // aplicacion, detalles, bandeja_ids?/mesa_ids?, targets
      ...
    }>;                              // ordenadas por created_at ascendente
    deleted_ids: string[];          // ids de las filas borradas por este request
  }
}
```

No existe un shape "agregado" (totales de químicos/targets fusionados de todo el grupo): igual que en `create`, sería un número fabricado por el backend. Para saber qué se borró, usar `deleted_ids` — una fila borrada, por definición, no puede aparecer en `applications`.

### Errores posibles

| Código | Status | Causa |
|---|---|---|
| `APLICACION_NOT_FOUND` | 404 | `operation_group_id` no matchea ninguna fila del tenant, o un `id` de `update`/`delete` no pertenece a este grupo/tenant |
| `APLICACION_TARGETS_VACIOS` | 422 | El grupo quedaría en 0 filas tras aplicar el request |
| `APLICACION_TARGET_INVALIDO` | 422 | El campo de target de un ítem no corresponde al `contexto` del grupo, o falla la validación de un target/lote dentro de un ítem |
| `LOTE_QUIMICO_STOCK_INSUFICIENTE` | 422 | Stock insuficiente en alguna línea de `chemical_lines` de cualquier ítem |
| `LOTE_QUIMICO_NOT_FOUND` | 404 | Un `lote_quimico_id` referenciado no existe |
| `CONFLICT` | 409 | El grupo lockeado tiene filas con `contexto`/`establecimiento_id` no uniforme (dato pre-existente inconsistente) |
| `BAD_REQUEST` | 400 | `id` duplicado entre ítems, o la forma de un ítem no es consistente con su `op` (ej. `create` con `id`, `delete` con `chemical_lines`) |
| 400 (validación) | 400 | Body inválido según `class-validator` — ej. `items` vacío/ausente o con más de 50 elementos, o una key fuera de `{fecha_hora, observaciones, items}` en el body (incluyendo `contexto`/`establecimiento_id`) |

## 6. Listar aplicaciones — `GET /aplicaciones-quimicas`

### Query params

```ts
{
  establecimiento_id?: string;   // uuid
  contexto?: AplicacionContexto;
  quimico_id?: string;           // uuid — filtra por el químico usado en algún detalle de la aplicación
  fecha_desde?: string;          // ISO 8601
  fecha_hasta?: string;          // ISO 8601
  sortBy?: string;               // 'fecha_hora' | 'created_at' (default: 'fecha_hora')
  sortOrder?: 'ASC' | 'DESC';    // default: 'DESC'
  page?: number;
  limit?: number;                // tope 200
}
```

`quimico_id` filtra aplicaciones cuyos `detalles[]` incluyan un lote del químico indicado (join contra `lotes_quimicos`), no un campo directo de la aplicación.

### Response `200`

Paginado (`{ data: AplicacionListItem[], meta: { page, limit, total } }`). Cada item incluye **todos los campos de `AplicacionQuimica`** (sin cambios) más los siguientes campos enriquecidos, pensados para pintar las tarjetas de `/chemicals` con una sola request:

```ts
type AplicacionListItem = AplicacionQuimica & {
  usuario: {                     // null si el usuario ya no puede resolverse
    id: string;
    nombre: string | null;
    apellido: string | null;
    email: string;
  } | null;

  target_count: number;          // mesas o bandejas distintas afectadas (0 si no hay vínculos)

  target_summary: {
    tunnels: Array<{             // solo greenhouse (vacío en nursery)
      id: string | null;         // null si el túnel/mesa ya no resuelve
      nombre: string | null;
      table_count: number;
    }>;
    seedings: Array<{            // solo nursery (vacío en greenhouse)
      id: string | null;
      created_at: string | null; // ISO — fecha de creación de la siembra
      tray_count: number;
      product: { id: string; nombre: string } | null;  // null si heterogéneo o no resuelve
      variety: { id: string; nombre: string } | null;
    }>;
  };

  chemical_lines: Array<{        // una línea por lote realmente usado ([0] suele ser el primario)
    lote_quimico_id: string;
    chemical_id: string | null;
    chemical_name: string | null;
    lot_name: string | null;
    quantity: number | null;     // cantidad total descontada de ese lote
    unit: string | null;
    dose: number | null;                   // dosis real de ESTA línea (null solo en filas históricas, creadas antes de que dosis fuera obligatoria por detalle)
    dose_unit: string | null;              // ídem
    withholding_period_days: number | null; // SOLO en la línea principal (snapshot a nivel de aplicación, no existe por detalle)
    brand: { id: string; nombre: string } | null;
    supplier: { id: string; nombre: string } | null;
  }>;
};
```

Notas:

- El listado **no** devuelve `mesa_ids`/`bandeja_ids` ni el array completo de targets — para eso está el detalle (sección 7).
- `dose`/`dose_unit` vienen en **todas** las líneas (principal y adicionales), cada una con su propio valor real — solo son `null` en detalles creados antes de que `dosis` fuera obligatoria por línea (dato histórico que nunca se capturó). `withholding_period_days` sigue siendo exclusivo de la línea principal, porque es un snapshot a nivel de aplicación, no por detalle.
- Cualquier enriquecimiento cuyo recurso relacionado falte llega como `null`; nunca rompe la respuesta.

Contrato completo con ejemplos: `specs/016-enrich-aplicaciones-quimicas/contracts/aplicaciones-quimicas-read.md`.

## 7. Obtener aplicación por id — `GET /aplicaciones-quimicas/:id`

### Response `200`

```ts
{
  data: {
    aplicacion: AplicacionQuimica & {
      usuario: { id: string; nombre: string | null; apellido: string | null; email: string } | null;
      // Quién creó la aplicación (arriba) vs. quién hizo la última corrección (abajo).
      // updated_by y los 3 snapshots quedan en null mientras la fila nunca fue editada
      // con PATCH; no hay objeto "usuario" anidado para el editor, solo estos 4 campos planos.
      updated_by: string | null;
      updated_by_email_snapshot: string | null;
      updated_by_nombre_snapshot: string | null;
      updated_by_apellido_snapshot: string | null;
    };
    detalles: Array<{          // una línea por lote realmente usado ([0] es siempre el primario)
      id: string;
      aplicacion_id: string;
      lote_quimico_id: string;
      dosis: number | null;              // null solo en detalles históricos (pre-existentes a esta dosis obligatoria)
      dosis_unidad: QuimicoRateUnidad | null;
      cantidad: number | null;
      unidad_medida: string | null;
      lote_quimico: {
        id: string;
        numero_lote: string;
        quimico: { id: string; nombre: string } | null;
        marca: { id: string; nombre: string } | null;    // hermano de `quimico`, no anidado dentro
        proveedor: { id: string; nombre: string } | null;
      } | null;               // null si el lote fue eliminado
    }>;
    bandeja_ids?: string[];   // presente si contexto = nursery (sin cambios)
    mesa_ids?: string[];      // presente si contexto = greenhouse (sin cambios)

    targets:                  // NUEVO — targets enriquecidos y agrupados
      | {
          context: 'greenhouse';
          total: number;      // = mesa_ids.length
          tunnels: Array<{
            id: string | null;          // null si la mesa/túnel ya no resuelve
            nombre: string | null;
            tables: Array<{
              id: string;
              nombre: string | null;    // nombre estable de la mesa
              posicion_actual: number | null; // posición ACTUAL, no histórica
              estado: string | null;    // estado ACTUAL
            }>;
          }>;
        }
      | {
          context: 'nursery';
          total: number;      // = bandeja_ids.length
          seedings: Array<{
            id: string | null;
            created_at: string | null;
            tray_count: number;
            product: { id: string; nombre: string } | null;       // null si heterogéneo
            variety: { id: string; nombre: string } | null;       // null si heterogéneo
            seed_lot: { id: string; numero_lote: string } | null; // null si heterogéneo
            substrate_lot: { id: string; numero_lote: string } | null;
            trays: Array<{
              id: string;
              codigo: string | null;
              estado: string | null;    // estado ACTUAL (puede ser 'trasplantada')
            }>;
          }>;
        };
  }
}
```

Notas:

- `posicion_actual` y `estado` reflejan el **presente** de la mesa/bandeja, no el momento de la aplicación (una mesa pudo cambiar de posición; una bandeja pudo trasplantarse).
- Si una mesa/túnel/siembra fue eliminada, el ID del target se conserva y el enriquecimiento correspondiente llega como `null` (agrupado bajo túnel/siembra `null`), sin error 500.

### Errores

| Código | Status | Causa |
|---|---|---|
| `APLICACION_NOT_FOUND` | 404 | No existe una aplicación con ese id en el tenant actual |

## 8. Aplicaciones por mesa — `GET /mesas/:mesa_id/aplicaciones`

Lista paginada (mismos query params de la sección 6 salvo `establecimiento_id`/`contexto`/`quimico_id`, que no aplican acá) de aplicaciones `greenhouse` vinculadas a esa mesa. Valida que la mesa exista y pertenezca al tenant actual antes de listar.

## 9. Aplicaciones por bandeja — `GET /bandejas/:bandeja_id/aplicaciones`

Análogo al anterior, pero para bandejas y aplicaciones `nursery`. Valida que la bandeja exista antes de listar.

## 10. Notas para el frontend

- El campo `dosis` es la dosis **por target** (por mesa o por bandeja) y es puramente informativo. El descuento del lote primario es la `cantidad` de la raíz del body: **el frontend calcula el total** (típicamente `dosis × targets`, pero puede diferir si el consumo real fue otro) y el backend descuenta ese valor tal cual, sin validarlo contra la dosis.
- `batch` es un *snapshot*: refleja el lote al momento de la aplicación, no su estado actual. `withholding_period_dias`, en cambio, se recalcula con cada `PATCH` (propio o de otra aplicación que comparta target) — ver sección 4, regla 7. Para ver el estado actual del químico/lote hay que consultar `GET /lotes-quimicos/:id` o `GET /quimicos/:id`.
- No existe ningún mecanismo de "warnings" en la respuesta de creación: cualquier condición inválida (stock insuficiente, target en mal estado, establecimiento no coincide) corta la operación completa con un error, no se aplica parcialmente.
