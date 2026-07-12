import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { CosechaService } from 'src/modules/cosecha/cosecha.service';
import { MesasService, MesaWithTunel } from 'src/modules/mesas/mesas.service';
import { Cosecha } from 'src/modules/cosecha/entities/cosecha.entity';

// ---------------------------------------------------------------------------
// Result interfaces for raw query rows
// ---------------------------------------------------------------------------

interface MesaRow {
  id: string;
  codigo_qr: string;
  estado: string;
  tunel_id: string | null;
  establecimiento_id: string | null;
}

interface CycleDateRow {
  cycle_date: string | null;
}

interface BandejaCicloRaw {
  bandeja_id: string;
  fecha_trasplante: string;
  siembra_id: string;
  lote_semilla_id: string;
  lote_sustrato_id: string;
  estado: string;
  s_id: string | null;
  s_fecha: string | null;
  s_obs: string | null;
  s_usuario_id: string | null;
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
  siembra: SiembraInfo | null;
}

interface AplicacionRow {
  id: string;
  fecha_hora: string;
  observaciones: string | null;
  usuario_id: string;
  detalles: Record<string, unknown>[] | null;
}

interface PackingRow {
  id: string;
  fecha_hora: string;
  peso_bruto_kg: string;
  usuario_id: string;
  observaciones: string | null;
  categorias: Record<string, unknown>[] | null;
}

interface CosechaMesaRow {
  id: string;
  fecha_hora: string;
  peso_kg: string;
  tunel_id: string | null;
  packing_id: string | null;
  peso_bruto_kg: string | null;
  categorias: Record<string, unknown>[] | null;
}

// ---------------------------------------------------------------------------
// Return shape interfaces
// ---------------------------------------------------------------------------

export interface TrazabilidadCosechaResult {
  cosecha: Cosecha;
  mesa: MesaRow | null;
  packing: PackingRow | null;
  bandejas_ciclo: BandejaCicloRow[];
  aplicaciones_invernadero: AplicacionRow[];
  aplicaciones_nursery: AplicacionRow[];
}

interface CosechaIndexEntry {
  cosecha_id: string;
  fecha_hora: string;
  peso_kg: string;
  packing: { peso_bruto_kg: string; categorias: Record<string, unknown>[] } | null;
}

export interface TrazabilidadMesaResult {
  mesa: {
    id: string;
    codigo_qr: string;
    estado: string;
    tunel_id: string | null;
    establecimiento_id: string | null;
  };
  cosechas: CosechaIndexEntry[];
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

    // STEP 2 — Load mesa info
    const mesaRows = await this.dataSource.query<MesaRow[]>(
      `SELECT id, codigo_qr, estado, tunel_id, establecimiento_id
       FROM mesas
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [cosecha.mesa_id, tenantId],
    );
    const mesa: MesaRow | null = mesaRows[0] ?? null;

    // STEP 3 — Determine cycle transplant date
    const cycleDateRows = await this.dataSource.query<CycleDateRow[]>(
      `SELECT MAX(mb.fecha_trasplante) AS cycle_date
       FROM mesa_bandeja mb
       JOIN bandejas b ON b.id = mb.bandeja_id
       WHERE mb.mesa_id = $1 AND mb.fecha_trasplante <= $2 AND b.tenant_id = $3`,
      [cosecha.mesa_id, cosecha.fecha_hora, tenantId],
    );
    const cycleDate: string | null = cycleDateRows[0]?.cycle_date ?? null;

    // STEP 4 — Load cycle bandejas with siembra + lote lineage (single comprehensive query)
    let bandejasCiclo: BandejaCicloRow[] = [];
    let bandejaIds: string[] = [];

    if (cycleDate) {
      const mbRows = await this.dataSource.query<BandejaCicloRaw[]>(
        `SELECT mb.bandeja_id, mb.fecha_trasplante,
                b.siembra_id, b.lote_semilla_id, b.lote_sustrato_id, b.estado,
                s.id AS s_id, s.fecha AS s_fecha, s.observaciones AS s_obs, s.usuario_id AS s_usuario_id,
                ls.numero_lote AS lote_semilla_numero, ls.tipo AS lote_semilla_tipo,
                lsu.numero_lote AS lote_sustrato_numero, lsu.tipo AS lote_sustrato_tipo
         FROM mesa_bandeja mb
         JOIN bandejas b ON b.id = mb.bandeja_id
         LEFT JOIN siembras s ON s.id = b.siembra_id
         LEFT JOIN lotes ls ON ls.id = b.lote_semilla_id
         LEFT JOIN lotes lsu ON lsu.id = b.lote_sustrato_id
         WHERE mb.mesa_id = $1 AND mb.fecha_trasplante = $2 AND b.tenant_id = $3`,
        [cosecha.mesa_id, cycleDate, tenantId],
      );

      bandejaIds = mbRows.map((r) => r.bandeja_id);
      bandejasCiclo = mbRows.map((r): BandejaCicloRow => ({
        bandeja_id: r.bandeja_id,
        fecha_trasplante: r.fecha_trasplante,
        siembra_id: r.siembra_id,
        lote_semilla_id: r.lote_semilla_id,
        lote_sustrato_id: r.lote_sustrato_id,
        estado: r.estado,
        siembra: r.s_id
          ? {
              id: r.s_id,
              fecha: r.s_fecha!,
              observaciones: r.s_obs,
              usuario_id: r.s_usuario_id!,
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
    }

    // STEP 5 — Load packing (if exists)
    const packingRows = await this.dataSource.query<PackingRow[]>(
      `SELECT lp.id, lp.fecha_hora, lp.peso_bruto_kg, lp.usuario_id, lp.observaciones,
              json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
       FROM lotes_packing lp
       LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
       WHERE lp.cosecha_id = $1 AND lp.tenant_id = $2
       GROUP BY lp.id`,
      [cosecha_id, tenantId],
    );
    const packing: PackingRow | null = packingRows[0] ?? null;

    // STEP 6 — Load greenhouse chemical applications (only if cycleDate is not null)
    let aplicacionesInvernadero: AplicacionRow[] = [];
    if (cycleDate) {
      aplicacionesInvernadero = await this.dataSource.query<AplicacionRow[]>(
        `SELECT a.id, a.fecha_hora, a.observaciones, a.usuario_id,
                json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles
         FROM aplicaciones_quimicas a
         JOIN aplicacion_quimica_mesa aqm ON aqm.aplicacion_id = a.id
         LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id
         WHERE aqm.mesa_id = $1
           AND a.fecha_hora >= $2
           AND a.fecha_hora <= $3
           AND a.tenant_id = $4
         GROUP BY a.id
         ORDER BY a.fecha_hora ASC`,
        [cosecha.mesa_id, cycleDate, cosecha.fecha_hora, tenantId],
      );
    }

    // STEP 7 — Load nursery chemical applications (only if bandejaIds not empty)
    let aplicacionesNursery: AplicacionRow[] = [];
    if (bandejaIds.length > 0) {
      aplicacionesNursery = await this.dataSource.query<AplicacionRow[]>(
        `SELECT a.id, a.fecha_hora, a.observaciones, a.usuario_id,
                json_agg(row_to_json(aqd)) FILTER (WHERE aqd.id IS NOT NULL) AS detalles
         FROM aplicaciones_quimicas a
         JOIN aplicacion_quimica_bandeja aqb ON aqb.aplicacion_id = a.id
         LEFT JOIN aplicaciones_quimicas_detalle aqd ON aqd.aplicacion_id = a.id
         WHERE aqb.bandeja_id = ANY($1::uuid[])
           AND a.contexto = 'nursery'
           AND a.tenant_id = $2
         GROUP BY a.id
         ORDER BY a.fecha_hora ASC`,
        [bandejaIds, tenantId],
      );
    }

    return {
      cosecha,
      mesa,
      packing,
      bandejas_ciclo: bandejasCiclo,
      aplicaciones_invernadero: aplicacionesInvernadero,
      aplicaciones_nursery: aplicacionesNursery,
    };
  }

  async getTrazabilidadByMesa(
    mesa_id: string,
  ): Promise<TrazabilidadMesaResult> {
    // STEP 1 — Validate mesa (throws MESA_NOT_FOUND 404 if missing/wrong tenant)
    const tenantId = this.tenancy.requireTenantId();
    const mesa: MesaWithTunel = await this.mesasService.getMesaById(
      mesa_id,
      tenantId,
    );

    // STEP 2 — Load all cosechas with packing summary
    const rows = await this.dataSource.query<CosechaMesaRow[]>(
      `SELECT c.id, c.fecha_hora, c.peso_kg, c.tunel_id,
              lp.id AS packing_id, lp.peso_bruto_kg,
              json_agg(row_to_json(lpc)) FILTER (WHERE lpc.id IS NOT NULL) AS categorias
       FROM cosechas c
       LEFT JOIN lotes_packing lp ON lp.cosecha_id = c.id
       LEFT JOIN lotes_packing_categorias lpc ON lpc.lote_packing_id = lp.id
       WHERE c.mesa_id = $1 AND c.tenant_id = $2
       GROUP BY c.id, lp.id, lp.peso_bruto_kg
       ORDER BY c.fecha_hora DESC`,
      [mesa_id, tenantId],
    );

    return {
      mesa: {
        id: mesa.id,
        codigo_qr: mesa.codigo_qr,
        estado: mesa.estado,
        tunel_id: mesa.tunel_id,
        establecimiento_id: mesa.establecimiento_id,
      },
      cosechas: rows.map(
        (r): CosechaIndexEntry => ({
          cosecha_id: r.id,
          fecha_hora: r.fecha_hora,
          peso_kg: r.peso_kg,
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
