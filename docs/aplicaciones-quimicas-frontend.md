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
  KG_L = 'kg/L',
  G_L = 'g/L',
  ML_L = 'mL/L',
  L_L = 'L/L',
}
```

Estos son los valores actuales (con esta capitalización exacta). Si no se envía `dosis_unidad` en el request, se toma por defecto el `rate_unidad` del químico del lote primario.

## 4. Crear aplicación — `POST /aplicaciones-quimicas`

### Body

```ts
{
  establecimiento_id: string;      // uuid, requerido
  contexto: AplicacionContexto;    // requerido
  lote_quimico_id: string;         // uuid, requerido — lote químico primario
  dosis: number;                   // requerido, > 0
  dosis_unidad?: QuimicoRateUnidad; // opcional — default: rate_unidad del químico del lote primario
  observaciones?: string;          // opcional, máx 2000 caracteres
  detalles?: Array<{               // opcional — lotes/químicos adicionales aplicados junto al primario
    lote_quimico_id: string;       // uuid, requerido
    cantidad: number;              // requerido, > 0
  }>;                              // si se envía, debe tener al menos 1 elemento
  bandeja_ids?: string[];          // uuid[] — requerido si contexto = nursery
  mesa_ids?: string[];             // uuid[] — requerido si contexto = greenhouse
}
```

### Reglas de negocio

1. El `establecimiento_id` debe existir y pertenecer al tenant actual.
2. El `lote_quimico_id` primario debe existir, y el químico asociado debe pertenecer al mismo `establecimiento_id` del body.
3. Según `contexto`:
   - `nursery` → `bandeja_ids` es obligatorio (al menos 1). Cada bandeja debe estar en estado `en_nursery` y pertenecer al mismo establecimiento.
   - `greenhouse` → `mesa_ids` es obligatorio (al menos 1). Cada mesa debe estar en estado `activa` o `en_cosecha` y pertenecer al mismo establecimiento.
4. Cada lote referenciado en `detalles[]` se valida igual que el lote primario (debe existir y pertenecer al mismo establecimiento).
5. **Cálculo de stock del lote primario**: se descuenta `dosis × cantidad_de_targets` (cantidad de mesas o bandejas, según contexto; si no hay targets, se usa 1). Los lotes de `detalles[]` descuentan exactamente la `cantidad` indicada en cada item (no se multiplica).
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

Paginado (`{ data: AplicacionQuimica[], meta: { page, limit, total } }`), sin `detalles` ni `afectados` embebidos — para eso usar el endpoint de detalle (sección 6).

## 6. Obtener aplicación por id — `GET /aplicaciones-quimicas/:id`

### Response `200`

```ts
{
  data: {
    aplicacion: AplicacionQuimica;
    detalles: AplicacionQuimicaDetalle[];
    bandeja_ids?: string[];   // presente si contexto = nursery
    mesa_ids?: string[];      // presente si contexto = greenhouse
  }
}
```

### Errores

| Código | Status | Causa |
|---|---|---|
| `APLICACION_NOT_FOUND` | 404 | No existe una aplicación con ese id en el tenant actual |

## 7. Aplicaciones por mesa — `GET /mesas/:mesa_id/aplicaciones`

Lista paginada (mismos query params de la sección 5 salvo `establecimiento_id`/`contexto`/`quimico_id`, que no aplican acá) de aplicaciones `greenhouse` vinculadas a esa mesa. Valida que la mesa exista y pertenezca al tenant actual antes de listar.

## 8. Aplicaciones por bandeja — `GET /bandejas/:bandeja_id/aplicaciones`

Análogo al anterior, pero para bandejas y aplicaciones `nursery`. Valida que la bandeja exista antes de listar.

## 9. Notas para el frontend

- El campo `dosis` es la dosis **por target** (por mesa o por bandeja); el backend calcula el descuento total del lote primario multiplicando por la cantidad de targets. El frontend no necesita hacer ese cálculo, pero sí debe mostrarlo si quiere anticipar el stock consumido.
- `batch` y `withholding_period_dias` en la respuesta son *snapshots*: reflejan el estado del lote/químico al momento de la aplicación, no su estado actual. Para ver el estado actual del químico/lote hay que consultar `GET /lotes-quimicos/:id` o `GET /quimicos/:id`.
- No existe ningún mecanismo de "warnings" en la respuesta de creación: cualquier condición inválida (stock insuficiente, target en mal estado, establecimiento no coincide) corta la operación completa con un error, no se aplica parcialmente.
