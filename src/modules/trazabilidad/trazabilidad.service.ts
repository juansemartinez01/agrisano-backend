import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { CosechaService } from 'src/modules/cosecha/cosecha.service';
import { MesasService, MesaWithTunel } from 'src/modules/mesas/mesas.service';
import { Cosecha } from 'src/modules/cosecha/entities/cosecha.entity';

// ---------------------------------------------------------------------------
// Shared enrichment shapes
// ---------------------------------------------------------------------------

interface UsuarioResumen {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
}

interface MarcaResumen {
  id: string;
  nombre: string;
}

interface ProveedorResumen {
  id: string;
  nombre: string;
}

interface ProductoResumen {
  id: string;
  nombre: string;
}

interface VariedadResumen {
  id: string;
  nombre: string;
}

interface EstablecimientoResumen {
  id: string;
  nombre: string;
}

interface QuimicoResumen {
  id: string;
  nombre: string;
  marca: MarcaResumen | null;
}

interface LoteQuimicoResumen {
  id: string;
  numero_lote: string;
  quimico: QuimicoResumen | null;
  proveedor: ProveedorResumen | null;
}

interface AplicacionDetalleEnriquecido {
  id: string;
  aplicacion_id: string;
  lote_quimico_id: string;
  cantidad: string;
  unidad_medida: string;
  lote_quimico: LoteQuimicoResumen | null;
}

// ---------------------------------------------------------------------------
// Raw query row interfaces
// ---------------------------------------------------------------------------

interface MesaRawRow {
  id: string;
  codigo_qr: string;
  estado: string;
  tunel_id: string | null;
  establecimiento_id: string | null;
  nombre: string;
  carencia_hasta: string | null;
  tunel_nombre: string | null;
  est_id: string | null;
  est_nombre: string | null;
}

interface CycleDateRow {
  cycle_date: string | null;
}

interface CosechaEnrichRow {
  producto_id: string | null;
  producto_nombre: string | null;
  variedad_id: string | null;
  variedad_nombre: string | null;
  usuario_email: string | null;
  usuario_nombre: string | null;
  usuario_apellido: string | null;
}

interface BandejaCicloRaw {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
  carencia_hasta: string | null;
  s_id: string | null;
  s_fecha: string | null;
  s_obs: string | null;
  s_usuario_id: string | null;
  su_email: string | null;
  su_nombre: string | null;
  su_apellido: string | null;
  lote_semilla_numero: string | null;
  lote_semilla_tipo: string | null;
  lote_sustrato_numero: string | null;
  lote_sustrato_tipo: string | null;
}

interface SiembraInfo {
  id: string;
  fecha: string;
  observaciones: string | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  lote_semilla: { id: string; numero_lote: string; tipo: string };
  lote_sustrato: { id: string; numero_lote: string; tipo: string };
}

interface BandejaCicloRow {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
  carencia_hasta: string | null;
  siembra: SiembraInfo | null;
}

interface AplicacionRawRow {
  id: string;
  fecha_hora: string;
  observaciones: string | null;
  usuario_id: string;
  contexto: string;
  establecimiento_id: string;
  lote_quimico_id: string | null;
  dosis: string | null;
  dosis_unidad: string | null;
  batch: string | null;
  withholding_period_dias: number | null;
  au_email: string | null;
  au_nombre: string | null;
  au_apellido: string | null;
  hlq_id: string | null;
  hlq_numero_lote: string | null;
  hq_id: string | null;
  hq_nombre: string | null;
  hm_id: string | null;
  hm_nombre: string | null;
  hp_id: string | null;
  hp_nombre: string | null;
  detalles: AplicacionDetalleEnriquecido[] | null;
}

interface AplicacionRow {
  id: string;
  fecha_hora: string;
  observaciones: string | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  contexto: string;
  establecimiento_id: string;
  lote_quimico_id: string | null;
  dosis: string | null;
  dosis_unidad: string | null;
  batch: string | null;
  withholding_period_dias: number | null;
  lote_quimico: LoteQuimicoResumen | null;
  carencia_hasta_calculada: string | null;
  detalles: AplicacionDetalleEnriquecido[] | null;
}

interface PackingRawRow {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: string;
  usuario_id: string;
  observaciones: string | null;
  pu_email: string | null;
  pu_nombre: string | null;
  pu_apellido: string | null;
  categorias: Record<string, unknown>[] | null;
}

interface PackingRow {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: string;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  observaciones: string | null;
  categorias: Record<string, unknown>[] | null;
}

interface CosechaMesaRawRow {
  id: string;
  fecha_hora: string;
  peso_kg: string | null;
  tunel_id: string | null;
  producto_id: string | null;
  producto_nombre: string | null;
  variedad_id: string | null;
  variedad_nombre: string | null;
  usuario_id: string;
  usuario_email: string | null;
  usuario_nombre: string | null;
  usuario_apellido: string | null;
  observaciones: string | null;
  posicion_al_momento: number;
  packing_id: string | null;
  peso_bruto_kg: string | null;
  categorias: Record<string, unknown>[] | null;
}

// ---------------------------------------------------------------------------
// Return shape interfaces
// ---------------------------------------------------------------------------

type CosechaEnriquecida = Cosecha & {
  producto: ProductoResumen | null;
  variedad: VariedadResumen | null;
  usuario: UsuarioResumen | null;
};

interface MesaResumen {
  id: string;
  codigo_qr: string;
  nombre: string;
  estado: string;
  tunel_id: string | null;
  tunel: { nombre: string } | null;
  establecimiento_id: string | null;
  establecimiento: EstablecimientoResumen | null;
  carencia_hasta: string | null;
}

export interface TrazabilidadCosechaResult {
  cosecha: CosechaEnriquecida;
  mesa: MesaResumen | null;
  packing: PackingRow | null;
  bandejas_ciclo: BandejaCicloRow[];
  aplicaciones_invernadero: AplicacionRow[];
  aplicaciones_nursery: AplicacionRow[];
  alerta_carencia_incumplida: boolean;
}

interface CosechaIndexEntry {
  cosecha_id: string;
  fecha_hora: string;
  peso_kg: string | null;
  producto_id: string | null;
  producto: ProductoResumen | null;
  variedad_id: string | null;
  variedad: VariedadResumen | null;
  usuario_id: string;
  usuario: UsuarioResumen | null;
  observaciones: string | null;
  posicion_al_momento: number;
  packing: { peso_bruto_kg: string; categorias: Record<string, unknown>[] } | null;
}

export interface TrazabilidadMesaResult {
  mesa: MesaResumen;
  cosechas: CosechaIndexEntry[];
}

// ---------------------------------------------------------------------------
// SQL fragments shared between the invernadero/nursery application queries
// ---------------------------------------------------------------------------

const APLICACION_SELECT = `
  a.id, a.fecha_hora, a.observaciones, a.usuario_id, a.contexto, a.establecimiento_id,
  a.lote_quimico_id, a.dosis, a.dosis_unidad, a.batch, a.withholding_period_dias,
  au.email AS au_email, au.nombre AS au_nombre, au.apellido AS au_apellido,
  hlq.id AS hlq_id, hlq.numero_lote AS hlq_numero_lote,
  hq.id AS hq_id, hq.nombre AS hq_nombre,
  hm.id AS hm_id, hm.nombre AS hm_nombre,
  hp.id AS hp_id, hp.nombre AS hp_nombre,
  json_agg(
    json_build_object(
      'id', aqd.id,
      'aplicacion_id', aqd.aplicacion_id,
      'lote_quimico_id', aqd.lote_quimico_id,
      'cantidad', aqd.cantidad,
      'unidad_medida', aqd.unidad_medida,
      'lote_quimico', CASE WHEN dlq.id IS NOT NULL THEN json_build_object(
        'id', dlq.id,
        'numero_lote', dlq.numero_lote,
        'quimico', CASE WHEN dq.id IS NOT NULL THEN json_build_object(
          'id', dq.id, 'nombre', dq.nombre,
          'marca', CASE WHEN dm.id IS NOT NULL THEN json_build_object('id', dm.id, 'nombre', dm.nombre) ELSE NULL END
        ) ELSE NULL END,
        'proveedor', CASE WHEN dp.id IS NOT NULL THEN json_build_object('id', dp.id, 'nombre', dp.nombre) ELSE NULL END
      ) ELSE NULL END
    )
  ) FILTER (WHERE aqd.id IS NOT NULL) AS detalles
`;

const APLICACION_JOINS = `
  LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id
  LEFT JOIN lotes_quimicos dlq ON dlq.id = aqd.lote_quimico_id
  LEFT JOIN quimicos dq ON dq.id = dlq.quimico_id
  LEFT JOIN marcas dm ON dm.id = dq.marca_id
  LEFT JOIN proveedores dp ON dp.id = dlq.proveedor_id
  LEFT JOIN users au ON au.id = a.usuario_id
  LEFT JOIN lotes_quimicos hlq ON hlq.id = a.lote_quimico_id
  LEFT JOIN quimicos hq ON hq.id = hlq.quimico_id
  LEFT JOIN marcas hm ON hm.id = hq.marca_id
  LEFT JOIN proveedores hp ON hp.id = hlq.proveedor_id
`;

const APLICACION_GROUP_BY = `GROUP BY a.id, au.id, hlq.id, hq.id, hm.id, hp.id`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeCarenciaHasta(
  fechaAplicacion: string,
  diasCarencia: number | null,
): string | null {
  if (diasCarencia == null) return null;
  const base = new Date(fechaAplicacion);
  base.setUTCDate(base.getUTCDate() + diasCarencia);
  return base.toISOString();
}

function toUsuarioResumen(
  id: string,
  email: string | null,
  nombre: string | null,
  apellido: string | null,
): UsuarioResumen | null {
  return email ? { id, email, nombre, apellido } : null;
}

function mapAplicacionRow(r: AplicacionRawRow): AplicacionRow {
  return {
    id: r.id,
    fecha_hora: r.fecha_hora,
    observaciones: r.observaciones,
    usuario_id: r.usuario_id,
    usuario: toUsuarioResumen(r.usuario_id, r.au_email, r.au_nombre, r.au_apellido),
    contexto: r.contexto,
    establecimiento_id: r.establecimiento_id,
    lote_quimico_id: r.lote_quimico_id,
    dosis: r.dosis,
    dosis_unidad: r.dosis_unidad,
    batch: r.batch,
    withholding_period_dias: r.withholding_period_dias,
    lote_quimico: r.hlq_id
      ? {
          id: r.hlq_id,
          numero_lote: r.hlq_numero_lote!,
          quimico: r.hq_id
            ? {
                id: r.hq_id,
                nombre: r.hq_nombre!,
                marca: r.hm_id ? { id: r.hm_id, nombre: r.hm_nombre! } : null,
              }
            : null,
          proveedor: r.hp_id ? { id: r.hp_id, nombre: r.hp_nombre! } : null,
        }
      : null,
    carencia_hasta_calculada: computeCarenciaHasta(r.fecha_hora, r.withholding_period_dias),
    detalles: r.detalles,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TrazabilidadService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly cosechaService: CosechaService,
    private readonly mesasService: MesasService,
  ) {}

  async getTrazabilidadByCosecha(
    cosecha_id: string,
  ): Promise<TrazabilidadCosechaResult> {
    // STEP 1 — Validate cosecha (throws COSECHA_NOT_FOUND 404 if missing/wrong tenant)
    const tenantId = this.tenancy.requireTenantId();
    const cosecha = await this.cosechaService.getCosechaById(cosecha_id, tenantId);

    // STEP 2 — Load mesa, cycle transplant date, packing, and cosecha-level catalog/user
    // enrichment in parallel: none of these four depend on each other's result.
    const [mesaRows, cycleDateRows, packingRows, cosechaEnrichRows] = await Promise.all([
      this.dataSource.query<MesaRawRow[]>(
        `SELECT m.id, m.codigo_qr, m.estado, m.tunel_id, m.establecimiento_id, m.nombre, m.carencia_hasta,
                t.nombre AS tunel_nombre,
                e.id AS est_id, e.nombre AS est_nombre
         FROM mesas m
         LEFT JOIN tuneles t ON t.id = m.tunel_id
         LEFT JOIN establecimientos e ON e.id = m.establecimiento_id
         WHERE m.id = $1 AND m.tenant_id = $2 AND m.deleted_at IS NULL`,
        [cosecha.mesa_id, tenantId],
      ),
      this.dataSource.query<CycleDateRow[]>(
        `SELECT MAX(mb.fecha_trasplante) AS cycle_date
         FROM mesa_bandeja mb
         JOIN bandejas b ON b.id = mb.bandeja_id
         WHERE mb.mesa_id = $1 AND mb.fecha_trasplante <= $2 AND b.tenant_id = $3`,
        [cosecha.mesa_id, cosecha.fecha_hora, tenantId],
      ),
      this.dataSource.query<PackingRawRow[]>(
        `SELECT lp.id, lp.fecha_hora, lp.peso_bruto_kg, lp.usuario_id, lp.observaciones,
                pu.email AS pu_email, pu.nombre AS pu_nombre, pu.apellido AS pu_apellido,
                json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
         FROM lotes_packing lp
         LEFT JOIN users pu ON pu.id = lp.usuario_id
         LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
         WHERE lp.cosecha_id = $1 AND lp.tenant_id = $2
         GROUP BY lp.id, pu.id`,
        [cosecha_id, tenantId],
      ),
      this.dataSource.query<CosechaEnrichRow[]>(
        `SELECT p.id AS producto_id, p.nombre AS producto_nombre,
                v.id AS variedad_id, v.nombre AS variedad_nombre,
                u.email AS usuario_email, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
         FROM (SELECT $1::uuid AS producto_id, $2::uuid AS variedad_id, $3::uuid AS usuario_id) x
         LEFT JOIN productos p ON p.id = x.producto_id
         LEFT JOIN variedades v ON v.id = x.variedad_id
         LEFT JOIN users u ON u.id = x.usuario_id`,
        [cosecha.producto_id, cosecha.variedad_id, cosecha.usuario_id],
      ),
    ]);

    const mesaRaw: MesaRawRow | null = mesaRows[0] ?? null;
    const cycleDate: string | null = cycleDateRows[0]?.cycle_date ?? null;
    const packingRaw: PackingRawRow | null = packingRows[0] ?? null;
    const enrich: CosechaEnrichRow | undefined = cosechaEnrichRows[0];

    const mesa: MesaResumen | null = mesaRaw
      ? {
          id: mesaRaw.id,
          codigo_qr: mesaRaw.codigo_qr,
          nombre: mesaRaw.nombre,
          estado: mesaRaw.estado,
          tunel_id: mesaRaw.tunel_id,
          tunel: mesaRaw.tunel_nombre ? { nombre: mesaRaw.tunel_nombre } : null,
          establecimiento_id: mesaRaw.establecimiento_id,
          establecimiento: mesaRaw.est_id ? { id: mesaRaw.est_id, nombre: mesaRaw.est_nombre! } : null,
          carencia_hasta: mesaRaw.carencia_hasta,
        }
      : null;

    const packing: PackingRow | null = packingRaw
      ? {
          id: packingRaw.id,
          fecha_hora: packingRaw.fecha_hora,
          peso_bruto_kg: packingRaw.peso_bruto_kg,
          usuario_id: packingRaw.usuario_id,
          usuario: toUsuarioResumen(
            packingRaw.usuario_id,
            packingRaw.pu_email,
            packingRaw.pu_nombre,
            packingRaw.pu_apellido,
          ),
          observaciones: packingRaw.observaciones,
          categorias: packingRaw.categorias,
        }
      : null;

    const cosechaEnriquecida: CosechaEnriquecida = {
      ...cosecha,
      producto: enrich?.producto_id ? { id: enrich.producto_id, nombre: enrich.producto_nombre! } : null,
      variedad: enrich?.variedad_id ? { id: enrich.variedad_id, nombre: enrich.variedad_nombre! } : null,
      usuario: toUsuarioResumen(
        cosecha.usuario_id,
        enrich?.usuario_email ?? null,
        enrich?.usuario_nombre ?? null,
        enrich?.usuario_apellido ?? null,
      ),
    };

    // STEP 3 — Load cycle bandejas (with siembra + lote lineage) and greenhouse
    // applications in parallel: both only depend on cycleDate, not on each other.
    let bandejasCiclo: BandejaCicloRow[] = [];
    let bandejaIds: string[] = [];
    let aplicacionesInvernadero: AplicacionRow[] = [];

    if (cycleDate) {
      const [mbRows, invernaderoRaw] = await Promise.all([
        this.dataSource.query<BandejaCicloRaw[]>(
          `SELECT mb.bandeja_id, mb.fecha_trasplante,
                  b.siembra_id, b.lote_semilla_id, b.lote_sustrato_id, b.estado, b.carencia_hasta,
                  s.id AS s_id, s.fecha AS s_fecha, s.observaciones AS s_obs, s.usuario_id AS s_usuario_id,
                  su.email AS su_email, su.nombre AS su_nombre, su.apellido AS su_apellido,
                  ls.numero_lote AS lote_semilla_numero, ls.tipo AS lote_semilla_tipo,
                  lsu.numero_lote AS lote_sustrato_numero, lsu.tipo AS lote_sustrato_tipo
           FROM mesa_bandeja mb
           JOIN bandejas b ON b.id = mb.bandeja_id
           LEFT JOIN siembras s ON s.id = b.siembra_id
           LEFT JOIN users su ON su.id = s.usuario_id
           LEFT JOIN lotes ls ON ls.id = b.lote_semilla_id
           LEFT JOIN lotes lsu ON lsu.id = b.lote_sustrato_id
           WHERE mb.mesa_id = $1 AND mb.fecha_trasplante = $2 AND b.tenant_id = $3`,
          [cosecha.mesa_id, cycleDate, tenantId],
        ),
        this.dataSource.query<AplicacionRawRow[]>(
          `SELECT ${APLICACION_SELECT}
           FROM aplicaciones_quimicas a
           JOIN aplicacion_quimica_mesa aqm ON aqm.aplicacion_id = a.id
           ${APLICACION_JOINS}
           WHERE aqm.mesa_id = $1
             AND a.fecha_hora >= $2
             AND a.fecha_hora <= $3
             AND a.tenant_id = $4
           ${APLICACION_GROUP_BY}
           ORDER BY a.fecha_hora ASC`,
          [cosecha.mesa_id, cycleDate, cosecha.fecha_hora, tenantId],
        ),
      ]);

      bandejaIds = mbRows.map((r) => r.bandeja_id);
      bandejasCiclo = mbRows.map((r): BandejaCicloRow => ({
        bandeja_id: r.bandeja_id,
        fecha_trasplante: r.fecha_trasplante,
        siembra_id: r.siembra_id,
        lote_semilla_id: r.lote_semilla_id,
        lote_sustrato_id: r.lote_sustrato_id,
        estado: r.estado,
        carencia_hasta: r.carencia_hasta,
        siembra: r.s_id
          ? {
              id: r.s_id,
              fecha: r.s_fecha!,
              observaciones: r.s_obs,
              usuario_id: r.s_usuario_id!,
              usuario: toUsuarioResumen(r.s_usuario_id!, r.su_email, r.su_nombre, r.su_apellido),
              lote_semilla: {
                id: r.lote_semilla_id,
                numero_lote: r.lote_semilla_numero!,
                tipo: r.lote_semilla_tipo!,
              },
              lote_sustrato: {
                id: r.lote_sustrato_id,
                numero_lote: r.lote_sustrato_numero!,
                tipo: r.lote_sustrato_tipo!,
              },
            }
          : null,
      }));

      aplicacionesInvernadero = invernaderoRaw.map(mapAplicacionRow);
    }

    // STEP 4 — Load nursery chemical applications (only if bandejaIds not empty)
    let aplicacionesNursery: AplicacionRow[] = [];
    if (bandejaIds.length > 0) {
      const nurseryRaw = await this.dataSource.query<AplicacionRawRow[]>(
        `SELECT ${APLICACION_SELECT}
         FROM aplicaciones_quimicas a
         JOIN aplicacion_quimica_bandeja aqb ON aqb.aplicacion_id = a.id
         ${APLICACION_JOINS}
         WHERE aqb.bandeja_id = ANY($1::uuid[])
           AND a.contexto = 'nursery'
           AND a.tenant_id = $2
         ${APLICACION_GROUP_BY}
         ORDER BY a.fecha_hora ASC`,
        [bandejaIds, tenantId],
      );
      aplicacionesNursery = nurseryRaw.map(mapAplicacionRow);
    }

    // STEP 5 — Compliance flag: was the cosecha registered before any applied
    // chemical's withholding period had elapsed?
    const cosechaFechaMs = new Date(cosecha.fecha_hora).getTime();
    const alertaCarenciaIncumplida = [...aplicacionesInvernadero, ...aplicacionesNursery].some(
      (a) =>
        a.carencia_hasta_calculada != null &&
        new Date(a.carencia_hasta_calculada).getTime() > cosechaFechaMs,
    );

    return {
      cosecha: cosechaEnriquecida,
      mesa,
      packing,
      bandejas_ciclo: bandejasCiclo,
      aplicaciones_invernadero: aplicacionesInvernadero,
      aplicaciones_nursery: aplicacionesNursery,
      alerta_carencia_incumplida: alertaCarenciaIncumplida,
    };
  }

  async getTrazabilidadByMesa(
    mesa_id: string,
  ): Promise<TrazabilidadMesaResult> {
    // STEP 1 — Validate mesa (throws MESA_NOT_FOUND 404 if missing/wrong tenant)
    const tenantId = this.tenancy.requireTenantId();
    const mesa: MesaWithTunel = await this.mesasService.getMesaById(mesa_id, tenantId);

    // STEP 2 — Load all cosechas (with catalog/user/packing enrichment) and the
    // establecimiento name in parallel: independent of each other.
    const [rows, estRows] = await Promise.all([
      this.dataSource.query<CosechaMesaRawRow[]>(
        `SELECT c.id, c.fecha_hora, c.peso_kg, c.tunel_id,
                c.producto_id, c.variedad_id, c.usuario_id, c.observaciones, c.posicion_al_momento,
                p.nombre AS producto_nombre,
                v.nombre AS variedad_nombre,
                u.email AS usuario_email, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido,
                lp.id AS packing_id, lp.peso_bruto_kg,
                json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
         FROM cosechas c
         LEFT JOIN productos p ON p.id = c.producto_id
         LEFT JOIN variedades v ON v.id = c.variedad_id
         LEFT JOIN users u ON u.id = c.usuario_id
         LEFT JOIN lotes_packing lp ON lp.cosecha_id = c.id
         LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
         WHERE c.mesa_id = $1 AND c.tenant_id = $2
         GROUP BY c.id, p.id, v.id, u.id, lp.id, lp.peso_bruto_kg
         ORDER BY c.fecha_hora DESC`,
        [mesa_id, tenantId],
      ),
      mesa.establecimiento_id
        ? this.dataSource.query<{ nombre: string }[]>(
            `SELECT nombre FROM establecimientos WHERE id = $1 AND tenant_id = $2`,
            [mesa.establecimiento_id, tenantId],
          )
        : Promise.resolve([]),
    ]);

    const establecimientoNombre = estRows[0]?.nombre ?? null;

    return {
      mesa: {
        id: mesa.id,
        codigo_qr: mesa.codigo_qr,
        nombre: mesa.nombre,
        estado: mesa.estado,
        tunel_id: mesa.tunel_id,
        tunel: mesa.tunel ? { nombre: mesa.tunel.nombre } : null,
        establecimiento_id: mesa.establecimiento_id,
        establecimiento:
          mesa.establecimiento_id && establecimientoNombre
            ? { id: mesa.establecimiento_id, nombre: establecimientoNombre }
            : null,
        carencia_hasta: mesa.carencia_hasta,
      },
      cosechas: rows.map(
        (r): CosechaIndexEntry => ({
          cosecha_id: r.id,
          fecha_hora: r.fecha_hora,
          peso_kg: r.peso_kg,
          producto_id: r.producto_id,
          producto: r.producto_id ? { id: r.producto_id, nombre: r.producto_nombre! } : null,
          variedad_id: r.variedad_id,
          variedad: r.variedad_id ? { id: r.variedad_id, nombre: r.variedad_nombre! } : null,
          usuario_id: r.usuario_id,
          usuario: toUsuarioResumen(r.usuario_id, r.usuario_email, r.usuario_nombre, r.usuario_apellido),
          observaciones: r.observaciones,
          posicion_al_momento: r.posicion_al_momento,
          packing: r.packing_id
            ? {
                peso_bruto_kg: r.peso_bruto_kg!,
                categorias: r.categorias ?? [],
              }
            : null,
        }),
      ),
    };
  }
}
