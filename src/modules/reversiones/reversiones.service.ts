import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes, type ErrorCode } from 'src/common/errors/error-codes';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { AuditService } from 'src/modules/audit/audit.service';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { RevertirDto } from './dto/revertir.dto';
import {
  contarDesplazadas,
  diferencias,
  parseCosechaDetalle,
  parseTrasplanteDetalle,
  posicionesTrasQuitar,
  posicionesTrasReinsertar,
  resolverEstadoPrevio,
  ultimaPosicion,
  type Posiciones,
} from './reversiones.rules';

export type ReversionTipo = 'trasplante' | 'cosecha' | 'cosecha_y_trasplante';

export const AUDIT = {
  trasplante: 'reversion_trasplante',
  cosecha: 'reversion_cosecha',
  cosecha_y_trasplante: 'reversion_cosecha_y_trasplante',
} as const satisfies Record<ReversionTipo, string>;

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

export interface MesaSnap {
  estado: string;
  tunel_id: string;
  posicion_actual: number | null;
  fecha_ultimo_trasplante: string | null;
}

export interface ReversionResult {
  tipo: ReversionTipo;
  dry_run: boolean;
  /** false en la simulacion: no se cambio nada. */
  aplicado: boolean;
  mesa: {
    id: string;
    nombre: string;
    antes: MesaSnap;
    despues: MesaSnap;
  };
  trasplante_revertido: {
    historial_id: string;
    fecha_hora: string;
    tunel_id: string;
    bandeja_ids: string[];
    /** 'registrado': venia grabado en el trasplante; 'inferido': se dedujo de la cosecha previa. */
    estado_previo_origen: 'registrado' | 'inferido';
  } | null;
  cosecha_revertida: {
    id: string;
    fecha_hora: string;
    tunel_id: string;
    posicion_restaurada: number;
    peso_kg: string | null;
  } | null;
  tuneles: Array<{
    id: string;
    nombre: string;
    mesas_con_posicion_antes: number;
    mesas_con_posicion_despues: number;
    mesas_desplazadas: number;
  }>;
}

interface MesaRow extends MesaSnap {
  id: string;
  nombre: string;
}

interface EventoRow {
  id: string;
  tipo_evento: string;
  fecha_hora: Date;
  detalle: unknown;
}

interface Ctx {
  qr: QueryRunner;
  tenantId: string;
  mesaId: string;
  /** Posiciones de cada tunel tocado, tal como estaban antes de la primera modificacion. */
  posIniciales: Map<string, Map<string, number>>;
  /** Filas completas que se borran o modifican: queda en la auditoria para poder rehacerlo. */
  evidencia: {
    trasplante?: Record<string, unknown>;
    cosecha?: Record<string, unknown>;
  };
}

type TrasplanteRevertido = NonNullable<ReversionResult['trasplante_revertido']>;
type CosechaRevertida = NonNullable<ReversionResult['cosecha_revertida']>;

function rechazo(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  return new AppError({ code, message, status: 409, details });
}

function esErrorPg(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === code
  );
}

@Injectable()
export class ReversionesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Deshace la ULTIMA operacion de una mesa: el trasplante, la cosecha, o las
   * dos (cosecha seguida de trasplante, el error mas comun). Todo corre en una
   * sola transaccion con guardas que rechazan (409) cualquier caso donde algo
   * ocurrio despues y la reversion podria dejar el tunel inconsistente.
   *
   * Con `dry_run` ejecuta lo mismo y hace ROLLBACK al final, asi la vista
   * previa es identica a la operacion real.
   */
  async revertir(
    tipo: ReversionTipo,
    mesaId: string,
    dto: RevertirDto,
    auditReq: AuditReq,
  ): Promise<ReversionResult> {
    const tenantId = this.tenancy.requireTenantId();
    const dryRun = dto.dry_run === true;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Preferimos fallar rapido antes que colgarnos si hay filas bloqueadas.
      await qr.query(`SET LOCAL lock_timeout = '5s'`);
      await qr.query(`SET LOCAL statement_timeout = '60s'`);

      const ctx: Ctx = {
        qr,
        tenantId,
        mesaId,
        posIniciales: new Map(),
        evidencia: {},
      };

      // Se leen los tuneles involucrados, se bloquean sus mesas y recien ahi
      // se valida todo: las guardas se evaluan con el estado ya congelado.
      const previa = await this.cargarMesa(qr, tenantId, mesaId);
      await this.bloquearTuneles(
        qr,
        tenantId,
        mesaId,
        await this.tunelesInvolucrados(qr, tenantId, previa),
      );
      const antes = await this.cargarMesa(qr, tenantId, mesaId);

      let trasplante: TrasplanteRevertido | null = null;
      let cosecha: CosechaRevertida | null = null;

      if (tipo === 'trasplante' || tipo === 'cosecha_y_trasplante') {
        trasplante = await this.deshacerTrasplante(
          ctx,
          tipo === 'cosecha_y_trasplante',
        );
      }
      if (tipo === 'cosecha' || tipo === 'cosecha_y_trasplante') {
        cosecha = await this.deshacerCosecha(ctx);
      }

      const despues = await this.cargarMesa(qr, tenantId, mesaId);
      const tuneles = await this.resumenTuneles(ctx);

      const result: ReversionResult = {
        tipo,
        dry_run: dryRun,
        aplicado: !dryRun,
        mesa: {
          id: mesaId,
          nombre: antes.nombre,
          antes: this.snap(antes),
          despues: this.snap(despues),
        },
        trasplante_revertido: trasplante,
        cosecha_revertida: cosecha,
        tuneles: tuneles.resumen,
      };

      await this.escribirAuditoria(
        ctx,
        tipo,
        dto.motivo ?? null,
        auditReq,
        result,
        tuneles.posicionesAntes,
      );

      if (dryRun) await qr.rollbackTransaction();
      else await qr.commitTransaction();

      if (!dryRun) {
        this.logger.info(
          {
            event: 'reversion_aplicada',
            tipo,
            mesa_id: mesaId,
            tenant_id: tenantId,
          },
          'reversion',
        );
      }
      return result;
    } catch (err) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      if (esErrorPg(err, '55P03') || esErrorPg(err, '57014')) {
        throw rechazo(
          ErrorCodes.REVERSION_TUNEL_OCUPADO,
          'El tunel esta siendo modificado por otra operacion: reintentá en unos segundos',
        );
      }
      if (esErrorPg(err, '23505')) {
        // Tipicamente UQ_mesas_tunel_nombre: mientras la mesa estuvo en otro
        // tunel alguien creo, en el original, una mesa con el mismo nombre.
        throw rechazo(
          ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
          'La reversion choca con datos creados despues (por ejemplo, otra mesa con el mismo nombre en el tunel de origen); no se aplico ningun cambio',
        );
      }
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Trasplante ──────────────────────────────────────────────────────────

  private async deshacerTrasplante(
    ctx: Ctx,
    exigirEnCosecha: boolean,
  ): Promise<TrasplanteRevertido> {
    const { qr, tenantId, mesaId } = ctx;
    const mesa = await this.cargarMesa(qr, tenantId, mesaId);

    if (mesa.estado !== 'activa' || mesa.posicion_actual === null) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_APLICA,
        'La mesa no tiene un trasplante vigente: debe estar activa y posicionada en un tunel',
        { estado: mesa.estado, posicion_actual: mesa.posicion_actual },
      );
    }

    const [ultimo, anterior] = await this.ultimosEventos(qr, mesaId, 2);
    if (!ultimo || ultimo.tipo_evento !== 'trasplante') {
      throw rechazo(
        ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
        'Lo ultimo que le paso a la mesa no fue un trasplante: solo se puede deshacer la ultima operacion',
        { ultimo_evento: this.resumenEvento(ultimo) },
      );
    }

    const det = parseTrasplanteDetalle(ultimo.detalle);
    if (det.bandeja_ids.length === 0) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_APLICA,
        'El ultimo trasplante de la mesa no tiene bandejas registradas (es una carga inicial): no se puede deshacer',
      );
    }
    if (det.tunel_id !== null && det.tunel_id !== mesa.tunel_id) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'El tunel de la mesa no coincide con el del trasplante',
        { tunel_mesa: mesa.tunel_id, tunel_trasplante: det.tunel_id },
      );
    }

    // Nadie entro al tunel detras de la mesa: sacarla del final no obliga a
    // reordenar a nadie. (Las cosechas posteriores de otras mesas no molestan:
    // desplazan posiciones pero la mesa sigue siendo la ultima.)
    const posDestino = await this.posiciones(qr, tenantId, mesa.tunel_id);
    const ultimaPos = ultimaPosicion(posDestino);
    if (mesa.posicion_actual !== ultimaPos) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
        'Despues de este trasplante entraron otras mesas al tunel: solo se puede deshacer la ultima operacion del tunel',
        { posicion_mesa: mesa.posicion_actual, ultima_posicion: ultimaPos },
      );
    }

    await this.verificarBandejas(ctx, det.bandeja_ids);

    // A donde vuelve la mesa.
    let cosechaPreviaTunelId: string | null = null;
    let fechaCicloAnterior: string | null = null;
    if (!det.estado_previo) {
      if (anterior?.tipo_evento === 'cosecha') {
        const cid = parseCosechaDetalle(anterior.detalle).cosecha_id;
        if (cid) {
          const rows = (await qr.query(
            `SELECT tunel_id FROM cosechas WHERE id = $1 AND tenant_id = $2 AND mesa_id = $3`,
            [cid, tenantId, mesaId],
          )) as Array<{ tunel_id: string }>;
          cosechaPreviaTunelId = rows[0]?.tunel_id ?? null;
        }
      }
      // Los trasplantes graban mesas.fecha_ultimo_trasplante y bandejas.fecha_trasplante
      // con el mismo now() de la transaccion: la fecha anterior de la mesa es la
      // de las bandejas del ciclo previo que siguen vinculadas a ella.
      const rows = (await qr.query(
        `SELECT max(b.fecha_trasplante)::text AS fecha
           FROM mesa_bandeja mb
           JOIN bandejas b ON b.id = mb.bandeja_id
          WHERE mb.mesa_id = $1 AND b.mesa_id = $1 AND b.id <> ALL($2::uuid[])`,
        [mesaId, det.bandeja_ids],
      )) as Array<{ fecha: string | null }>;
      fechaCicloAnterior = rows[0]?.fecha ?? null;
    }

    const resolucion = resolverEstadoPrevio({
      registrado: det.estado_previo,
      eventoPrevioTipo: anterior?.tipo_evento ?? null,
      cosechaPreviaTunelId,
      fechaCicloAnterior,
    });
    if (!resolucion.ok) {
      throw rechazo(
        ErrorCodes.REVERSION_ESTADO_PREVIO_NO_RECUPERABLE,
        resolucion.motivo,
      );
    }
    const previo = resolucion.estado;

    if (exigirEnCosecha && previo.estado !== 'en_cosecha') {
      throw rechazo(
        ErrorCodes.REVERSION_NO_APLICA,
        'Antes del trasplante la mesa no estaba en cosecha, asi que no hay cosecha que deshacer: usa revertir-trasplante',
        { estado_previo: previo.estado },
      );
    }

    const tunelPrevio = (await qr.query(
      `SELECT 1 FROM tuneles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [previo.tunel_id, tenantId],
    )) as unknown[];
    if (tunelPrevio.length === 0) {
      throw rechazo(
        ErrorCodes.REVERSION_ESTADO_PREVIO_NO_RECUPERABLE,
        'El tunel donde estaba la mesa antes del trasplante ya no existe',
        { tunel_id: previo.tunel_id },
      );
    }

    await this.registrarAntes(ctx, mesa.tunel_id);
    await this.registrarAntes(ctx, previo.tunel_id);
    const previoPosDestino = new Map(posDestino);
    const posPrevioTunel =
      previo.tunel_id === mesa.tunel_id
        ? null
        : await this.posiciones(qr, tenantId, previo.tunel_id);

    // Evidencia: filas completas antes de tocarlas.
    const [ev] = (await qr.query(
      `SELECT
         (SELECT to_jsonb(h) FROM historial_mesa h WHERE h.id = $1) AS historial,
         (SELECT coalesce(jsonb_agg(to_jsonb(mb) ORDER BY mb.bandeja_id), '[]'::jsonb)
            FROM mesa_bandeja mb WHERE mb.mesa_id = $2 AND mb.bandeja_id = ANY($3::uuid[])) AS mesa_bandeja,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', b.id, 'codigo', b.codigo, 'estado', b.estado,
                   'mesa_id', b.mesa_id, 'fecha_trasplante', b.fecha_trasplante) ORDER BY b.id), '[]'::jsonb)
            FROM bandejas b WHERE b.id = ANY($3::uuid[])) AS bandejas`,
      [ultimo.id, mesaId, det.bandeja_ids],
    )) as Array<Record<string, unknown>>;
    ctx.evidencia.trasplante = {
      ...ev,
      mesa_antes: this.snap(mesa),
      estado_previo: previo,
      estado_previo_origen: resolucion.origen,
    };

    // ── Reversion ──
    const [bandejas] = (await qr.query(
      `UPDATE bandejas
          SET estado = 'en_nursery', mesa_id = NULL, fecha_trasplante = NULL, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado = 'trasplantada' AND mesa_id = $3
        RETURNING id`,
      [det.bandeja_ids, tenantId, mesaId],
    )) as [Array<{ id: string }>, number];
    const [vinculos] = (await qr.query(
      `DELETE FROM mesa_bandeja WHERE mesa_id = $1 AND bandeja_id = ANY($2::uuid[]) RETURNING bandeja_id`,
      [mesaId, det.bandeja_ids],
    )) as [Array<{ bandeja_id: string }>, number];
    const [eventos] = (await qr.query(
      `DELETE FROM historial_mesa WHERE id = $1 AND mesa_id = $2 RETURNING id`,
      [ultimo.id, mesaId],
    )) as [Array<{ id: string }>, number];
    if (
      bandejas.length !== det.bandeja_ids.length ||
      vinculos.length !== det.bandeja_ids.length ||
      eventos.length !== 1
    ) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La reversion del trasplante no afecto la cantidad esperada de filas',
        {
          bandejas: bandejas.length,
          vinculos: vinculos.length,
          eventos: eventos.length,
          esperadas: det.bandeja_ids.length,
        },
      );
    }

    await qr.query(
      `UPDATE mesas
          SET estado = $1::mesa_estado, tunel_id = $2, posicion_actual = NULL,
              fecha_ultimo_trasplante = $3::timestamptz, updated_at = now()
        WHERE id = $4 AND tenant_id = $5`,
      [
        previo.estado,
        previo.tunel_id,
        previo.fecha_ultimo_trasplante,
        mesaId,
        tenantId,
      ],
    );

    // ── Verificacion ──
    const despues = await this.posiciones(qr, tenantId, mesa.tunel_id);
    const difs = diferencias(
      posicionesTrasQuitar(previoPosDestino, mesaId),
      despues,
    );
    if (posPrevioTunel) {
      difs.push(
        ...diferencias(
          posPrevioTunel,
          await this.posiciones(qr, tenantId, previo.tunel_id),
        ),
      );
    }
    const [chk] = (await qr.query(
      `SELECT (m.estado::text = $2 AND m.tunel_id = $3 AND m.posicion_actual IS NULL
               AND m.fecha_ultimo_trasplante IS NOT DISTINCT FROM $4::timestamptz) AS ok,
              (SELECT count(*)::int FROM bandejas
                WHERE id = ANY($5::uuid[]) AND estado = 'en_nursery'
                  AND mesa_id IS NULL AND fecha_trasplante IS NULL) AS bandejas_ok
         FROM mesas m WHERE m.id = $1`,
      [
        mesaId,
        previo.estado,
        previo.tunel_id,
        previo.fecha_ultimo_trasplante,
        det.bandeja_ids,
      ],
    )) as Array<{ ok: boolean; bandejas_ok: number }>;
    if (
      difs.length > 0 ||
      !chk?.ok ||
      chk.bandejas_ok !== det.bandeja_ids.length
    ) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La verificacion posterior al deshacer el trasplante fallo; no se aplico ningun cambio',
        { mesas_con_diferencias: difs },
      );
    }

    return {
      historial_id: ultimo.id,
      fecha_hora: ultimo.fecha_hora.toISOString(),
      tunel_id: mesa.tunel_id,
      bandeja_ids: det.bandeja_ids,
      estado_previo_origen: resolucion.origen,
    };
  }

  // ── Cosecha ─────────────────────────────────────────────────────────────

  private async deshacerCosecha(ctx: Ctx): Promise<CosechaRevertida> {
    const { qr, tenantId, mesaId } = ctx;
    const mesa = await this.cargarMesa(qr, tenantId, mesaId);

    if (mesa.estado !== 'en_cosecha' || mesa.posicion_actual !== null) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_APLICA,
        mesa.estado === 'activa' && mesa.posicion_actual !== null
          ? 'La mesa ya no esta en cosecha (se trasplanto despues): usa revertir-cosecha-y-trasplante'
          : 'La mesa no esta en cosecha',
        { estado: mesa.estado, posicion_actual: mesa.posicion_actual },
      );
    }

    const [ultimo] = await this.ultimosEventos(qr, mesaId, 1);
    if (!ultimo || ultimo.tipo_evento !== 'cosecha') {
      throw rechazo(
        ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
        'Lo ultimo que le paso a la mesa no fue una cosecha: solo se puede deshacer la ultima operacion',
        { ultimo_evento: this.resumenEvento(ultimo) },
      );
    }
    const cosechaId = parseCosechaDetalle(ultimo.detalle).cosecha_id;
    if (!cosechaId) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'El evento de cosecha de la mesa no referencia ninguna cosecha',
      );
    }

    const [cosecha] = (await qr.query(
      `SELECT c.id, c.tunel_id, c.fecha_hora, c.posicion_al_momento, c.peso_kg::text AS peso_kg,
              to_jsonb(c) AS fila
         FROM cosechas c WHERE c.id = $1 AND c.tenant_id = $2 AND c.mesa_id = $3`,
      [cosechaId, tenantId, mesaId],
    )) as Array<{
      id: string;
      tunel_id: string;
      fecha_hora: Date;
      posicion_al_momento: number;
      peso_kg: string | null;
      fila: Record<string, unknown>;
    }>;
    if (!cosecha) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La cosecha del evento no existe',
        { cosecha_id: cosechaId },
      );
    }
    if (cosecha.tunel_id !== mesa.tunel_id) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La mesa ya no esta en el tunel donde se cosecho',
        { tunel_mesa: mesa.tunel_id, tunel_cosecha: cosecha.tunel_id },
      );
    }

    const packing = (await qr.query(
      `SELECT id FROM lotes_packing WHERE cosecha_id = $1 LIMIT 1`,
      [cosecha.id],
    )) as unknown[];
    if (packing.length > 0) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_APLICA,
        'La cosecha ya tiene un lote de packing: no se puede deshacer',
        { cosecha_id: cosecha.id },
      );
    }

    // Otra cosecha en el tunel despues de esta corrio posiciones de forma que
    // ya no se puede saber donde reinsertar la mesa. (Los trasplantes de otras
    // mesas, en cambio, entran al final y no afectan el lugar de esta.)
    const posteriores = (await qr.query(
      `SELECT c.id, c.mesa_id, c.fecha_hora
         FROM cosechas c
        WHERE c.tenant_id = $1 AND c.tunel_id = $2 AND c.id <> $3
          AND c.fecha_hora > (SELECT fecha_hora FROM cosechas WHERE id = $3)
        ORDER BY c.fecha_hora LIMIT 20`,
      [tenantId, cosecha.tunel_id, cosecha.id],
    )) as Array<{ id: string; mesa_id: string; fecha_hora: Date }>;
    if (posteriores.length > 0) {
      throw rechazo(
        ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
        'Despues de esta cosecha se cosecharon otras mesas del mismo tunel: solo se puede deshacer la ultima operacion del tunel',
        {
          cosechas_posteriores: posteriores.map((p) => ({
            id: p.id,
            mesa_id: p.mesa_id,
            fecha_hora: p.fecha_hora.toISOString(),
          })),
        },
      );
    }

    // El indice unico de posiciones no se puede correr si hay mesas dadas de
    // baja que conservan posicion (el desplazamiento solo mueve las vivas).
    const bajasConPosicion = (await qr.query(
      `SELECT id FROM mesas
        WHERE tunel_id = $1 AND tenant_id = $2 AND posicion_actual IS NOT NULL AND deleted_at IS NOT NULL
        LIMIT 1`,
      [cosecha.tunel_id, tenantId],
    )) as unknown[];
    if (bajasConPosicion.length > 0) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'Hay mesas dadas de baja con posicion en el tunel',
      );
    }

    await this.registrarAntes(ctx, cosecha.tunel_id);
    const posAntes = await this.posiciones(qr, tenantId, cosecha.tunel_id);
    const posicion = cosecha.posicion_al_momento;
    if (posicion < 1 || posicion > ultimaPosicion(posAntes) + 1) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La posicion original de la mesa ya no es valida para el tunel',
        {
          posicion_original: posicion,
          ultima_posicion: ultimaPosicion(posAntes),
        },
      );
    }

    const [evHist] = (await qr.query(
      `SELECT to_jsonb(h) AS fila FROM historial_mesa h WHERE h.id = $1`,
      [ultimo.id],
    )) as Array<{ fila: Record<string, unknown> }>;
    ctx.evidencia.cosecha = {
      cosecha: cosecha.fila,
      historial: evHist?.fila ?? null,
      mesa_antes: this.snap(mesa),
    };

    // ── Reversion ──
    // Dos pasadas con offset negativo: UQ_mesas_tunel_posicion no es diferible
    // (misma tecnica que usa la cosecha, al reves).
    await qr.query(
      `UPDATE mesas SET posicion_actual = -posicion_actual, updated_at = now()
        WHERE tunel_id = $1 AND tenant_id = $2 AND posicion_actual >= $3 AND deleted_at IS NULL`,
      [cosecha.tunel_id, tenantId, posicion],
    );
    await qr.query(
      `UPDATE mesas SET posicion_actual = -posicion_actual + 1, updated_at = now()
        WHERE tunel_id = $1 AND tenant_id = $2 AND posicion_actual < 0 AND deleted_at IS NULL`,
      [cosecha.tunel_id, tenantId],
    );
    await qr.query(
      `UPDATE mesas SET estado = 'activa', posicion_actual = $1, updated_at = now()
        WHERE id = $2 AND tenant_id = $3`,
      [posicion, mesaId, tenantId],
    );
    const [eventos] = (await qr.query(
      `DELETE FROM historial_mesa WHERE id = $1 AND mesa_id = $2 RETURNING id`,
      [ultimo.id, mesaId],
    )) as [Array<{ id: string }>, number];
    const [cosechas] = (await qr.query(
      `DELETE FROM cosechas WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [cosecha.id, tenantId],
    )) as [Array<{ id: string }>, number];
    if (eventos.length !== 1 || cosechas.length !== 1) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La reversion de la cosecha no afecto la cantidad esperada de filas',
        { eventos: eventos.length, cosechas: cosechas.length },
      );
    }

    // ── Verificacion ──
    const difs = diferencias(
      posicionesTrasReinsertar(posAntes, mesaId, posicion),
      await this.posiciones(qr, tenantId, cosecha.tunel_id),
    );
    const [chk] = (await qr.query(
      `SELECT (estado::text = 'activa' AND posicion_actual = $2) AS ok FROM mesas WHERE id = $1`,
      [mesaId, posicion],
    )) as Array<{ ok: boolean }>;
    if (difs.length > 0 || !chk?.ok) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'La verificacion posterior al deshacer la cosecha fallo; no se aplico ningun cambio',
        { mesas_con_diferencias: difs },
      );
    }

    return {
      id: cosecha.id,
      fecha_hora: cosecha.fecha_hora.toISOString(),
      tunel_id: cosecha.tunel_id,
      posicion_restaurada: posicion,
      peso_kg: cosecha.peso_kg,
    };
  }

  // ── Piezas compartidas ──────────────────────────────────────────────────

  private snap(m: MesaSnap): MesaSnap {
    return {
      estado: m.estado,
      tunel_id: m.tunel_id,
      posicion_actual: m.posicion_actual,
      fecha_ultimo_trasplante: m.fecha_ultimo_trasplante,
    };
  }

  private resumenEvento(e: EventoRow | undefined) {
    return e
      ? {
          id: e.id,
          tipo_evento: e.tipo_evento,
          fecha_hora: e.fecha_hora.toISOString(),
        }
      : null;
  }

  private async cargarMesa(
    qr: QueryRunner,
    tenantId: string,
    mesaId: string,
  ): Promise<MesaRow> {
    const rows = (await qr.query(
      `SELECT m.id, m.nombre, m.estado::text AS estado, m.tunel_id, m.posicion_actual,
              m.fecha_ultimo_trasplante::text AS fecha_ultimo_trasplante
         FROM mesas m
        WHERE m.id = $1 AND m.tenant_id = $2 AND m.deleted_at IS NULL`,
      [mesaId, tenantId],
    )) as MesaRow[];
    if (!rows[0]) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    return rows[0];
  }

  private async ultimosEventos(
    qr: QueryRunner,
    mesaId: string,
    n: number,
  ): Promise<EventoRow[]> {
    return (await qr.query(
      `SELECT id, tipo_evento::text AS tipo_evento, fecha_hora, detalle
         FROM historial_mesa
        WHERE mesa_id = $1
        ORDER BY fecha_hora DESC, created_at DESC, id DESC
        LIMIT $2`,
      [mesaId, n],
    )) as EventoRow[];
  }

  private async posiciones(
    qr: QueryRunner,
    tenantId: string,
    tunelId: string,
  ): Promise<Map<string, number>> {
    const rows = (await qr.query(
      `SELECT id, posicion_actual FROM mesas
        WHERE tunel_id = $1 AND tenant_id = $2 AND posicion_actual IS NOT NULL`,
      [tunelId, tenantId],
    )) as Array<{ id: string; posicion_actual: number }>;
    return new Map(rows.map((r) => [r.id, r.posicion_actual]));
  }

  private async registrarAntes(ctx: Ctx, tunelId: string): Promise<void> {
    if (ctx.posIniciales.has(tunelId)) return;
    ctx.posIniciales.set(
      tunelId,
      await this.posiciones(ctx.qr, ctx.tenantId, tunelId),
    );
  }

  /** Tuneles que esta operacion puede llegar a tocar, deducidos de los ultimos eventos de la mesa. */
  private async tunelesInvolucrados(
    qr: QueryRunner,
    tenantId: string,
    mesa: MesaRow,
  ): Promise<string[]> {
    const ids = new Set<string>([mesa.tunel_id]);
    for (const e of await this.ultimosEventos(qr, mesa.id, 2)) {
      if (e.tipo_evento === 'trasplante') {
        const d = parseTrasplanteDetalle(e.detalle);
        if (d.tunel_id) ids.add(d.tunel_id);
        if (d.estado_previo) ids.add(d.estado_previo.tunel_id);
      } else if (e.tipo_evento === 'cosecha') {
        const cid = parseCosechaDetalle(e.detalle).cosecha_id;
        if (!cid) continue;
        const rows = (await qr.query(
          `SELECT tunel_id FROM cosechas WHERE id = $1 AND tenant_id = $2`,
          [cid, tenantId],
        )) as Array<{ tunel_id: string }>;
        if (rows[0]) ids.add(rows[0].tunel_id);
      }
    }
    return [...ids];
  }

  /** Bloquea todas las mesas de los tuneles (en orden de id, para no generar deadlocks). */
  private async bloquearTuneles(
    qr: QueryRunner,
    tenantId: string,
    mesaId: string,
    tunelIds: string[],
  ): Promise<void> {
    await qr.query(
      `SELECT id FROM mesas
        WHERE tenant_id = $1 AND (tunel_id = ANY($2::uuid[]) OR id = $3)
        ORDER BY id
        FOR UPDATE`,
      [tenantId, tunelIds, mesaId],
    );
  }

  private async verificarBandejas(ctx: Ctx, ids: string[]): Promise<void> {
    const { qr, tenantId, mesaId } = ctx;
    const bandejas = (await qr.query(
      `SELECT b.id, b.estado::text AS estado, b.mesa_id, b.deleted_at, b.fecha_entrada_nursery
         FROM bandejas b WHERE b.id = ANY($1::uuid[]) AND b.tenant_id = $2`,
      [ids, tenantId],
    )) as Array<{
      id: string;
      estado: string;
      mesa_id: string | null;
      deleted_at: Date | null;
      fecha_entrada_nursery: Date | null;
    }>;
    const descartes = (await qr.query(
      `SELECT bandeja_id FROM bandeja_descartes WHERE bandeja_id = ANY($1::uuid[])`,
      [ids],
    )) as Array<{ bandeja_id: string }>;
    const vinculos = (await qr.query(
      `SELECT mesa_id, bandeja_id FROM mesa_bandeja WHERE bandeja_id = ANY($1::uuid[])`,
      [ids],
    )) as Array<{ mesa_id: string; bandeja_id: string }>;

    const problemas: string[] = [];
    if (bandejas.length !== ids.length) {
      problemas.push(`faltan bandejas (${bandejas.length} de ${ids.length})`);
    }
    for (const b of bandejas) {
      if (b.estado !== 'trasplantada')
        problemas.push(`${b.id}: estado ${b.estado}`);
      if (b.mesa_id !== mesaId)
        problemas.push(`${b.id}: ya no esta en la mesa`);
      if (b.deleted_at) problemas.push(`${b.id}: eliminada`);
      if (!b.fecha_entrada_nursery) {
        problemas.push(`${b.id}: no venia de nursery (sin fecha de entrada)`);
      }
    }
    for (const d of descartes)
      problemas.push(`${d.bandeja_id}: tiene un descarte`);
    for (const id of ids) {
      const v = vinculos.filter((x) => x.bandeja_id === id);
      if (v.length !== 1 || v[0].mesa_id !== mesaId) {
        problemas.push(`${id}: vinculos con mesas inesperados (${v.length})`);
      }
    }
    if (problemas.length > 0) {
      throw rechazo(
        ErrorCodes.REVERSION_DATOS_INCONSISTENTES,
        'Las bandejas del trasplante ya no estan como las dejo el trasplante',
        { problemas },
      );
    }
  }

  /** Resumen por tunel y, aparte, las posiciones previas completas para la auditoria. */
  private async resumenTuneles(ctx: Ctx): Promise<{
    resumen: ReversionResult['tuneles'];
    posicionesAntes: Array<{
      tunel_id: string;
      posiciones: Array<[string, number]>;
    }>;
  }> {
    const { qr, tenantId, posIniciales } = ctx;
    const ids = [...posIniciales.keys()];
    const nombres = (await qr.query(
      `SELECT id, nombre FROM tuneles WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId],
    )) as Array<{ id: string; nombre: string }>;

    const resumen: ReversionResult['tuneles'] = [];
    const posicionesAntes: Array<{
      tunel_id: string;
      posiciones: Array<[string, number]>;
    }> = [];
    for (const [tunelId, antes] of posIniciales) {
      const despues: Posiciones = await this.posiciones(qr, tenantId, tunelId);
      resumen.push({
        id: tunelId,
        nombre: nombres.find((n) => n.id === tunelId)?.nombre ?? '',
        mesas_con_posicion_antes: antes.size,
        mesas_con_posicion_despues: despues.size,
        mesas_desplazadas: contarDesplazadas(antes, despues, ctx.mesaId),
      });
      posicionesAntes.push({ tunel_id: tunelId, posiciones: [...antes] });
    }
    return { resumen, posicionesAntes };
  }

  /**
   * La constancia va DENTRO de la transaccion y sin tragar errores: es el unico
   * registro de lo que se borro, asi que si no se puede guardar, no se revierte.
   */
  private async escribirAuditoria(
    ctx: Ctx,
    tipo: ReversionTipo,
    motivo: string | null,
    req: AuditReq,
    result: ReversionResult,
    posicionesAntes: Array<{
      tunel_id: string;
      posiciones: Array<[string, number]>;
    }>,
  ): Promise<void> {
    const action = AUDIT[tipo];
    const detalle = {
      motivo,
      tipo,
      mesa: result.mesa,
      trasplante_revertido: result.trasplante_revertido,
      cosecha_revertida: result.cosecha_revertida,
      // Filas completas eliminadas/modificadas: con esto se puede rehacer la operacion.
      evidencia: ctx.evidencia,
      tuneles: result.tuneles,
      posiciones_antes: posicionesAntes,
    };
    const payload = auditLogPayload({
      requestId: req.requestId,
      actorUserId: req.userId,
      actorEmail: req.email,
      action,
      entity: 'mesa',
      extra: detalle,
    });
    await this.audit.writeInTransaction(ctx.qr.manager, 'admin', {
      request_id: req.requestId,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.userId,
      actor_email: req.email ?? null,
      action,
      entity: 'mesa',
      tenant_id: ctx.tenantId,
      // El 'extra' anidado es el unico campo que conserva redactPayload() del
      // modulo de audit; el spread de auditLogPayload() se descarta.
      payload: { ...payload, extra: detalle },
    });
  }
}
