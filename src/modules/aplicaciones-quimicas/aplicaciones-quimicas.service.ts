import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { LotesQuimicosService } from 'src/modules/lotes-quimicos/lotes-quimicos.service';
import { Quimico } from 'src/modules/quimicos/entities/quimico.entity';
import { LoteQuimico } from 'src/modules/lotes-quimicos/entities/lote-quimico.entity';
import { BandejaService } from 'src/modules/siembra/bandeja.service';
import { BandejaEstado } from 'src/modules/siembra/entities/bandeja.entity';
import { MesasService } from 'src/modules/mesas/mesas.service';
import { MesaEstado } from 'src/modules/mesas/entities/mesa.entity';
import {
  HistorialMesa,
  HistorialTipoEvento,
} from 'src/modules/mesas/entities/historial-mesa.entity';
import { clampPagination } from 'src/common/query/query-utils';
import {
  buildUsuariosMap,
  fetchUsuarioSnapshot,
  resolveUsuarioResumen,
} from 'src/common/utils/usuario-resumen.util';
import {
  AplicacionQuimica,
  AplicacionContexto,
} from './entities/aplicacion-quimica.entity';
import { AplicacionQuimicaDetalle } from './entities/aplicacion-quimica-detalle.entity';
import { AplicacionQuimicaBandeja } from './entities/aplicacion-quimica-bandeja.entity';
import { AplicacionQuimicaMesa } from './entities/aplicacion-quimica-mesa.entity';
import {
  CreateAplicacionDto,
  DetalleItemDto,
} from './dto/create-aplicacion.dto';
import { UpdateAplicacionDto } from './dto/update-aplicacion.dto';
import { UpdateOperationGroupDto } from './dto/update-operation-group.dto';
import { OperationGroupOp } from './dto/operation-group-item.dto';
import { QueryAplicacionesDto } from './dto/query-aplicaciones.dto';
import {
  AplicacionDetalleEnriquecida,
  AplicacionDetalleLine,
  AplicacionListItem,
  ChemicalLine,
  ChemicalLineRaw,
  GreenhouseSummaryRaw,
  GreenhouseTargetRaw,
  GreenhouseTargets,
  GreenhouseTunnelGroup,
  LoteRef,
  LoteVermiculitaRef,
  NurserySeedingGroup,
  NurserySummaryRaw,
  NurseryTargetRaw,
  NurseryTargets,
  RefNombre,
  SeedingSummary,
  TunnelSummary,
  UsuarioResumen,
} from './types/aplicacion-enriched.types';

export const AUDIT = {
  NURSERY: 'aplicacion_quimica_nursery',
  GREENHOUSE: 'aplicacion_quimica_greenhouse',
  UPDATE: 'aplicacion_quimica_update',
  GROUP_CREATE: 'aplicacion_quimica_group_create',
  GROUP_UPDATE: 'aplicacion_quimica_group_update',
  GROUP_DELETE: 'aplicacion_quimica_group_delete',
} as const;

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

export interface CreateAplicacionResult {
  aplicacion: AplicacionQuimica;
  detalles: AplicacionQuimicaDetalle[];
  afectados: { bandeja_ids?: string[]; mesa_ids?: string[] };
}

@Injectable()
export class AplicacionesQuimicasService {
  constructor(
    @InjectRepository(AplicacionQuimica)
    private readonly aplicacionRepo: Repository<AplicacionQuimica>,
    @InjectRepository(AplicacionQuimicaDetalle)
    private readonly detalleRepo: Repository<AplicacionQuimicaDetalle>,
    @InjectRepository(AplicacionQuimicaBandeja)
    private readonly bandejaRepo: Repository<AplicacionQuimicaBandeja>,
    @InjectRepository(AplicacionQuimicaMesa)
    private readonly mesaRepo: Repository<AplicacionQuimicaMesa>,
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly estService: EstablecimientosService,
    private readonly lotesQuimicosService: LotesQuimicosService,
    private readonly bandejaService: BandejaService,
    private readonly mesasService: MesasService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  private async decrementarLote(
    qr: QueryRunner,
    loteId: string,
    cantidad: number,
    tenantId: string,
  ): Promise<void> {
    const result = await qr.manager
      .createQueryBuilder()
      .update(LoteQuimico)
      .set({ cantidad_actual: () => 'cantidad_actual - :cantidad' })
      .where('id = :id', { id: loteId })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere('cantidad_actual >= :cantidad', { cantidad })
      .setParameter('cantidad', cantidad)
      .execute();

    if (!result.affected) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_STOCK_INSUFICIENTE,
        message: `El lote ${loteId} no tiene stock suficiente para descontar ${cantidad}`,
        status: 422,
      });
    }
  }

  // Espejo de decrementarLote, sin el guard de >= — revertir stock nunca
  // puede "faltar" stock disponible.
  private async incrementarLote(
    qr: QueryRunner,
    loteId: string,
    cantidad: number,
    tenantId: string,
  ): Promise<void> {
    const result = await qr.manager
      .createQueryBuilder()
      .update(LoteQuimico)
      .set({ cantidad_actual: () => 'cantidad_actual + :cantidad' })
      .where('id = :id', { id: loteId })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .setParameter('cantidad', cantidad)
      .execute();

    if (!result.affected) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_NOT_FOUND,
        message: `No se pudo revertir stock: el lote ${loteId} no existe`,
        status: 404,
      });
    }
  }

  // Extraído de las validaciones antes duplicadas inline en createAplicacion
  // (primario + detalles[]) — ahora también usado por updateAplicacion.
  private async validateChemicalLine(
    loteId: string,
    establecimientoId: string,
  ): Promise<{ lote: LoteQuimico; quimico: Quimico }> {
    const entry =
      await this.lotesQuimicosService.mustFindByIdWithQuimico(loteId);
    if (entry.quimico.establecimiento_id !== establecimientoId) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGET_INVALIDO,
        message: `El lote ${loteId} no pertenece al establecimiento indicado`,
        status: 422,
      });
    }
    return entry;
  }

  // Extraído del bloque antes duplicado inline en updateAplicacion — ahora
  // también usado por updateOperationGroup (fases D y F). Existencia +
  // estado vigente con FOR UPDATE, y pertenencia al establecimiento.
  private async validateAndLockTargets(
    qr: QueryRunner,
    tenantId: string,
    contexto: AplicacionContexto,
    establecimientoId: string,
    targetIds: string[],
  ): Promise<void> {
    const targetTable =
      contexto === AplicacionContexto.NURSERY ? 'bandejas' : 'mesas';

    let vigentes: Array<{ id: string }>;
    if (contexto === AplicacionContexto.NURSERY) {
      vigentes = (await qr.query(
        `SELECT id FROM bandejas WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado = $3 AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [targetIds, tenantId, BandejaEstado.EN_NURSERY],
      )) as Array<{ id: string }>;
    } else {
      vigentes = (await qr.query(
        `SELECT id FROM mesas WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado IN ($3, $4) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [targetIds, tenantId, MesaEstado.ACTIVA, MesaEstado.EN_COSECHA],
      )) as Array<{ id: string }>;
    }

    const vigentesIds = new Set(vigentes.map((v) => v.id));
    const invalidas = targetIds.filter((tid) => !vigentesIds.has(tid));
    if (invalidas.length > 0) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGET_INVALIDO,
        message:
          contexto === AplicacionContexto.NURSERY
            ? 'Las bandejas indicadas no están en estado en_nursery'
            : 'Las mesas indicadas no están en estado activa o en_cosecha',
        status: 422,
        details:
          contexto === AplicacionContexto.NURSERY
            ? { bandeja_ids: invalidas }
            : { mesa_ids: invalidas },
      });
    }

    const fueraDeEstablecimiento = (await qr.query(
      `SELECT id FROM ${targetTable} WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND establecimiento_id != $3`,
      [targetIds, tenantId, establecimientoId],
    )) as Array<{ id: string }>;
    if (fueraDeEstablecimiento.length > 0) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGET_INVALIDO,
        message:
          'Alguno de los targets indicados no pertenece al establecimiento de la aplicación',
        status: 422,
        details: { ids: fueraDeEstablecimiento.map((r) => r.id) },
      });
    }
  }

  /**
   * Recalcula, para UN target (bandeja o mesa), el MAX de carencia entre
   * TODAS las aplicaciones que siguen ligadas a él — histórico completo, no
   * solo la fila que se está creando/editando. Por cada aplicación ligada
   * también persiste el MAX de su propio withholding_period_dias (primario +
   * detalles adicionales) en el header, reemplazando el valor viejo. Se
   * llama siempre y escribe siempre, incluyendo null para limpiar
   * carencia_hasta cuando ya no corresponde.
   */
  private async recomputeCarenciaHasta(
    qr: QueryRunner,
    tenantId: string,
    contexto: AplicacionContexto,
    targetId: string,
  ): Promise<string | null> {
    const linkTable =
      contexto === AplicacionContexto.NURSERY
        ? 'aplicacion_quimica_bandeja'
        : 'aplicacion_quimica_mesa';
    const linkColumn =
      contexto === AplicacionContexto.NURSERY ? 'bandeja_id' : 'mesa_id';
    const targetTable =
      contexto === AplicacionContexto.NURSERY ? 'bandejas' : 'mesas';

    const rows = (await qr.query(
      `SELECT a.id, a.fecha_hora,
              (SELECT MAX(q.withholding_period_dias)
                 FROM aplicaciones_quimicas_detalle d
                 JOIN lotes_quimicos lq ON lq.id = d.lote_quimico_id
                 JOIN quimicos q ON q.id = lq.quimico_id
                WHERE d.aplicacion_id = a.id) AS max_whp
         FROM aplicaciones_quimicas a
         JOIN ${linkTable} link ON link.aplicacion_id = a.id
        WHERE link.${linkColumn} = $1 AND a.tenant_id = $2`,
      [targetId, tenantId],
    )) as Array<{ id: string; fecha_hora: Date; max_whp: number | null }>;

    let maxCarenciaHasta: string | null = null;

    for (const r of rows) {
      const whp = r.max_whp ?? null;
      await qr.query(
        `UPDATE aplicaciones_quimicas SET withholding_period_dias = $1 WHERE id = $2`,
        [whp, r.id],
      );

      if (whp !== null && whp > 0) {
        const carenciaDate = new Date(r.fecha_hora);
        carenciaDate.setDate(carenciaDate.getDate() + whp);
        const carenciaHastaStr = carenciaDate.toISOString().split('T')[0];
        if (maxCarenciaHasta === null || carenciaHastaStr > maxCarenciaHasta) {
          maxCarenciaHasta = carenciaHastaStr;
        }
      }
    }

    await qr.query(
      `UPDATE ${targetTable} SET carencia_hasta = $1 WHERE id = $2 AND tenant_id = $3`,
      [maxCarenciaHasta, targetId, tenantId],
    );

    return maxCarenciaHasta;
  }

  async createAplicacion(
    dto: CreateAplicacionDto,
    userId: string,
  ): Promise<CreateAplicacionResult> {
    const tenantId = this.tenancy.requireTenantId();

    // 1. Validate establishment
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    // 2. Load + validate primary lote (and its quimico)
    const { lote: primaryLote, quimico: primaryQuimico } =
      await this.validateChemicalLine(
        dto.lote_quimico_id,
        dto.establecimiento_id,
      );

    // 3. Nursery requires bandeja_ids; greenhouse requires mesa_ids
    if (
      dto.contexto === AplicacionContexto.NURSERY &&
      !dto.bandeja_ids?.length
    ) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message:
          'Se requiere al menos una bandeja para aplicaciones de nursery',
        status: 422,
      });
    }
    if (
      dto.contexto === AplicacionContexto.GREENHOUSE &&
      !dto.mesa_ids?.length
    ) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message:
          'Se requiere al menos una mesa para aplicaciones de greenhouse',
        status: 422,
      });
    }

    // 4. Load + validate supplementary lotes in detalles[]
    const loteMap: Record<string, { lote: LoteQuimico; quimico: Quimico }> = {};
    for (const d of dto.detalles ?? []) {
      loteMap[d.lote_quimico_id] = await this.validateChemicalLine(
        d.lote_quimico_id,
        dto.establecimiento_id,
      );
    }

    // 5. Validate nursery targets
    if (dto.contexto === AplicacionContexto.NURSERY && dto.bandeja_ids) {
      for (const bandeja_id of dto.bandeja_ids) {
        const bandeja = await this.bandejaService.getBandeja(bandeja_id);
        if (bandeja.estado !== BandejaEstado.EN_NURSERY) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message: `La bandeja ${bandeja_id} no está en estado en_nursery`,
            status: 422,
          });
        }
        if (bandeja.establecimiento_id !== dto.establecimiento_id) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message: `La bandeja ${bandeja_id} no pertenece al establecimiento indicado`,
            status: 422,
          });
        }
      }
    }

    // 6. Validate greenhouse targets
    if (dto.contexto === AplicacionContexto.GREENHOUSE && dto.mesa_ids) {
      for (const mesa_id of dto.mesa_ids) {
        const mesa = await this.mesasService.getMesaById(mesa_id, tenantId);
        if (
          mesa.estado !== MesaEstado.ACTIVA &&
          mesa.estado !== MesaEstado.EN_COSECHA
        ) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message: `La mesa ${mesa_id} no está en estado activa o en_cosecha`,
            status: 422,
          });
        }
        if (mesa.establecimiento_id !== dto.establecimiento_id) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message: `La mesa ${mesa_id} no pertenece al establecimiento indicado`,
            status: 422,
          });
        }
      }
    }

    // 7. Transaction — el lote primario descuenta la cantidad literal del
    // request (dto.cantidad), igual que los adicionales; dosis es informativa.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let savedAplicacion: AplicacionQuimica;
    const savedDetalles: AplicacionQuimicaDetalle[] = [];
    // Si el caller no manda uno (ej: para agrupar chunks de un mismo pedido
    // trozado en el frontend), se genera uno propio de esta request.
    const operationGroupId = dto.operation_group_id ?? randomUUID();

    try {
      const usuarioSnapshot = await fetchUsuarioSnapshot(
        qr.manager,
        userId,
        tenantId,
      );

      // MAX real entre primario y adicionales, no solo el primario — antes
      // un adicional con más carencia que el primario se ignoraba.
      const whpCandidates = [
        primaryQuimico.withholding_period_dias,
        ...Object.values(loteMap).map((e) => e.quimico.withholding_period_dias),
      ].filter((v): v is number => v !== null && v !== undefined);
      const ownWhp =
        whpCandidates.length > 0 ? Math.max(...whpCandidates) : null;

      const aplicacion = qr.manager.create(AplicacionQuimica, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        contexto: dto.contexto,
        observaciones: dto.observaciones ?? null,
        usuario_id: userId,
        ...usuarioSnapshot,
        fecha_hora: new Date(),
        lote_quimico_id: dto.lote_quimico_id,
        dosis: dto.dosis,
        dosis_unidad: dto.dosis_unidad ?? primaryQuimico.rate_unidad ?? null,
        batch: primaryLote.numero_lote ?? null,
        withholding_period_dias: ownWhp,
        operation_group_id: operationGroupId,
      });
      savedAplicacion = await qr.manager.save(AplicacionQuimica, aplicacion);

      // Primary detalle — siempre descuenta stock (nursery y greenhouse)
      await this.decrementarLote(
        qr,
        dto.lote_quimico_id,
        dto.cantidad,
        tenantId,
      );
      const primaryDetalle = qr.manager.create(AplicacionQuimicaDetalle, {
        aplicacion_id: savedAplicacion.id,
        lote_quimico_id: dto.lote_quimico_id,
        dosis: savedAplicacion.dosis,
        dosis_unidad: savedAplicacion.dosis_unidad,
        cantidad: dto.cantidad,
        unidad_medida: primaryQuimico.unidad_medida,
      });
      savedDetalles.push(
        await qr.manager.save(AplicacionQuimicaDetalle, primaryDetalle),
      );

      // Supplementary detalles + decrement stock
      for (const d of dto.detalles ?? []) {
        const { quimico } = loteMap[d.lote_quimico_id];
        await this.decrementarLote(qr, d.lote_quimico_id, d.cantidad, tenantId);
        const detalle = qr.manager.create(AplicacionQuimicaDetalle, {
          aplicacion_id: savedAplicacion.id,
          lote_quimico_id: d.lote_quimico_id,
          dosis: d.dosis,
          dosis_unidad: d.dosis_unidad ?? quimico.rate_unidad ?? null,
          cantidad: d.cantidad,
          unidad_medida: quimico.unidad_medida,
        });
        savedDetalles.push(
          await qr.manager.save(AplicacionQuimicaDetalle, detalle),
        );
      }

      // Nursery bandeja links + carencia
      if (dto.contexto === AplicacionContexto.NURSERY && dto.bandeja_ids) {
        // Revalidacion dentro de la transaccion: el chequeo del paso 5 corre
        // fuera de ella, asi que la bandeja pudo haber sido trasplantada o
        // descartada mientras tanto. El FOR UPDATE bloquea las filas hasta el
        // commit, cubriendo tanto el link como la carencia.
        const vigentes = (await qr.query(
          `SELECT id FROM bandejas WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado = $3 AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
          [dto.bandeja_ids, tenantId, BandejaEstado.EN_NURSERY],
        )) as Array<{ id: string }>;

        const vigentesIds = new Set(vigentes.map((b) => b.id));
        const invalidas = dto.bandeja_ids.filter((id) => !vigentesIds.has(id));

        if (invalidas.length > 0) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message: `Las bandejas indicadas dejaron de estar en estado en_nursery`,
            status: 422,
            details: { bandeja_ids: invalidas },
          });
        }

        for (const bandeja_id of dto.bandeja_ids) {
          await qr.manager.save(AplicacionQuimicaBandeja, {
            aplicacion_id: savedAplicacion.id,
            bandeja_id,
          });

          await this.recomputeCarenciaHasta(
            qr,
            tenantId,
            AplicacionContexto.NURSERY,
            bandeja_id,
          );
        }
      }

      // Greenhouse mesa links + historial + carencia
      if (dto.contexto === AplicacionContexto.GREENHOUSE && dto.mesa_ids) {
        const aplicacionDate = new Date();

        for (const mesa_id of dto.mesa_ids) {
          await qr.manager.save(AplicacionQuimicaMesa, {
            aplicacion_id: savedAplicacion.id,
            mesa_id,
          });

          await qr.manager.save(HistorialMesa, {
            mesa_id,
            tipo_evento: HistorialTipoEvento.APLICACION_QUIMICA,
            tenant_id: tenantId,
            usuario_id: userId,
            ...usuarioSnapshot,
            fecha_hora: aplicacionDate,
            detalle: {
              aplicacion_id: savedAplicacion.id,
              lote_quimico_id: dto.lote_quimico_id,
              dosis: dto.dosis,
              cantidad: dto.cantidad,
              batch: primaryLote.numero_lote ?? null,
              quimicos_adicionales: savedDetalles.slice(1).map((d) => ({
                lote_quimico_id: d.lote_quimico_id,
                cantidad: d.cantidad,
              })),
            },
          });

          const carenciaHastaStr = await this.recomputeCarenciaHasta(
            qr,
            tenantId,
            AplicacionContexto.GREENHOUSE,
            mesa_id,
          );

          if (carenciaHastaStr !== null) {
            await qr.manager.save(HistorialMesa, {
              mesa_id,
              tipo_evento: HistorialTipoEvento.EN_CARENCIA,
              tenant_id: tenantId,
              usuario_id: userId,
              ...usuarioSnapshot,
              fecha_hora: aplicacionDate,
              detalle: {
                aplicacion_id: savedAplicacion.id,
                lote_quimico_id: dto.lote_quimico_id,
                withholding_period_dias: ownWhp,
                carencia_hasta: carenciaHastaStr,
              },
            });
          }
        }
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    const auditAction =
      dto.contexto === AplicacionContexto.NURSERY
        ? AUDIT.NURSERY
        : AUDIT.GREENHOUSE;
    await this.writeAudit(
      auditAction,
      'aplicacion_quimica',
      savedAplicacion.id,
      { requestId: '', method: 'POST', url: '/aplicaciones-quimicas', userId },
      tenantId,
      201,
    );

    return {
      aplicacion: savedAplicacion,
      detalles: savedDetalles,
      afectados:
        dto.contexto === AplicacionContexto.NURSERY
          ? { bandeja_ids: dto.bandeja_ids }
          : { mesa_ids: dto.mesa_ids },
    };
  }

  async updateAplicacion(
    id: string,
    dto: UpdateAplicacionDto,
    userId: string,
  ): Promise<AplicacionDetalleEnriquecida> {
    const tenantId = this.tenancy.requireTenantId();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. Lock del header — se mantiene hasta el commit para que nada más
      // lo toque mientras revertimos/reaplicamos stock y recalculamos carencia.
      const headerRows = (await qr.query(
        `SELECT * FROM aplicaciones_quimicas WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      )) as AplicacionQuimica[];
      const current = headerRows[0];
      if (!current) {
        throw new AppError({
          code: ErrorCodes.APLICACION_NOT_FOUND,
          message: 'Aplicación química no encontrada',
          status: 404,
        });
      }

      // 2. contexto y establecimiento_id son inmutables — el campo de target
      // enviado debe corresponder al contexto real de esta fila.
      if (current.contexto === AplicacionContexto.NURSERY && dto.mesa_ids) {
        throw new AppError({
          code: ErrorCodes.APLICACION_TARGET_INVALIDO,
          message: 'Esta aplicación es de nursery: no se puede enviar mesa_ids',
          status: 422,
        });
      }
      if (
        current.contexto === AplicacionContexto.GREENHOUSE &&
        dto.bandeja_ids
      ) {
        throw new AppError({
          code: ErrorCodes.APLICACION_TARGET_INVALIDO,
          message:
            'Esta aplicación es de greenhouse: no se puede enviar bandeja_ids',
          status: 422,
        });
      }

      const targetLinkTable =
        current.contexto === AplicacionContexto.NURSERY
          ? 'aplicacion_quimica_bandeja'
          : 'aplicacion_quimica_mesa';
      const targetLinkColumn =
        current.contexto === AplicacionContexto.NURSERY
          ? 'bandeja_id'
          : 'mesa_id';

      // 3. Targets ligados antes de cualquier cambio (para la unión del paso 8).
      const targetsAntesRows = (await qr.query(
        `SELECT ${targetLinkColumn} AS target_id FROM ${targetLinkTable} WHERE aplicacion_id = $1`,
        [id],
      )) as Array<{ target_id: string }>;
      const targetsAntes = targetsAntesRows.map((r) => r.target_id);

      let lote_quimico_id = current.lote_quimico_id;
      let dosis = current.dosis;
      let dosis_unidad = current.dosis_unidad;
      let batch = current.batch;

      // 4. chemical_lines: revertir stock viejo, validar + descontar stock
      // nuevo, reemplazar detalles. La primera línea nueva pasa a ser la
      // primaria del header (columnas denormalizadas).
      if (dto.chemical_lines !== undefined) {
        const detallesActuales = (await qr.query(
          `SELECT lote_quimico_id, cantidad FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
          [id],
        )) as Array<{ lote_quimico_id: string; cantidad: string }>;

        for (const d of detallesActuales) {
          await this.incrementarLote(
            qr,
            d.lote_quimico_id,
            this.toNumberOrNull(d.cantidad) ?? 0,
            tenantId,
          );
        }

        await qr.query(
          `DELETE FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
          [id],
        );

        for (let i = 0; i < dto.chemical_lines.length; i++) {
          const line = dto.chemical_lines[i];
          const { lote, quimico } = await this.validateChemicalLine(
            line.lote_quimico_id,
            current.establecimiento_id,
          );
          await this.decrementarLote(
            qr,
            line.lote_quimico_id,
            line.cantidad,
            tenantId,
          );
          const lineaDosisUnidad =
            line.dosis_unidad ?? quimico.rate_unidad ?? null;
          await qr.manager.save(AplicacionQuimicaDetalle, {
            aplicacion_id: id,
            lote_quimico_id: line.lote_quimico_id,
            dosis: line.dosis,
            dosis_unidad: lineaDosisUnidad,
            cantidad: line.cantidad,
            unidad_medida: quimico.unidad_medida,
          });

          if (i === 0) {
            lote_quimico_id = line.lote_quimico_id;
            dosis = line.dosis;
            dosis_unidad = lineaDosisUnidad;
            batch = lote.numero_lote ?? null;
          }
        }
      }

      // 5. bandeja_ids / mesa_ids: reemplaza TODOS los targets del contexto.
      const targetIdsNuevos = dto.bandeja_ids ?? dto.mesa_ids;
      if (targetIdsNuevos !== undefined) {
        await this.validateAndLockTargets(
          qr,
          tenantId,
          current.contexto,
          current.establecimiento_id,
          targetIdsNuevos,
        );

        await qr.query(
          `DELETE FROM ${targetLinkTable} WHERE aplicacion_id = $1`,
          [id],
        );

        if (current.contexto === AplicacionContexto.NURSERY) {
          for (const bandeja_id of targetIdsNuevos) {
            await qr.manager.save(AplicacionQuimicaBandeja, {
              aplicacion_id: id,
              bandeja_id,
            });
          }
        } else {
          for (const mesa_id of targetIdsNuevos) {
            await qr.manager.save(AplicacionQuimicaMesa, {
              aplicacion_id: id,
              mesa_id,
            });
          }
        }
      }

      // 6-7. fecha_hora / observaciones (observaciones admite null explícito
      // para limpiarlas).
      const fecha_hora =
        dto.fecha_hora !== undefined
          ? new Date(dto.fecha_hora)
          : current.fecha_hora;
      const observaciones =
        dto.observaciones !== undefined
          ? dto.observaciones
          : current.observaciones;

      // 9. updated_by + snapshot, junto con el resto de columnas del header
      // que hayan cambiado — un solo UPDATE. Corre ANTES del recálculo de
      // carencia (paso 8) porque éste lee fecha_hora/detalles frescos desde
      // la base, no desde variables en memoria.
      const usuarioSnapshot = await fetchUsuarioSnapshot(
        qr.manager,
        userId,
        tenantId,
      );
      await qr.query(
        `UPDATE aplicaciones_quimicas
            SET lote_quimico_id = $1, dosis = $2, dosis_unidad = $3, batch = $4,
                fecha_hora = $5, observaciones = $6,
                updated_by = $7, updated_by_email_snapshot = $8,
                updated_by_nombre_snapshot = $9, updated_by_apellido_snapshot = $10,
                updated_at = now()
          WHERE id = $11 AND tenant_id = $12`,
        [
          lote_quimico_id,
          dosis,
          dosis_unidad,
          batch,
          fecha_hora,
          observaciones,
          userId,
          usuarioSnapshot.usuario_email_snapshot,
          usuarioSnapshot.usuario_nombre_snapshot,
          usuarioSnapshot.usuario_apellido_snapshot,
          id,
          tenantId,
        ],
      );

      // 8. Recalcular carencia para la unión de targets antes ∪ después,
      // solo si algo que puede afectarla cambió.
      const tocaCarencia =
        dto.fecha_hora !== undefined ||
        dto.chemical_lines !== undefined ||
        targetIdsNuevos !== undefined;

      if (tocaCarencia) {
        const targetsDespues = targetIdsNuevos ?? targetsAntes;
        const targetsUnion = [...new Set([...targetsAntes, ...targetsDespues])];

        for (const targetId of targetsUnion) {
          const carenciaHastaStr = await this.recomputeCarenciaHasta(
            qr,
            tenantId,
            current.contexto,
            targetId,
          );

          if (
            current.contexto === AplicacionContexto.GREENHOUSE &&
            carenciaHastaStr !== null
          ) {
            await qr.manager.save(HistorialMesa, {
              mesa_id: targetId,
              tipo_evento: HistorialTipoEvento.EN_CARENCIA,
              tenant_id: tenantId,
              usuario_id: userId,
              ...usuarioSnapshot,
              fecha_hora: new Date(),
              detalle: {
                aplicacion_id: id,
                carencia_hasta: carenciaHastaStr,
              },
            });
          }
        }
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // 10. Auditoría fuera de la transacción, mismo patrón que createAplicacion.
    await this.writeAudit(
      AUDIT.UPDATE,
      'aplicacion_quimica',
      id,
      {
        requestId: '',
        method: 'PATCH',
        url: `/aplicaciones-quimicas/${id}`,
        userId,
      },
      tenantId,
      200,
    );

    return this.getAplicacionById(id, tenantId);
  }

  /**
   * Corrige en una sola transacción TODAS las filas físicas de un
   * operation_group_id (crear / actualizar / borrar por ítem). El backend
   * nunca reparte ni inventa `cantidad`: cada ítem trae su propio valor
   * literal, igual que hoy en POST/PATCH de fila única.
   */
  async updateOperationGroup(
    operationGroupId: string,
    dto: UpdateOperationGroupDto,
    userId: string,
  ): Promise<{
    operation_group_id: string;
    applications: AplicacionDetalleEnriquecida[];
    deleted_ids: string[];
  }> {
    const tenantId = this.tenancy.requireTenantId();

    // Reglas de forma que no dependen de DB — se validan antes de abrir la
    // transacción para no sostener locks por un body inválido.
    const nonCreateIds = dto.items
      .filter((i) => i.op !== OperationGroupOp.CREATE)
      .map((i) => i.id as string);
    if (new Set(nonCreateIds).size !== nonCreateIds.length) {
      throw new AppError({
        code: ErrorCodes.BAD_REQUEST,
        message: 'No puede haber ids duplicados entre los ítems',
        status: 400,
      });
    }
    for (const item of dto.items) {
      if (item.op === OperationGroupOp.CREATE) {
        if (item.id !== undefined) {
          throw new AppError({
            code: ErrorCodes.BAD_REQUEST,
            message: 'Un ítem create no debe traer id',
            status: 400,
          });
        }
        if (
          !item.chemical_lines?.length ||
          (!item.bandeja_ids?.length && !item.mesa_ids?.length)
        ) {
          throw new AppError({
            code: ErrorCodes.BAD_REQUEST,
            message:
              'Un ítem create requiere chemical_lines y bandeja_ids o mesa_ids',
            status: 400,
          });
        }
      } else if (item.op === OperationGroupOp.DELETE) {
        if (
          item.chemical_lines !== undefined ||
          item.bandeja_ids !== undefined ||
          item.mesa_ids !== undefined
        ) {
          throw new AppError({
            code: ErrorCodes.BAD_REQUEST,
            message:
              'Un ítem delete no debe traer chemical_lines, bandeja_ids ni mesa_ids',
            status: 400,
          });
        }
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let survivingIds: string[] = [];
    const deletedIds: string[] = [];
    const auditEntries: Array<{ id: string; action: string }> = [];

    try {
      // 1. Lock de todas las filas del grupo — el índice compuesto
      // (tenant_id, operation_group_id) ya cubre esta query.
      const headerRows = (await qr.query(
        `SELECT * FROM aplicaciones_quimicas WHERE tenant_id = $1 AND operation_group_id = $2 ORDER BY id FOR UPDATE`,
        [tenantId, operationGroupId],
      )) as AplicacionQuimica[];

      if (headerRows.length === 0) {
        throw new AppError({
          code: ErrorCodes.APLICACION_NOT_FOUND,
          message: 'No existe ninguna aplicación con ese operation_group_id',
          status: 404,
        });
      }

      // 2. El grupo debe ser uniforme — nada valida esto al aceptar un
      // operation_group_id de cliente en createAplicacion, así que no se
      // puede asumir. Si no lo es, es un dato pre-existente inconsistente.
      const contexto = headerRows[0].contexto;
      const establecimientoId = headerRows[0].establecimiento_id;
      if (
        headerRows.some(
          (r) =>
            r.contexto !== contexto ||
            r.establecimiento_id !== establecimientoId,
        )
      ) {
        throw new AppError({
          code: ErrorCodes.CONFLICT,
          message:
            'Las filas de este operation_group_id no son uniformes (contexto/establecimiento)',
          status: 409,
        });
      }

      const groupRowIds = new Set(headerRows.map((r) => r.id));

      // 3-4. Campo de target coherente con el contexto + todo id de
      // update/delete pertenece a este grupo.
      for (const item of dto.items) {
        const wrongFieldValue =
          contexto === AplicacionContexto.NURSERY
            ? item.mesa_ids
            : item.bandeja_ids;
        if (wrongFieldValue !== undefined) {
          throw new AppError({
            code: ErrorCodes.APLICACION_TARGET_INVALIDO,
            message:
              contexto === AplicacionContexto.NURSERY
                ? 'Este grupo es de nursery: no se puede enviar mesa_ids'
                : 'Este grupo es de greenhouse: no se puede enviar bandeja_ids',
            status: 422,
          });
        }
        if (
          item.op !== OperationGroupOp.CREATE &&
          !groupRowIds.has(item.id as string)
        ) {
          throw new AppError({
            code: ErrorCodes.APLICACION_NOT_FOUND,
            message: `La fila ${item.id} no pertenece a este operation_group_id`,
            status: 404,
          });
        }
      }

      // 5. El grupo no puede quedar vacío.
      const deleteIds = new Set(
        dto.items
          .filter((i) => i.op === OperationGroupOp.DELETE)
          .map((i) => i.id as string),
      );
      const createCount = dto.items.filter(
        (i) => i.op === OperationGroupOp.CREATE,
      ).length;
      if (headerRows.length - deleteIds.size + createCount < 1) {
        throw new AppError({
          code: ErrorCodes.APLICACION_TARGETS_VACIOS,
          message: 'El grupo quedaría sin filas',
          status: 422,
        });
      }

      const targetLinkTable =
        contexto === AplicacionContexto.NURSERY
          ? 'aplicacion_quimica_bandeja'
          : 'aplicacion_quimica_mesa';
      const targetLinkColumn =
        contexto === AplicacionContexto.NURSERY ? 'bandeja_id' : 'mesa_id';

      // 6. Snapshot de targets ligados a cualquier fila del grupo, antes de
      // mutar nada.
      const groupIdsArr = [...groupRowIds];
      const targetsAntesRows = (await qr.query(
        `SELECT DISTINCT ${targetLinkColumn} AS target_id FROM ${targetLinkTable} WHERE aplicacion_id = ANY($1::uuid[])`,
        [groupIdsArr],
      )) as Array<{ target_id: string }>;
      const targetsAntes = targetsAntesRows.map((r) => r.target_id);

      const usuarioSnapshot = await fetchUsuarioSnapshot(
        qr.manager,
        userId,
        tenantId,
      );

      // 7-8. Fase A+B: revertir stock y borrar (hijos antes que padre) de
      // cada fila marcada delete.
      for (const item of dto.items) {
        if (item.op !== OperationGroupOp.DELETE) continue;
        const rowId = item.id as string;

        const detalles = (await qr.query(
          `SELECT lote_quimico_id, cantidad FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
          [rowId],
        )) as Array<{ lote_quimico_id: string; cantidad: string }>;
        for (const d of detalles) {
          await this.incrementarLote(
            qr,
            d.lote_quimico_id,
            this.toNumberOrNull(d.cantidad) ?? 0,
            tenantId,
          );
        }

        await qr.query(
          `DELETE FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
          [rowId],
        );
        await qr.query(
          `DELETE FROM ${targetLinkTable} WHERE aplicacion_id = $1`,
          [rowId],
        );
        await qr.query(`DELETE FROM aplicaciones_quimicas WHERE id = $1`, [
          rowId,
        ]);

        deletedIds.push(rowId);
        auditEntries.push({ id: rowId, action: AUDIT.GROUP_DELETE });
      }

      // 9-11. Fase C+D+E: cada ítem update — nuevas líneas químicas, nuevos
      // targets, y header (fecha_hora/observaciones de grupo + updated_by).
      for (const item of dto.items) {
        if (item.op !== OperationGroupOp.UPDATE) continue;
        const rowId = item.id as string;
        const current = headerRows.find((r) => r.id === rowId)!;

        let lote_quimico_id = current.lote_quimico_id;
        let dosis = current.dosis;
        let dosis_unidad = current.dosis_unidad;
        let batch = current.batch;

        if (item.chemical_lines !== undefined) {
          const detallesActuales = (await qr.query(
            `SELECT lote_quimico_id, cantidad FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
            [rowId],
          )) as Array<{ lote_quimico_id: string; cantidad: string }>;
          for (const d of detallesActuales) {
            await this.incrementarLote(
              qr,
              d.lote_quimico_id,
              this.toNumberOrNull(d.cantidad) ?? 0,
              tenantId,
            );
          }
          await qr.query(
            `DELETE FROM aplicaciones_quimicas_detalle WHERE aplicacion_id = $1`,
            [rowId],
          );

          for (let i = 0; i < item.chemical_lines.length; i++) {
            const line = item.chemical_lines[i];
            const { lote, quimico } = await this.validateChemicalLine(
              line.lote_quimico_id,
              establecimientoId,
            );
            await this.decrementarLote(
              qr,
              line.lote_quimico_id,
              line.cantidad,
              tenantId,
            );
            const lineaDosisUnidad =
              line.dosis_unidad ?? quimico.rate_unidad ?? null;
            await qr.manager.save(AplicacionQuimicaDetalle, {
              aplicacion_id: rowId,
              lote_quimico_id: line.lote_quimico_id,
              dosis: line.dosis,
              dosis_unidad: lineaDosisUnidad,
              cantidad: line.cantidad,
              unidad_medida: quimico.unidad_medida,
            });

            if (i === 0) {
              lote_quimico_id = line.lote_quimico_id;
              dosis = line.dosis;
              dosis_unidad = lineaDosisUnidad;
              batch = lote.numero_lote ?? null;
            }
          }
        }

        const targetIdsNuevos = item.bandeja_ids ?? item.mesa_ids;
        if (targetIdsNuevos !== undefined) {
          await this.validateAndLockTargets(
            qr,
            tenantId,
            contexto,
            establecimientoId,
            targetIdsNuevos,
          );

          await qr.query(
            `DELETE FROM ${targetLinkTable} WHERE aplicacion_id = $1`,
            [rowId],
          );

          if (contexto === AplicacionContexto.NURSERY) {
            for (const bandeja_id of targetIdsNuevos) {
              await qr.manager.save(AplicacionQuimicaBandeja, {
                aplicacion_id: rowId,
                bandeja_id,
              });
            }
          } else {
            for (const mesa_id of targetIdsNuevos) {
              await qr.manager.save(AplicacionQuimicaMesa, {
                aplicacion_id: rowId,
                mesa_id,
              });
            }
          }
        }

        const fecha_hora =
          dto.fecha_hora !== undefined
            ? new Date(dto.fecha_hora)
            : current.fecha_hora;
        const observaciones =
          dto.observaciones !== undefined
            ? dto.observaciones
            : current.observaciones;

        await qr.query(
          `UPDATE aplicaciones_quimicas
              SET lote_quimico_id = $1, dosis = $2, dosis_unidad = $3, batch = $4,
                  fecha_hora = $5, observaciones = $6,
                  updated_by = $7, updated_by_email_snapshot = $8,
                  updated_by_nombre_snapshot = $9, updated_by_apellido_snapshot = $10,
                  updated_at = now()
            WHERE id = $11 AND tenant_id = $12`,
          [
            lote_quimico_id,
            dosis,
            dosis_unidad,
            batch,
            fecha_hora,
            observaciones,
            userId,
            usuarioSnapshot.usuario_email_snapshot,
            usuarioSnapshot.usuario_nombre_snapshot,
            usuarioSnapshot.usuario_apellido_snapshot,
            rowId,
            tenantId,
          ],
        );

        auditEntries.push({ id: rowId, action: AUDIT.GROUP_UPDATE });
      }

      // 12. Fase F: cada ítem create — mismo patrón que createAplicacion
      // (primario = chemical_lines[0]), generalizado a N líneas.
      for (const item of dto.items) {
        if (item.op !== OperationGroupOp.CREATE) continue;

        const chemicalLines = item.chemical_lines as DetalleItemDto[];
        const targetIdsNuevos = (item.bandeja_ids ?? item.mesa_ids) as string[];

        await this.validateAndLockTargets(
          qr,
          tenantId,
          contexto,
          establecimientoId,
          targetIdsNuevos,
        );

        const lineEntries: Array<{
          line: DetalleItemDto;
          lote: LoteQuimico;
          quimico: Quimico;
        }> = [];
        for (const line of chemicalLines) {
          const { lote, quimico } = await this.validateChemicalLine(
            line.lote_quimico_id,
            establecimientoId,
          );
          lineEntries.push({ line, lote, quimico });
        }

        const whpCandidates = lineEntries
          .map((e) => e.quimico.withholding_period_dias)
          .filter((v): v is number => v !== null && v !== undefined);
        const ownWhp =
          whpCandidates.length > 0 ? Math.max(...whpCandidates) : null;

        const primary = lineEntries[0];
        const newRow = qr.manager.create(AplicacionQuimica, {
          tenant_id: tenantId,
          establecimiento_id: establecimientoId,
          contexto,
          observaciones:
            dto.observaciones !== undefined ? dto.observaciones : null,
          usuario_id: userId,
          ...usuarioSnapshot,
          fecha_hora:
            dto.fecha_hora !== undefined
              ? new Date(dto.fecha_hora)
              : new Date(),
          lote_quimico_id: primary.line.lote_quimico_id,
          dosis: primary.line.dosis,
          dosis_unidad:
            primary.line.dosis_unidad ?? primary.quimico.rate_unidad ?? null,
          batch: primary.lote.numero_lote ?? null,
          withholding_period_dias: ownWhp,
          operation_group_id: operationGroupId,
        });
        const savedRow = await qr.manager.save(AplicacionQuimica, newRow);

        for (const { line, quimico } of lineEntries) {
          await this.decrementarLote(
            qr,
            line.lote_quimico_id,
            line.cantidad,
            tenantId,
          );
          await qr.manager.save(AplicacionQuimicaDetalle, {
            aplicacion_id: savedRow.id,
            lote_quimico_id: line.lote_quimico_id,
            dosis: line.dosis,
            dosis_unidad: line.dosis_unidad ?? quimico.rate_unidad ?? null,
            cantidad: line.cantidad,
            unidad_medida: quimico.unidad_medida,
          });
        }

        if (contexto === AplicacionContexto.NURSERY) {
          for (const bandeja_id of targetIdsNuevos) {
            await qr.manager.save(AplicacionQuimicaBandeja, {
              aplicacion_id: savedRow.id,
              bandeja_id,
            });
          }
        } else {
          const aplicacionDate = savedRow.fecha_hora;
          for (const mesa_id of targetIdsNuevos) {
            await qr.manager.save(AplicacionQuimicaMesa, {
              aplicacion_id: savedRow.id,
              mesa_id,
            });

            await qr.manager.save(HistorialMesa, {
              mesa_id,
              tipo_evento: HistorialTipoEvento.APLICACION_QUIMICA,
              tenant_id: tenantId,
              usuario_id: userId,
              ...usuarioSnapshot,
              fecha_hora: aplicacionDate,
              detalle: {
                aplicacion_id: savedRow.id,
                lote_quimico_id: primary.line.lote_quimico_id,
                dosis: primary.line.dosis,
                cantidad: primary.line.cantidad,
                batch: primary.lote.numero_lote ?? null,
                quimicos_adicionales: lineEntries.slice(1).map((e) => ({
                  lote_quimico_id: e.line.lote_quimico_id,
                  cantidad: e.line.cantidad,
                })),
              },
            });
          }
        }

        groupRowIds.add(savedRow.id);
        auditEntries.push({ id: savedRow.id, action: AUDIT.GROUP_CREATE });
      }

      // 13. targetsDespues recalculado desde la DB (no armado a mano desde
      // el body) — queda correcto aunque una fila agregue un target que otra
      // quitó en el mismo request.
      survivingIds = [...groupRowIds].filter((id) => !deleteIds.has(id));

      const targetsDespuesRows = survivingIds.length
        ? ((await qr.query(
            `SELECT DISTINCT ${targetLinkColumn} AS target_id FROM ${targetLinkTable} WHERE aplicacion_id = ANY($1::uuid[])`,
            [survivingIds],
          )) as Array<{ target_id: string }>)
        : [];
      const targetsDespues = targetsDespuesRows.map((r) => r.target_id);

      // 14. Recalcular carencia para la unión antes ∪ después — siempre,
      // sin gate condicional (a diferencia del PATCH de fila única, acá
      // casi cualquier ítem puede afectar carencia de algún target).
      const targetsUnion = [...new Set([...targetsAntes, ...targetsDespues])];
      for (const targetId of targetsUnion) {
        const carenciaHastaStr = await this.recomputeCarenciaHasta(
          qr,
          tenantId,
          contexto,
          targetId,
        );

        if (
          contexto === AplicacionContexto.GREENHOUSE &&
          carenciaHastaStr !== null
        ) {
          await qr.manager.save(HistorialMesa, {
            mesa_id: targetId,
            tipo_evento: HistorialTipoEvento.EN_CARENCIA,
            tenant_id: tenantId,
            usuario_id: userId,
            ...usuarioSnapshot,
            fecha_hora: new Date(),
            detalle: {
              operation_group_id: operationGroupId,
              carencia_hasta: carenciaHastaStr,
            },
          });
        }
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // 16. Auditoría fuera de la transacción, una entrada por fila tocada —
    // quien audite una fila puntual debe encontrarla sin importar por qué
    // endpoint se tocó.
    for (const entry of auditEntries) {
      await this.writeAudit(
        entry.action,
        'aplicacion_quimica',
        entry.id,
        {
          requestId: '',
          method: 'PATCH',
          url: `/aplicaciones-quimicas/operation-group/${operationGroupId}`,
          userId,
        },
        tenantId,
        200,
      );
    }

    // 17. Response: filas sobrevivientes con el mismo shape enriquecido que
    // POST/GET/PATCH, ordenadas por created_at. Sin shape "agregado" —
    // fusionar totales sería un número fabricado por el backend.
    const applications = await Promise.all(
      survivingIds.map((appId) => this.getAplicacionById(appId, tenantId)),
    );
    applications.sort(
      (a, b) =>
        a.aplicacion.created_at.getTime() - b.aplicacion.created_at.getTime(),
    );

    return {
      operation_group_id: operationGroupId,
      applications,
      deleted_ids: deletedIds,
    };
  }

  async listAplicaciones(
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{ items: AplicacionListItem[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha_hora', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '')
      ? (q.sortBy as string)
      : 'fecha_hora';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.aplicacionRepo
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId });

    if (q.establecimiento_id)
      qb.andWhere('a.establecimiento_id = :eid', { eid: q.establecimiento_id });
    if (q.contexto)
      qb.andWhere('a.contexto = :contexto', { contexto: q.contexto });
    if (q.fecha_desde)
      qb.andWhere('a.fecha_hora >= :fecha_desde', {
        fecha_desde: q.fecha_desde,
      });
    if (q.fecha_hasta)
      qb.andWhere('a.fecha_hora <= :fecha_hasta', {
        fecha_hasta: q.fecha_hasta,
      });

    if (q.quimico_id) {
      qb.innerJoin(
        'aplicaciones_quimicas_detalle',
        'aqd',
        'aqd.aplicacion_id = a.id',
      )
        .innerJoin('lotes_quimicos', 'lq', 'lq.id = aqd.lote_quimico_id')
        .andWhere('lq.quimico_id = :quimico_id', { quimico_id: q.quimico_id });
    }

    qb.orderBy(`a.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const enriched = await this.enrichAplicaciones(items, tenantId);
    return { items: enriched, total };
  }

  async getAplicacionById(
    id: string,
    tenantId: string,
  ): Promise<AplicacionDetalleEnriquecida> {
    const aplicacion = await this.aplicacionRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!aplicacion) {
      throw new AppError({
        code: ErrorCodes.APLICACION_NOT_FOUND,
        message: 'Aplicación química no encontrada',
        status: 404,
      });
    }

    const [detalles, usuariosMap] = await Promise.all([
      this.buildDetalleLines(id),
      buildUsuariosMap(this.dataSource, [aplicacion.usuario_id], tenantId),
    ]);
    const usuario = resolveUsuarioResumen(
      aplicacion.usuario_id,
      aplicacion,
      usuariosMap.get(aplicacion.usuario_id),
    );

    if (aplicacion.contexto === AplicacionContexto.NURSERY) {
      const { targets, bandejaIds } = await this.buildNurseryTargets(id);
      return {
        aplicacion: { ...aplicacion, usuario },
        detalles,
        bandeja_ids: bandejaIds,
        targets,
      };
    } else {
      const { targets, mesaIds } = await this.buildGreenhouseTargets(id);
      return {
        aplicacion: { ...aplicacion, usuario },
        detalles,
        mesa_ids: mesaIds,
        targets,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Enriquecimiento de lectura (listado + detalle) — queries batch por
  // página; nunca una query por aplicación/mesa/bandeja individual.
  // ──────────────────────────────────────────────────────────────────────

  private toNumberOrNull(
    value: string | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }

  private refOrNull(
    id: string | null,
    nombre: string | null,
  ): RefNombre | null {
    return id !== null && nombre !== null ? { id, nombre } : null;
  }

  private loteRefOrNull(
    id: string | null,
    numero_lote: string | null,
  ): LoteRef | null {
    return id !== null && numero_lote !== null ? { id, numero_lote } : null;
  }

  private loteVermiculitaRefOrNull(
    id: string | null,
    numero_lote: string | null,
    grado: number | null,
  ): LoteVermiculitaRef | null {
    return id !== null && numero_lote !== null && grado !== null
      ? { id, numero_lote, grado }
      : null;
  }

  private async enrichAplicaciones(
    aplicaciones: AplicacionQuimica[],
    tenantId: string,
  ): Promise<AplicacionListItem[]> {
    if (!aplicaciones.length) return [];

    const ghIds = aplicaciones
      .filter((a) => a.contexto === AplicacionContexto.GREENHOUSE)
      .map((a) => a.id);
    const nuIds = aplicaciones
      .filter((a) => a.contexto === AplicacionContexto.NURSERY)
      .map((a) => a.id);
    const userIds = [...new Set(aplicaciones.map((a) => a.usuario_id))];

    const [usuarios, chemicalLines, ghSummary, nuSummary] = await Promise.all([
      buildUsuariosMap(this.dataSource, userIds, tenantId),
      this.buildChemicalLinesMap(aplicaciones),
      this.buildGreenhouseSummaryMap(ghIds),
      this.buildNurserySummaryMap(nuIds),
    ]);

    return aplicaciones.map((a) => {
      const tunnels = ghSummary.get(a.id) ?? [];
      const seedings = nuSummary.get(a.id) ?? [];
      const target_count =
        a.contexto === AplicacionContexto.GREENHOUSE
          ? tunnels.reduce((sum, t) => sum + t.table_count, 0)
          : seedings.reduce((sum, s) => sum + s.tray_count, 0);
      return {
        ...a,
        usuario: resolveUsuarioResumen(
          a.usuario_id,
          a,
          usuarios.get(a.usuario_id),
        ),
        target_count,
        target_summary: { tunnels, seedings },
        chemical_lines: chemicalLines.get(a.id) ?? [],
      };
    });
  }

  /** Adjunta `usuario` (snapshot + join en vivo) sin el resto del enriquecimiento de listado. */
  private async attachUsuario<T extends AplicacionQuimica>(
    aplicaciones: T[],
    tenantId: string,
  ): Promise<(T & { usuario: UsuarioResumen | null })[]> {
    if (!aplicaciones.length) return [];
    const userIds = aplicaciones.map((a) => a.usuario_id);
    const usuarios = await buildUsuariosMap(this.dataSource, userIds, tenantId);
    return aplicaciones.map((a) => ({
      ...a,
      usuario: resolveUsuarioResumen(
        a.usuario_id,
        a,
        usuarios.get(a.usuario_id),
      ),
    }));
  }

  /**
   * Query base compartida por `buildChemicalLinesMap` (listado, shape plano)
   * y `buildDetalleLines` (detalle, shape anidado con `lote_quimico`) — un
   * solo lugar con los 5 joins (detalle → lote → quimico → marca/proveedor)
   * para que ambos endpoints devuelvan siempre el mismo dato subyacente.
   */
  private async fetchDetalleRows(
    aplicacionIds: string[],
  ): Promise<ChemicalLineRaw[]> {
    if (!aplicacionIds.length) return [];
    return this.detalleRepo
      .createQueryBuilder('d')
      .select('d.id', 'id')
      .addSelect('d.aplicacion_id', 'aplicacion_id')
      .addSelect('d.lote_quimico_id', 'lote_quimico_id')
      .addSelect('d.dosis', 'dosis')
      .addSelect('d.dosis_unidad', 'dosis_unidad')
      .addSelect('d.cantidad', 'cantidad')
      .addSelect('d.unidad_medida', 'unidad_medida')
      .addSelect('lq.numero_lote', 'lote_numero')
      .addSelect('q.id', 'quimico_id')
      .addSelect('q.nombre', 'quimico_nombre')
      .addSelect('m.id', 'marca_id')
      .addSelect('m.nombre', 'marca_nombre')
      .addSelect('p.id', 'proveedor_id')
      .addSelect('p.nombre', 'proveedor_nombre')
      .leftJoin('lotes_quimicos', 'lq', 'lq.id = d.lote_quimico_id')
      .leftJoin('quimicos', 'q', 'q.id = lq.quimico_id')
      .leftJoin('marcas', 'm', 'm.id = q.marca_id')
      .leftJoin('proveedores', 'p', 'p.id = lq.proveedor_id')
      .where('d.aplicacion_id IN (:...ids)', { ids: aplicacionIds })
      .orderBy('d.id', 'ASC')
      .getRawMany<ChemicalLineRaw>();
  }

  private async buildChemicalLinesMap(
    aplicaciones: AplicacionQuimica[],
  ): Promise<Map<string, ChemicalLine[]>> {
    const map = new Map<string, ChemicalLine[]>();
    if (!aplicaciones.length) return map;

    const rows = await this.fetchDetalleRows(aplicaciones.map((a) => a.id));
    const aplicacionById = new Map(aplicaciones.map((a) => [a.id, a]));
    const primaryAssigned = new Set<string>();

    for (const r of rows) {
      const a = aplicacionById.get(r.aplicacion_id);
      const isPrimary =
        a !== undefined &&
        a.lote_quimico_id !== null &&
        r.lote_quimico_id === a.lote_quimico_id &&
        !primaryAssigned.has(r.aplicacion_id);
      if (isPrimary) primaryAssigned.add(r.aplicacion_id);

      const line: ChemicalLine = {
        lote_quimico_id: r.lote_quimico_id,
        chemical_id: r.quimico_id,
        chemical_name: r.quimico_nombre,
        lot_name: r.lote_numero,
        quantity: this.toNumberOrNull(r.cantidad),
        unit: r.unidad_medida,
        dose: this.toNumberOrNull(r.dosis),
        dose_unit: r.dosis_unidad,
        // withholding es un snapshot a nivel de header, no existe por detalle.
        withholding_period_days: isPrimary
          ? (a.withholding_period_dias ?? null)
          : null,
        brand: this.refOrNull(r.marca_id, r.marca_nombre),
        supplier: this.refOrNull(r.proveedor_id, r.proveedor_nombre),
      };

      const lines = map.get(r.aplicacion_id);
      if (lines) lines.push(line);
      else map.set(r.aplicacion_id, [line]);
    }
    return map;
  }

  private async buildDetalleLines(
    aplicacionId: string,
  ): Promise<AplicacionDetalleLine[]> {
    const rows = await this.fetchDetalleRows([aplicacionId]);
    return rows.map((r) => ({
      id: r.id,
      aplicacion_id: r.aplicacion_id,
      lote_quimico_id: r.lote_quimico_id,
      dosis: this.toNumberOrNull(r.dosis),
      dosis_unidad: r.dosis_unidad,
      cantidad: this.toNumberOrNull(r.cantidad),
      unidad_medida: r.unidad_medida,
      lote_quimico: r.lote_numero
        ? {
            id: r.lote_quimico_id,
            numero_lote: r.lote_numero,
            quimico: this.refOrNull(r.quimico_id, r.quimico_nombre),
            marca: this.refOrNull(r.marca_id, r.marca_nombre),
            proveedor: this.refOrNull(r.proveedor_id, r.proveedor_nombre),
          }
        : null,
    }));
  }

  private async buildGreenhouseSummaryMap(
    aplicacionIds: string[],
  ): Promise<Map<string, TunnelSummary[]>> {
    const map = new Map<string, TunnelSummary[]>();
    if (!aplicacionIds.length) return map;

    const rows = await this.mesaRepo
      .createQueryBuilder('aqm')
      .select('aqm.aplicacion_id', 'aplicacion_id')
      .addSelect('ms.tunel_id', 'tunel_id')
      .addSelect('t.nombre', 'tunel_nombre')
      .addSelect('COUNT(*)', 'table_count')
      .leftJoin('mesas', 'ms', 'ms.id = aqm.mesa_id')
      .leftJoin('tuneles', 't', 't.id = ms.tunel_id')
      .where('aqm.aplicacion_id IN (:...ids)', { ids: aplicacionIds })
      .groupBy('aqm.aplicacion_id')
      .addGroupBy('ms.tunel_id')
      .addGroupBy('t.nombre')
      .getRawMany<GreenhouseSummaryRaw>();

    for (const r of rows) {
      const summary: TunnelSummary = {
        id: r.tunel_id,
        nombre: r.tunel_nombre,
        table_count: this.toNumberOrNull(r.table_count) ?? 0,
      };
      const tunnels = map.get(r.aplicacion_id);
      if (tunnels) tunnels.push(summary);
      else map.set(r.aplicacion_id, [summary]);
    }
    return map;
  }

  private async buildNurserySummaryMap(
    aplicacionIds: string[],
  ): Promise<Map<string, SeedingSummary[]>> {
    const map = new Map<string, SeedingSummary[]>();
    if (!aplicacionIds.length) return map;

    const rows = await this.bandejaRepo
      .createQueryBuilder('aqb')
      .select('aqb.aplicacion_id', 'aplicacion_id')
      .addSelect('b.siembra_id', 'siembra_id')
      .addSelect('s.created_at', 'siembra_created_at')
      .addSelect('pr.id', 'producto_id')
      .addSelect('pr.nombre', 'producto_nombre')
      .addSelect('v.id', 'variedad_id')
      .addSelect('v.nombre', 'variedad_nombre')
      .addSelect('COUNT(*)', 'tray_count')
      .leftJoin('bandejas', 'b', 'b.id = aqb.bandeja_id')
      .leftJoin('siembras', 's', 's.id = b.siembra_id')
      .leftJoin('lotes', 'ls', 'ls.id = b.lote_semilla_id')
      .leftJoin('productos', 'pr', 'pr.id = ls.producto_id')
      .leftJoin('variedades', 'v', 'v.id = ls.variedad_id')
      .where('aqb.aplicacion_id IN (:...ids)', { ids: aplicacionIds })
      .groupBy('aqb.aplicacion_id')
      .addGroupBy('b.siembra_id')
      .addGroupBy('s.created_at')
      .addGroupBy('pr.id')
      .addGroupBy('pr.nombre')
      .addGroupBy('v.id')
      .addGroupBy('v.nombre')
      .getRawMany<NurserySummaryRaw>();

    // Colapsar heterogeneidad por campo: si una misma siembra emite >1 fila,
    // se suma tray_count y cada campo (product / variety) degrada a null solo
    // si sus valores difieren entre las bandejas afectadas (FR-007).
    const grouped = new Map<string, Map<string, SeedingSummary>>();
    for (const r of rows) {
      const perAplicacion =
        grouped.get(r.aplicacion_id) ?? new Map<string, SeedingSummary>();
      grouped.set(r.aplicacion_id, perAplicacion);

      const key = r.siembra_id ?? '__sin_siembra__';
      const trayCount = this.toNumberOrNull(r.tray_count) ?? 0;
      const product = this.refOrNull(r.producto_id, r.producto_nombre);
      const variety = this.refOrNull(r.variedad_id, r.variedad_nombre);
      const existing = perAplicacion.get(key);
      if (existing) {
        existing.tray_count += trayCount;
        if (
          !(existing.product && product && existing.product.id === product.id)
        ) {
          existing.product = null;
        }
        if (
          !(existing.variety && variety && existing.variety.id === variety.id)
        ) {
          existing.variety = null;
        }
      } else {
        perAplicacion.set(key, {
          id: r.siembra_id,
          created_at: r.siembra_created_at,
          tray_count: trayCount,
          product,
          variety,
        });
      }
    }

    for (const [aplicacionId, perAplicacion] of grouped) {
      map.set(aplicacionId, [...perAplicacion.values()]);
    }
    return map;
  }

  private async buildGreenhouseTargets(
    aplicacionId: string,
  ): Promise<{ targets: GreenhouseTargets; mesaIds: string[] }> {
    const rows = await this.mesaRepo
      .createQueryBuilder('aqm')
      .select('aqm.mesa_id', 'mesa_id')
      .addSelect('ms.nombre', 'mesa_nombre')
      .addSelect('ms.posicion_actual', 'posicion_actual')
      .addSelect('ms.estado', 'mesa_estado')
      .addSelect('ms.tunel_id', 'tunel_id')
      .addSelect('t.nombre', 'tunel_nombre')
      .leftJoin('mesas', 'ms', 'ms.id = aqm.mesa_id')
      .leftJoin('tuneles', 't', 't.id = ms.tunel_id')
      .where('aqm.aplicacion_id = :id', { id: aplicacionId })
      .getRawMany<GreenhouseTargetRaw>();

    const tunnelMap = new Map<string, GreenhouseTunnelGroup>();
    for (const r of rows) {
      const key = r.tunel_id ?? '__sin_tunel__';
      let group = tunnelMap.get(key);
      if (!group) {
        group = { id: r.tunel_id, nombre: r.tunel_nombre, tables: [] };
        tunnelMap.set(key, group);
      }
      group.tables.push({
        id: r.mesa_id,
        nombre: r.mesa_nombre,
        posicion_actual: this.toNumberOrNull(r.posicion_actual),
        estado: r.mesa_estado,
      });
    }

    return {
      targets: {
        context: 'greenhouse',
        total: rows.length,
        tunnels: [...tunnelMap.values()],
      },
      mesaIds: rows.map((r) => r.mesa_id),
    };
  }

  private async buildNurseryTargets(
    aplicacionId: string,
  ): Promise<{ targets: NurseryTargets; bandejaIds: string[] }> {
    const rows = await this.bandejaRepo
      .createQueryBuilder('aqb')
      .select('aqb.bandeja_id', 'bandeja_id')
      .addSelect('b.codigo', 'bandeja_codigo')
      .addSelect('b.estado', 'bandeja_estado')
      .addSelect('b.siembra_id', 'siembra_id')
      .addSelect('s.created_at', 'siembra_created_at')
      .addSelect('ls.id', 'lote_semilla_id')
      .addSelect('ls.numero_lote', 'lote_semilla_numero')
      .addSelect('lsu.id', 'lote_sustrato_id')
      .addSelect('lsu.numero_lote', 'lote_sustrato_numero')
      .addSelect('lv.id', 'lote_vermiculita_id')
      .addSelect('lv.numero_lote', 'lote_vermiculita_numero')
      .addSelect('lv.grado', 'lote_vermiculita_grado')
      .addSelect('pr.id', 'producto_id')
      .addSelect('pr.nombre', 'producto_nombre')
      .addSelect('v.id', 'variedad_id')
      .addSelect('v.nombre', 'variedad_nombre')
      .leftJoin('bandejas', 'b', 'b.id = aqb.bandeja_id')
      .leftJoin('siembras', 's', 's.id = b.siembra_id')
      .leftJoin('lotes', 'ls', 'ls.id = b.lote_semilla_id')
      .leftJoin('lotes', 'lsu', 'lsu.id = b.lote_sustrato_id')
      .leftJoin('lotes', 'lv', 'lv.id = b.lote_vermiculita_id')
      .leftJoin('productos', 'pr', 'pr.id = ls.producto_id')
      .leftJoin('variedades', 'v', 'v.id = ls.variedad_id')
      .where('aqb.aplicacion_id = :id', { id: aplicacionId })
      .getRawMany<NurseryTargetRaw>();

    const seedingMap = new Map<string, NurseryTargetRaw[]>();
    for (const r of rows) {
      const key = r.siembra_id ?? '__sin_siembra__';
      const group = seedingMap.get(key);
      if (group) group.push(r);
      else seedingMap.set(key, [r]);
    }

    const seedings: NurserySeedingGroup[] = [...seedingMap.values()].map(
      (group) => {
        const first = group[0];
        return {
          id: first.siembra_id,
          created_at: first.siembra_created_at,
          tray_count: group.length,
          product: this.homogeneousRef(
            group.map((r) => this.refOrNull(r.producto_id, r.producto_nombre)),
          ),
          variety: this.homogeneousRef(
            group.map((r) => this.refOrNull(r.variedad_id, r.variedad_nombre)),
          ),
          seed_lot: this.homogeneousLote(
            group.map((r) =>
              this.loteRefOrNull(r.lote_semilla_id, r.lote_semilla_numero),
            ),
          ),
          substrate_lot: this.homogeneousLote(
            group.map((r) =>
              this.loteRefOrNull(r.lote_sustrato_id, r.lote_sustrato_numero),
            ),
          ),
          vermiculite_lot: this.homogeneousLote(
            group.map((r) =>
              this.loteVermiculitaRefOrNull(
                r.lote_vermiculita_id,
                r.lote_vermiculita_numero,
                r.lote_vermiculita_grado,
              ),
            ),
          ),
          trays: group.map((r) => ({
            id: r.bandeja_id,
            codigo: r.bandeja_codigo,
            estado: r.bandeja_estado,
          })),
        };
      },
    );

    return {
      targets: { context: 'nursery', total: rows.length, seedings },
      bandejaIds: rows.map((r) => r.bandeja_id),
    };
  }

  /** Devuelve el valor solo si todas las filas comparten el mismo id; si el
   *  conjunto es heterogéneo o algún valor no resuelve, degrada a null. */
  private homogeneousRef(values: (RefNombre | null)[]): RefNombre | null {
    const first = values[0] ?? null;
    if (first === null) return null;
    return values.every((v) => v !== null && v.id === first.id) ? first : null;
  }

  // Genérico: si devolviera LoteRef, el grado de la vermiculita se perdería en
  // silencio (LoteVermiculitaRef es asignable a LoteRef, no hay error de tipos).
  private homogeneousLote<T extends { id: string }>(
    values: (T | null)[],
  ): T | null {
    const first = values[0] ?? null;
    if (first === null) return null;
    return values.every((v) => v !== null && v.id === first.id) ? first : null;
  }

  async getAplicacionesByMesa(
    mesa_id: string,
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{
    items: (AplicacionQuimica & { usuario: UsuarioResumen | null })[];
    total: number;
  }> {
    await this.mesasService.getMesaById(mesa_id, tenantId);

    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.aplicacionRepo
      .createQueryBuilder('a')
      .innerJoin('aplicacion_quimica_mesa', 'aqm', 'aqm.aplicacion_id = a.id')
      .where('aqm.mesa_id = :mesa_id', { mesa_id })
      .andWhere('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.fecha_hora', sortOrder)
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const enriched = await this.attachUsuario(items, tenantId);
    return { items: enriched, total };
  }

  async getAplicacionesByBandeja(
    bandeja_id: string,
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{
    items: (AplicacionQuimica & { usuario: UsuarioResumen | null })[];
    total: number;
  }> {
    await this.bandejaService.getBandeja(bandeja_id);

    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.aplicacionRepo
      .createQueryBuilder('a')
      .innerJoin(
        'aplicacion_quimica_bandeja',
        'aqb',
        'aqb.aplicacion_id = a.id',
      )
      .where('aqb.bandeja_id = :bandeja_id', { bandeja_id })
      .andWhere('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.fecha_hora', sortOrder)
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const enriched = await this.attachUsuario(items, tenantId);
    return { items: enriched, total };
  }

  private async writeAudit(
    action: string,
    entity: string,
    entityId: string,
    req: AuditReq,
    tenantId: string,
    statusCode: number,
  ): Promise<void> {
    const payload = auditLogPayload({
      requestId: req.requestId,
      actorUserId: req.userId,
      actorEmail: req.email,
      action,
      entity,
      extra: { aplicacionId: entityId },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.requestId,
      method: req.method,
      path: req.url,
      status_code: statusCode,
      actor_user_id: req.userId,
      actor_email: req.email ?? null,
      action,
      entity,
      tenant_id: tenantId,
      payload,
    });
  }
}
