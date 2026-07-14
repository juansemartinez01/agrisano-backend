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
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';
import { LoteQuimico } from 'src/modules/lotes-quimicos/entities/lote-quimico.entity';
import { BandejaService } from 'src/modules/siembra/bandeja.service';
import { BandejaEstado } from 'src/modules/siembra/entities/bandeja.entity';
import { MesasService } from 'src/modules/mesas/mesas.service';
import { MesaEstado } from 'src/modules/mesas/entities/mesa.entity';
import { HistorialMesa, HistorialTipoEvento } from 'src/modules/mesas/entities/historial-mesa.entity';
import { clampPagination } from 'src/common/query/query-utils';
import { AplicacionQuimica, AplicacionContexto } from './entities/aplicacion-quimica.entity';
import { AplicacionQuimicaDetalle } from './entities/aplicacion-quimica-detalle.entity';
import { AplicacionQuimicaBandeja } from './entities/aplicacion-quimica-bandeja.entity';
import { AplicacionQuimicaMesa } from './entities/aplicacion-quimica-mesa.entity';
import { CreateAplicacionDto } from './dto/create-aplicacion.dto';
import { QueryAplicacionesDto } from './dto/query-aplicaciones.dto';

export const AUDIT = {
  NURSERY: 'aplicacion_quimica_nursery',
  GREENHOUSE: 'aplicacion_quimica_greenhouse',
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

export interface AplicacionConDetalle {
  aplicacion: AplicacionQuimica;
  detalles: AplicacionQuimicaDetalle[];
  bandeja_ids?: string[];
  mesa_ids?: string[];
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

  async createAplicacion(
    dto: CreateAplicacionDto,
    userId: string,
  ): Promise<CreateAplicacionResult> {
    const tenantId = this.tenancy.requireTenantId();

    // 1. Validate establishment
    await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

    // 2. Load + validate primary lote (and its quimico)
    const { lote: primaryLote, quimico: primaryQuimico } =
      await this.lotesQuimicosService.mustFindByIdWithQuimico(dto.lote_quimico_id);
    if (primaryQuimico.establecimiento_id !== dto.establecimiento_id) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGET_INVALIDO,
        message: `El lote ${dto.lote_quimico_id} no pertenece al establecimiento indicado`,
        status: 422,
      });
    }

    // 3. Nursery requires bandeja_ids; greenhouse requires mesa_ids
    if (dto.contexto === AplicacionContexto.NURSERY && !dto.bandeja_ids?.length) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message: 'Se requiere al menos una bandeja para aplicaciones de nursery',
        status: 422,
      });
    }
    if (dto.contexto === AplicacionContexto.GREENHOUSE && !dto.mesa_ids?.length) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message: 'Se requiere al menos una mesa para aplicaciones de greenhouse',
        status: 422,
      });
    }

    // 4. Load + validate supplementary lotes in detalles[]
    const loteMap: Record<string, { lote: LoteQuimico; quimico: Quimico }> = {};
    for (const d of dto.detalles ?? []) {
      const entry = await this.lotesQuimicosService.mustFindByIdWithQuimico(d.lote_quimico_id);
      if (entry.quimico.establecimiento_id !== dto.establecimiento_id) {
        throw new AppError({
          code: ErrorCodes.APLICACION_TARGET_INVALIDO,
          message: `El lote ${d.lote_quimico_id} no pertenece al establecimiento indicado`,
          status: 422,
        });
      }
      loteMap[d.lote_quimico_id] = entry;
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
        if (mesa.estado !== MesaEstado.ACTIVA && mesa.estado !== MesaEstado.EN_COSECHA) {
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

    // 7. Cantidad total del lote primario: dosis × cantidad de targets (mesas o bandejas)
    const targetCount =
      dto.contexto === AplicacionContexto.GREENHOUSE
        ? (dto.mesa_ids?.length ?? 0)
        : (dto.bandeja_ids?.length ?? 0);
    const primaryTotalDosis = dto.dosis * (targetCount > 0 ? targetCount : 1);

    // 8. Transaction
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let savedAplicacion: AplicacionQuimica;
    const savedDetalles: AplicacionQuimicaDetalle[] = [];

    try {
      const aplicacion = qr.manager.create(AplicacionQuimica, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        contexto: dto.contexto,
        observaciones: dto.observaciones ?? null,
        usuario_id: userId,
        fecha_hora: new Date(),
        lote_quimico_id: dto.lote_quimico_id,
        dosis: dto.dosis,
        dosis_unidad: dto.dosis_unidad ?? (primaryQuimico.rate_unidad as QuimicoRateUnidad) ?? null,
        batch: primaryLote.numero_lote ?? null,
        withholding_period_dias: primaryQuimico.withholding_period_dias ?? null,
      });
      savedAplicacion = await qr.manager.save(AplicacionQuimica, aplicacion);

      // Primary detalle — siempre descuenta stock (nursery y greenhouse)
      await this.decrementarLote(qr, dto.lote_quimico_id, primaryTotalDosis, tenantId);
      const primaryDetalle = qr.manager.create(AplicacionQuimicaDetalle, {
        aplicacion_id: savedAplicacion.id,
        lote_quimico_id: dto.lote_quimico_id,
        cantidad: primaryTotalDosis,
        unidad_medida: primaryQuimico.unidad_medida,
      });
      savedDetalles.push(await qr.manager.save(AplicacionQuimicaDetalle, primaryDetalle));

      // Supplementary detalles + decrement stock
      for (const d of dto.detalles ?? []) {
        const { quimico } = loteMap[d.lote_quimico_id];
        await this.decrementarLote(qr, d.lote_quimico_id, d.cantidad, tenantId);
        const detalle = qr.manager.create(AplicacionQuimicaDetalle, {
          aplicacion_id: savedAplicacion.id,
          lote_quimico_id: d.lote_quimico_id,
          cantidad: d.cantidad,
          unidad_medida: quimico.unidad_medida,
        });
        savedDetalles.push(await qr.manager.save(AplicacionQuimicaDetalle, detalle));
      }

      // Nursery bandeja links + carencia
      if (dto.contexto === AplicacionContexto.NURSERY && dto.bandeja_ids) {
        const hasCarencia =
          primaryQuimico.withholding_period_dias !== null &&
          primaryQuimico.withholding_period_dias !== undefined &&
          primaryQuimico.withholding_period_dias > 0;

        let carenciaHastaStr: string | null = null;
        if (hasCarencia) {
          const carenciaDate = new Date();
          carenciaDate.setDate(carenciaDate.getDate() + primaryQuimico.withholding_period_dias!);
          carenciaHastaStr = carenciaDate.toISOString().split('T')[0];
        }

        for (const bandeja_id of dto.bandeja_ids) {
          await qr.manager.save(AplicacionQuimicaBandeja, {
            aplicacion_id: savedAplicacion.id,
            bandeja_id,
          });

          if (hasCarencia && carenciaHastaStr) {
            await qr.query(
              `UPDATE bandejas SET carencia_hasta = $1 WHERE id = $2 AND tenant_id = $3`,
              [carenciaHastaStr, bandeja_id, tenantId],
            );
          }
        }
      }

      // Greenhouse mesa links + historial + carencia
      if (dto.contexto === AplicacionContexto.GREENHOUSE && dto.mesa_ids) {
        const hasCarencia =
          primaryQuimico.withholding_period_dias !== null &&
          primaryQuimico.withholding_period_dias !== undefined &&
          primaryQuimico.withholding_period_dias > 0;

        const aplicacionDate = new Date();
        let carenciaHastaStr: string | null = null;
        if (hasCarencia) {
          const carenciaDate = new Date(aplicacionDate);
          carenciaDate.setDate(carenciaDate.getDate() + primaryQuimico.withholding_period_dias!);
          carenciaHastaStr = carenciaDate.toISOString().split('T')[0];
        }

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
            fecha_hora: aplicacionDate,
            detalle: {
              aplicacion_id: savedAplicacion.id,
              lote_quimico_id: dto.lote_quimico_id,
              dosis: dto.dosis,
              batch: primaryLote.numero_lote ?? null,
              quimicos_adicionales: savedDetalles.slice(1).map((d) => ({
                lote_quimico_id: d.lote_quimico_id,
                cantidad: d.cantidad,
              })),
            },
          });

          if (hasCarencia && carenciaHastaStr) {
            await qr.query(
              `UPDATE mesas SET carencia_hasta = $1 WHERE id = $2 AND tenant_id = $3`,
              [carenciaHastaStr, mesa_id, tenantId],
            );
            await qr.manager.save(HistorialMesa, {
              mesa_id,
              tipo_evento: HistorialTipoEvento.EN_CARENCIA,
              tenant_id: tenantId,
              usuario_id: userId,
              fecha_hora: aplicacionDate,
              detalle: {
                aplicacion_id: savedAplicacion.id,
                lote_quimico_id: dto.lote_quimico_id,
                withholding_period_dias: primaryQuimico.withholding_period_dias,
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
      dto.contexto === AplicacionContexto.NURSERY ? AUDIT.NURSERY : AUDIT.GREENHOUSE;
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

  async listAplicaciones(
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{ items: AplicacionQuimica[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha_hora', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'fecha_hora';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.aplicacionRepo
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId });

    if (q.establecimiento_id)
      qb.andWhere('a.establecimiento_id = :eid', { eid: q.establecimiento_id });
    if (q.contexto) qb.andWhere('a.contexto = :contexto', { contexto: q.contexto });
    if (q.fecha_desde)
      qb.andWhere('a.fecha_hora >= :fecha_desde', { fecha_desde: q.fecha_desde });
    if (q.fecha_hasta)
      qb.andWhere('a.fecha_hora <= :fecha_hasta', { fecha_hasta: q.fecha_hasta });

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
    return { items, total };
  }

  async getAplicacionById(id: string, tenantId: string): Promise<AplicacionConDetalle> {
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

    const detalles = await this.detalleRepo.find({ where: { aplicacion_id: id } });

    if (aplicacion.contexto === AplicacionContexto.NURSERY) {
      const links = await this.bandejaRepo.find({ where: { aplicacion_id: id } });
      return {
        aplicacion,
        detalles,
        bandeja_ids: links.map((l) => l.bandeja_id),
      };
    } else {
      const links = await this.mesaRepo.find({ where: { aplicacion_id: id } });
      return {
        aplicacion,
        detalles,
        mesa_ids: links.map((l) => l.mesa_id),
      };
    }
  }

  async getAplicacionesByMesa(
    mesa_id: string,
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{ items: AplicacionQuimica[]; total: number }> {
    await this.mesasService.getMesaById(mesa_id, tenantId);

    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.aplicacionRepo
      .createQueryBuilder('a')
      .innerJoin(
        'aplicacion_quimica_mesa',
        'aqm',
        'aqm.aplicacion_id = a.id',
      )
      .where('aqm.mesa_id = :mesa_id', { mesa_id })
      .andWhere('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.fecha_hora', sortOrder)
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getAplicacionesByBandeja(
    bandeja_id: string,
    q: QueryAplicacionesDto,
    tenantId: string,
  ): Promise<{ items: AplicacionQuimica[]; total: number }> {
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
    return { items, total };
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
