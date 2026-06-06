import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { QuimicosService } from 'src/modules/quimicos/quimicos.service';
import { Quimico } from 'src/modules/quimicos/entities/quimico.entity';
import { BandejaService } from 'src/modules/siembra/bandeja.service';
import { BandejaEstado } from 'src/modules/siembra/entities/bandeja.entity';
import { MesasService } from 'src/modules/mesas/mesas.service';
import { MesaEstado } from 'src/modules/mesas/entities/mesa.entity';
import { HistorialMesa, HistorialTipoEvento } from 'src/modules/mesas/entities/historial-mesa.entity';
import { RecetasService } from 'src/modules/recetas/recetas.service';
import { clampPagination } from 'src/common/query/query-utils';
import { AplicacionQuimica, AplicacionContexto } from './entities/aplicacion-quimica.entity';
import { AplicacionQuimicaDetalle } from './entities/aplicacion-quimica-detalle.entity';
import { AplicacionQuimicaBandeja } from './entities/aplicacion-quimica-bandeja.entity';
import { AplicacionQuimicaMesa } from './entities/aplicacion-quimica-mesa.entity';
import { CreateAplicacionDto } from './dto/create-aplicacion.dto';
import { QueryAplicacionesDto } from './dto/query-aplicaciones.dto';

export const AUDIT = {
  NURSERY: 'aplicacion_quimica_nursery',
  INVERNADERO: 'aplicacion_quimica_invernadero',
} as const;

interface StockWarning {
  quimico_id: string;
  nombre: string;
  projected_stock: number;
}

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
  warnings: StockWarning[];
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
    private readonly quimicosService: QuimicosService,
    private readonly bandejaService: BandejaService,
    private readonly mesasService: MesasService,
    private readonly recetasService: RecetasService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  async createAplicacion(
    dto: CreateAplicacionDto,
    userId: string,
  ): Promise<CreateAplicacionResult> {
    const tenantId = this.tenancy.requireTenantId();

    // 1. Validate establishment
    await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

    // 2. invernadero cannot have receta_id
    if (dto.contexto === AplicacionContexto.INVERNADERO && dto.receta_id) {
      throw new AppError({
        code: ErrorCodes.APLICACION_CONTEXTO_INVALIDO,
        message: 'receta_id no es aplicable a aplicaciones de tipo invernadero',
        status: 422,
      });
    }

    // 3. Must have at least one detalle
    if (!dto.detalles?.length) {
      throw new AppError({
        code: ErrorCodes.APLICACION_DETALLES_VACIOS,
        message: 'Se requiere al menos un producto químico en detalles',
        status: 422,
      });
    }

    // 4. Nursery requires bandeja_ids; invernadero requires mesa_ids
    if (dto.contexto === AplicacionContexto.NURSERY && !dto.bandeja_ids?.length) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message: 'Se requiere al menos una bandeja para aplicaciones de nursery',
        status: 422,
      });
    }
    if (dto.contexto === AplicacionContexto.INVERNADERO && !dto.mesa_ids?.length) {
      throw new AppError({
        code: ErrorCodes.APLICACION_TARGETS_VACIOS,
        message: 'Se requiere al menos una mesa para aplicaciones de invernadero',
        status: 422,
      });
    }

    // 5. Load + validate quimicos, build quimicoMap
    const quimicoMap: Record<string, Quimico> = {};
    for (const d of dto.detalles) {
      const quimico = await this.quimicosService.mustFindById(d.quimico_id, { strictTenant: true });
      if (quimico.establecimiento_id !== dto.establecimiento_id) {
        throw new AppError({
          code: ErrorCodes.APLICACION_TARGET_INVALIDO,
          message: `El químico ${d.quimico_id} no pertenece al establecimiento indicado`,
          status: 422,
        });
      }
      quimicoMap[d.quimico_id] = quimico;
    }

    // 6. Validate nursery targets
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

    // 7. Validate invernadero targets
    if (dto.contexto === AplicacionContexto.INVERNADERO && dto.mesa_ids) {
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

    // 8. Validate receta if provided
    if (dto.receta_id) {
      await this.recetasService.mustFindById(dto.receta_id, { strictTenant: true });
    }

    // 9. Pre-transaction stock warnings
    const warnings: StockWarning[] = [];
    for (const d of dto.detalles) {
      const quimico = quimicoMap[d.quimico_id];
      const projected = Number(quimico.stock_actual) - Number(d.cantidad);
      if (projected < 0) {
        warnings.push({
          quimico_id: d.quimico_id,
          nombre: quimico.nombre,
          projected_stock: projected,
        });
      }
    }

    // 10. Transaction
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let savedAplicacion: AplicacionQuimica;
    const savedDetalles: AplicacionQuimicaDetalle[] = [];

    try {
      // INSERT aplicacion
      const aplicacion = qr.manager.create(AplicacionQuimica, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        contexto: dto.contexto,
        receta_id: dto.receta_id ?? null,
        observaciones: dto.observaciones ?? null,
        usuario_id: userId,
        fecha_hora: new Date(),
      });
      savedAplicacion = await qr.manager.save(AplicacionQuimica, aplicacion);

      // INSERT detalles + decrement stock
      for (const d of dto.detalles) {
        const quimico = quimicoMap[d.quimico_id];
        const detalle = qr.manager.create(AplicacionQuimicaDetalle, {
          aplicacion_id: savedAplicacion.id,
          quimico_id: d.quimico_id,
          cantidad: d.cantidad,
          unidad_medida: quimico.unidad_medida,
        });
        const savedDetalle = await qr.manager.save(AplicacionQuimicaDetalle, detalle);
        savedDetalles.push(savedDetalle);
        await qr.query(
          `UPDATE quimicos SET stock_actual = stock_actual - $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
          [d.cantidad, d.quimico_id, tenantId],
        );
      }

      // INSERT nursery bandeja links
      if (dto.contexto === AplicacionContexto.NURSERY && dto.bandeja_ids) {
        for (const bandeja_id of dto.bandeja_ids) {
          await qr.manager.save(AplicacionQuimicaBandeja, {
            aplicacion_id: savedAplicacion.id,
            bandeja_id,
          });
        }
      }

      // INSERT invernadero mesa links + historial
      if (dto.contexto === AplicacionContexto.INVERNADERO && dto.mesa_ids) {
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
            fecha_hora: new Date(),
            detalle: {
              aplicacion_id: savedAplicacion.id,
              quimicos: savedDetalles.map((d) => ({
                quimico_id: d.quimico_id,
                cantidad: d.cantidad,
              })),
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

    // Post-transaction audit
    const auditAction =
      dto.contexto === AplicacionContexto.NURSERY ? AUDIT.NURSERY : AUDIT.INVERNADERO;
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
      warnings,
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
    if (q.receta_id) qb.andWhere('a.receta_id = :receta_id', { receta_id: q.receta_id });
    if (q.fecha_desde)
      qb.andWhere('a.fecha_hora >= :fecha_desde', { fecha_desde: q.fecha_desde });
    if (q.fecha_hasta)
      qb.andWhere('a.fecha_hora <= :fecha_hasta', { fecha_hasta: q.fecha_hasta });

    if (q.quimico_id) {
      qb.leftJoin(
        'aplicaciones_quimicas_detalle',
        'aqd',
        'aqd.aplicacion_id = a.id',
      ).andWhere('aqd.quimico_id = :quimico_id', { quimico_id: q.quimico_id });
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
