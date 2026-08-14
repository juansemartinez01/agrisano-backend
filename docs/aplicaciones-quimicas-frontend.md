# Aplicaciones Químicas — Guía de Frontend

Módulo para registrar aplicaciones de productos químicos (fertilizantes, fitosanitarios, etc.) sobre bandejas (contexto `nursery`) o mesas (contexto `greenhouse`). Cada aplicación referencia un lote de químico primario (con descuento automático de stock) y opcionalmente lotes/químicos adicionales vía `detalles[]`.

> El módulo de "Recetas" (`recetas`) fue eliminado del sistema. No existe `receta_id` ni endpoints de recetas — ver [quimicos-frontend.md](quimicos-frontend.md).

## 1. Rutas y autenticación

Controlador: `AplicacionesQuimicasController`, sin prefijo global `/api` (rutas directas sobre el host base, ej. `http://localhost:3000/aplicaciones-quimicas`).

Todos los endpoints requieren JWT (`JwtAuthGuard`). Reglas por endpoint:

- `POST /aplicaciones-quimicas` — requiere rol `operario`, `supervisor` o `admin_global`.
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
  cantidad: number;                // ⭐ NUEVO — requerido, > 0. Es EXACTAMENTE lo que se
                                   // descuenta del lote primario; el backend ya no calcula
                                   // dosis × targets ni valida coherencia. Con requests
                                   // troceados (operation_group_id), la cantidad es POR CHUNK.
  observaciones?: string;          // opcional, máx 2000 caracteres
  detalles?: Array<{               // opcional — lotes/químicos adicionales aplicados junto al primario
    lote_quimico_id: string;       // uuid, requerido
    dosis: number;                 // requerido, > 0 — dosis real de ESTE lote (no se asume igual a la del primario)
    dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate_unidad del químico de ESTE lote
    cantidad: number;              // requerido, > 0
  }>;                              // si se envía, debe tener al menos 1 elemento
  bandeja_ids?: string[];          // uuid[] — requerido si contexto = nursery
  mesa_ids?: string[];             // uuid[] — requerido si contexto = greenhouse
}
```

> ⚠️ **Cambio breaking**: antes de esta versión, cada item de `detalles[]` solo aceptaba `lote_quimico_id`/`cantidad`. Ahora `dosis` es **obligatoria** por item — un request que omita `dosis` en algún elemento de `detalles[]` recibirá `400` (validación). Motivo: la base nunca guardaba la dosis de los químicos adicionales, así que no había forma de mostrarla después en trazabilidad ni en el detalle de la aplicación. Si el frontend no captura hoy una dosis por lote adicional, debe agregar ese campo al formulario antes de actualizar contra este endpoint.

> ⚠️ **Cambio breaking (cantidad del lote primario)**: `cantidad` es ahora **obligatoria en la raíz del body** y es exactamente lo que se descuenta del lote primario. El backend **ya no calcula** `dosis × cantidad_de_targets` ni valida coherencia entre `cantidad` y la dosis — el cálculo del total es 100% responsabilidad del frontend, igual que siempre lo fue para `detalles[]`. Un request sin `cantidad` (o con valor ≤ 0) recibe `400`. Con pedidos troceados en varios POST (`operation_group_id`), la `cantidad` se manda **por chunk**. Contrato completo: `specs/017-cantidad-primario-explicita/contracts/create-aplicacion.md`.

### Reglas de negocio

1. El `establecimiento_id` debe existir y pertenecer al tenant actual.
2. El `lote_quimico_id` primario debe existir, y el químico asociado debe pertenecer al mismo `establecimiento_id` del body.
3. Según `contexto`:
   - `nursery` → `bandeja_ids` es obligatorio (al menos 1). Cada bandeja debe estar en estado `en_nursery` y pertenecer al mismo establecimiento.
   - `greenhouse` → `mesa_ids` es obligatorio (al menos 1). Cada mesa debe estar en estado `activa` o `en_cosecha` y pertenecer al mismo establecimiento.
4. Cada lote referenciado en `detalles[]` se valida igual que el lote primario (debe existir y pertenecer al mismo establecimiento).
5. **Descuento de stock**: el lote primario descuenta exactamente la `cantidad` de la raíz del body; los lotes de `detalles[]` descuentan exactamente la `cantidad` indicada en cada item. En ningún caso el backend multiplica por targets ni ajusta el valor — `dosis` es un dato informativo (por mesa/bandeja) que se guarda como snapshot pero no interviene en el stock.
6. Si el stock de cualquier lote (primario o de `detalles[]`) es insuficiente para el descuento, la operación completa se revierte (transacción) y se responde `LOTE_QUIMICO_STOCK_INSUFICIENTE` (422).
7. **Snapshot**: al crear la aplicación, se copian `batch` (número de lote) y `withholding_period_dias` (período de carencia) desde el lote/químico primario al momento de la aplicación. Estos campos quedan fijos en el registro de la aplicación aunque el químico o el lote cambien después.
8. **Carencia (solo `greenhouse`)**: si el químico primario tiene `withholding_period_dias > 0`, cada mesa afectada recibe `carencia_hasta = fecha_aplicación + withholding_period_dias` (columna `mesas.carencia_hasta`), y se registra un evento de historial `en_carencia` además del evento `aplicacion_quimica`.
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

## 5. Listar aplicaciones — `GET /aplicaciones-quimicas`

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

- El listado **no** devuelve `mesa_ids`/`bandeja_ids` ni el array completo de targets — para eso está el detalle (sección 6).
- `dose`/`dose_unit` vienen en **todas** las líneas (principal y adicionales), cada una con su propio valor real — solo son `null` en detalles creados antes de que `dosis` fuera obligatoria por línea (dato histórico que nunca se capturó). `withholding_period_days` sigue siendo exclusivo de la línea principal, porque es un snapshot a nivel de aplicación, no por detalle.
- Cualquier enriquecimiento cuyo recurso relacionado falte llega como `null`; nunca rompe la respuesta.

Contrato completo con ejemplos: `specs/016-enrich-aplicaciones-quimicas/contracts/aplicaciones-quimicas-read.md`.

## 6. Obtener aplicación por id — `GET /aplicaciones-quimicas/:id`

### Response `200`

```ts
{
  data: {
    aplicacion: AplicacionQuimica & {
      usuario: { id: string; nombre: string | null; apellido: string | null; email: string } | null;
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

## 7. Aplicaciones por mesa — `GET /mesas/:mesa_id/aplicaciones`

Lista paginada (mismos query params de la sección 5 salvo `establecimiento_id`/`contexto`/`quimico_id`, que no aplican acá) de aplicaciones `greenhouse` vinculadas a esa mesa. Valida que la mesa exista y pertenezca al tenant actual antes de listar.

## 8. Aplicaciones por bandeja — `GET /bandejas/:bandeja_id/aplicaciones`

Análogo al anterior, pero para bandejas y aplicaciones `nursery`. Valida que la bandeja exista antes de listar.

## 9. Notas para el frontend

- El campo `dosis` es la dosis **por target** (por mesa o por bandeja) y es puramente informativo. El descuento del lote primario es la `cantidad` de la raíz del body: **el frontend calcula el total** (típicamente `dosis × targets`, pero puede diferir si el consumo real fue otro) y el backend descuenta ese valor tal cual, sin validarlo contra la dosis.
- `batch` y `withholding_period_dias` en la respuesta son *snapshots*: reflejan el estado del lote/químico al momento de la aplicación, no su estado actual. Para ver el estado actual del químico/lote hay que consultar `GET /lotes-quimicos/:id` o `GET /quimicos/:id`.
- No existe ningún mecanismo de "warnings" en la respuesta de creación: cualquier condición inválida (stock insuficiente, target en mal estado, establecimiento no coincide) corta la operación completa con un error, no se aplica parcialmente.
