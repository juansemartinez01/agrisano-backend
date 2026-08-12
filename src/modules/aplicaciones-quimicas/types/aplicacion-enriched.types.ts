import { AplicacionQuimica } from '../entities/aplicacion-quimica.entity';
import { UsuarioResumen } from 'src/common/utils/usuario-resumen.util';

export type { UsuarioResumen };

// ──────────────────────────────────────────────────────────────────────
// Shapes enriquecidos de respuesta (aditivos sobre el contrato actual)
// ──────────────────────────────────────────────────────────────────────

export interface RefNombre {
  id: string;
  nombre: string;
}

export interface LoteRef {
  id: string;
  numero_lote: string;
}

/** El grado solo existe en los lotes de vermiculita; semilla y sustrato lo
 *  tienen siempre en NULL, así que no sube a LoteRef. */
export interface LoteVermiculitaRef extends LoteRef {
  grado: number;
}

export interface ChemicalLine {
  lote_quimico_id: string;
  chemical_id: string | null;
  chemical_name: string | null;
  lot_name: string | null;
  quantity: number | null;
  unit: string | null;
  dose: number | null;
  dose_unit: string | null;
  /** Solo la línea principal lleva withholding (snapshot de la aplicación, no existe por detalle). */
  withholding_period_days: number | null;
  brand: RefNombre | null;
  supplier: RefNombre | null;
}

// Contrato canónico de "lote químico enriquecido", compartido entre el
// detalle de aplicaciones-quimicas y trazabilidad — una sola fuente de
// verdad para evitar que ambos módulos diverjan en el shape (p. ej. dónde
// cuelga `marca`).
export interface LoteQuimicoEnriquecido {
  id: string;
  numero_lote: string;
  quimico: RefNombre | null;
  marca: RefNombre | null;
  proveedor: RefNombre | null;
}

export interface AplicacionDetalleLine {
  id: string;
  aplicacion_id: string;
  lote_quimico_id: string;
  dosis: number | null;
  dosis_unidad: string | null;
  cantidad: number | null;
  unidad_medida: string | null;
  lote_quimico: LoteQuimicoEnriquecido | null;
}

export interface TunnelSummary {
  id: string | null;
  nombre: string | null;
  table_count: number;
}

export interface SeedingSummary {
  id: string | null;
  created_at: Date | null;
  tray_count: number;
  /** null si las bandejas afectadas de la siembra son heterogéneas o el recurso no resuelve. */
  product: RefNombre | null;
  variety: RefNombre | null;
}

export interface TargetSummary {
  tunnels: TunnelSummary[];
  seedings: SeedingSummary[];
}

export interface AplicacionListItem extends AplicacionQuimica {
  usuario: UsuarioResumen | null;
  target_count: number;
  target_summary: TargetSummary;
  chemical_lines: ChemicalLine[];
}

// ── Detalle ───────────────────────────────────────────────────────────

export interface GreenhouseTable {
  id: string;
  nombre: string | null;
  posicion_actual: number | null;
  estado: string | null;
}

export interface GreenhouseTunnelGroup {
  id: string | null;
  nombre: string | null;
  tables: GreenhouseTable[];
}

export interface GreenhouseTargets {
  context: 'greenhouse';
  total: number;
  tunnels: GreenhouseTunnelGroup[];
}

export interface NurseryTray {
  id: string;
  codigo: string | null;
  estado: string | null;
}

export interface NurserySeedingGroup {
  id: string | null;
  created_at: Date | null;
  tray_count: number;
  product: RefNombre | null;
  variety: RefNombre | null;
  seed_lot: LoteRef | null;
  substrate_lot: LoteRef | null;
  vermiculite_lot: LoteVermiculitaRef | null;
  trays: NurseryTray[];
}

export interface NurseryTargets {
  context: 'nursery';
  total: number;
  seedings: NurserySeedingGroup[];
}

export interface AplicacionDetalleEnriquecida {
  aplicacion: AplicacionQuimica & { usuario: UsuarioResumen | null };
  detalles: AplicacionDetalleLine[];
  bandeja_ids?: string[];
  mesa_ids?: string[];
  targets: GreenhouseTargets | NurseryTargets;
}

// ──────────────────────────────────────────────────────────────────────
// Filas crudas de las queries batch (getRawMany)
// ──────────────────────────────────────────────────────────────────────

export interface ChemicalLineRaw {
  id: string;
  aplicacion_id: string;
  lote_quimico_id: string;
  dosis: string | number | null;
  dosis_unidad: string | null;
  cantidad: string | number | null;
  unidad_medida: string | null;
  lote_numero: string | null;
  quimico_id: string | null;
  quimico_nombre: string | null;
  marca_id: string | null;
  marca_nombre: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
}

export interface GreenhouseSummaryRaw {
  aplicacion_id: string;
  tunel_id: string | null;
  tunel_nombre: string | null;
  table_count: string | number;
}

export interface NurserySummaryRaw {
  aplicacion_id: string;
  siembra_id: string | null;
  siembra_created_at: Date | null;
  producto_id: string | null;
  producto_nombre: string | null;
  variedad_id: string | null;
  variedad_nombre: string | null;
  tray_count: string | number;
}

export interface GreenhouseTargetRaw {
  mesa_id: string;
  mesa_nombre: string | null;
  posicion_actual: number | null;
  mesa_estado: string | null;
  tunel_id: string | null;
  tunel_nombre: string | null;
}

export interface NurseryTargetRaw {
  bandeja_id: string;
  bandeja_codigo: string | null;
  bandeja_estado: string | null;
  siembra_id: string | null;
  siembra_created_at: Date | null;
  lote_semilla_id: string | null;
  lote_semilla_numero: string | null;
  lote_sustrato_id: string | null;
  lote_sustrato_numero: string | null;
  lote_vermiculita_id: string | null;
  lote_vermiculita_numero: string | null;
  lote_vermiculita_grado: number | null;
  producto_id: string | null;
  producto_nombre: string | null;
  variedad_id: string | null;
  variedad_nombre: string | null;
}
