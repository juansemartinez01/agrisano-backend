# Data Model: Enriquecimiento de lectura de Aplicaciones Químicas

Sin cambios de esquema. Este documento mapea las fuentes de datos existentes a los shapes de salida y define las agregaciones.

## Tablas fuente (todas existentes)

| Tabla | Rol en la feature | Campos usados |
|---|---|---|
| `aplicaciones_quimicas` | raíz; ya paginada | todos los actuales + `lote_quimico_id`, `dosis`, `dosis_unidad`, `withholding_period_dias` (snapshot del principal) |
| `aplicaciones_quimicas_detalle` | una fila por lote usado (incluye principal) | `aplicacion_id`, `lote_quimico_id`, `cantidad`, `unidad_medida` |
| `aplicacion_quimica_mesa` | vínculo greenhouse (PK compuesto ⇒ mesas distintas) | `aplicacion_id`, `mesa_id` |
| `aplicacion_quimica_bandeja` | vínculo nursery (PK compuesto ⇒ bandejas distintas) | `aplicacion_id`, `bandeja_id` |
| `mesas` | enriquecimiento greenhouse | `id`, `nombre`, `posicion_actual`, `estado`, `tunel_id` |
| `tuneles` | agrupador greenhouse | `id`, `nombre` |
| `bandejas` | enriquecimiento nursery | `id`, `codigo`, `estado`, `siembra_id`, `lote_semilla_id`, `lote_sustrato_id` |
| `siembras` | agrupador nursery | `id`, `created_at` |
| `lotes` | seed_lot / substrate_lot | `id`, `numero_lote`, `producto_id`, `variedad_id` |
| `productos` / `variedades` | product / variety | `id`, `nombre` |
| `lotes_quimicos` | lot_name, supplier | `id`, `numero_lote`, `quimico_id`, `proveedor_id` |
| `quimicos` | chemical_name, brand | `id`, `nombre`, `unidad_medida`, `marca_id` |
| `marcas` / `proveedores` | brand / supplier | `id`, `nombre` |
| `users` | usuario responsable | `id`, `nombre`, `apellido`, `email` — **select explícito, jamás `password_hash`** |

## Tipos de salida (nuevo archivo `types/aplicacion-enriched.types.ts`)

```typescript
interface UsuarioResumen { id: string; nombre: string | null; apellido: string | null; email: string; }

interface ChemicalLine {
  lote_quimico_id: string;
  chemical_id: string | null;
  chemical_name: string | null;
  lot_name: string | null;
  quantity: number | null;          // detalle.cantidad (numeric → number, null preservado)
  unit: string | null;              // detalle.unidad_medida
  dose: number | null;              // solo línea principal (snapshot aplicacion.dosis)
  dose_unit: string | null;         // solo línea principal
  withholding_period_days: number | null; // solo línea principal
  brand: { id: string; nombre: string } | null;
  supplier: { id: string; nombre: string } | null;
}

interface TunnelSummary { id: string | null; nombre: string | null; table_count: number; }

interface SeedingSummary {
  id: string | null;
  created_at: Date | null;
  tray_count: number;
  product: { id: string; nombre: string } | null;   // null si heterogéneo o inexistente
  variety: { id: string; nombre: string } | null;
}

interface TargetSummary { tunnels: TunnelSummary[]; seedings: SeedingSummary[]; }

// Item de listado = AplicacionQuimica (todos los campos actuales) +
interface AplicacionListItem extends AplicacionQuimica {
  usuario: UsuarioResumen | null;
  target_count: number;
  target_summary: TargetSummary;
  chemical_lines: ChemicalLine[];
}

// Detalle greenhouse
interface GreenhouseTargets {
  context: 'greenhouse';
  total: number;                     // mesas distintas
  tunnels: Array<{
    id: string | null;
    nombre: string | null;
    tables: Array<{ id: string; nombre: string | null; posicion_actual: number | null; estado: string | null }>;
  }>;
}

// Detalle nursery
interface NurseryTargets {
  context: 'nursery';
  total: number;                     // bandejas distintas
  seedings: Array<{
    id: string | null;
    created_at: Date | null;
    tray_count: number;
    product: { id: string; nombre: string } | null;
    variety: { id: string; nombre: string } | null;
    seed_lot: { id: string; numero_lote: string } | null;      // null si heterogéneo
    substrate_lot: { id: string; numero_lote: string } | null; // null si heterogéneo
    trays: Array<{ id: string; codigo: string | null; estado: string | null }>;
  }>;
}

// Respuesta de detalle = shape actual (aplicacion, detalles, mesa_ids?/bandeja_ids?) + usuario en aplicacion + targets
```

## Reglas de agregación

1. **`target_count`** (listado) = `COUNT(*)` de filas de vínculo por `aplicacion_id` (el PK compuesto garantiza distintos). Greenhouse: suma de `table_count`; nursery: suma de `tray_count`. Sin vínculos ⇒ `0` con arrays vacíos.
2. **Agrupación greenhouse** = `GROUP BY aplicacion_id, tunel_id`; mesa cuyo `mesa_id` no resuelve fila en `mesas` se agrupa bajo túnel `null` (bucket "desconocido") para no perder el conteo.
3. **Agrupación nursery** = `GROUP BY aplicacion_id, siembra_id (+ producto/variedad)`; si un `(aplicacion_id, siembra_id)` emite >1 fila por heterogeneidad, se colapsa en memoria: `tray_count` sumado, `product`/`variety` ⇒ `null`. Igual regla para `seed_lot`/`substrate_lot` en el detalle.
4. **Línea principal** = primera fila de detalle cuyo `lote_quimico_id === aplicacion.lote_quimico_id`; solo esa recibe `dose`/`dose_unit`/`withholding_period_days` del snapshot. Si el mismo lote aparece otra vez como adicional, la segunda fila queda con esos campos en `null` (las filas de detalle se muestran tal como se registraron).
5. **Usuario** = lookup en `Map<user_id, UsuarioResumen>`; ausente ⇒ `null` con `usuario_id` intacto.
6. **Numéricos** = `numeric` llega como `string` del driver; conversión con helper `toNumberOrNull()` — jamás `?? 0`.

## Validación / invariantes

- `targets.total === mesa_ids.length` (greenhouse) y `targets.total === bandeja_ids.length` (nursery) en el detalle.
- `target_count === Σ table_count` / `Σ tray_count` en el listado.
- Ningún campo existente cambia de nombre ni tipo (verificable comparando respuestas pre/post).
- Toda query nueva incluye scope por tenant (directo o heredado de los `aplicacion_id` de la página, que ya están tenant-filtrados; `users` filtra `tenant_id` explícito).
