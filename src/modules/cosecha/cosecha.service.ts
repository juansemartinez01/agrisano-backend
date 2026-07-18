import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { MesasService } from 'src/modules/mesas/mesas.service';
import { MesaEstado } from 'src/modules/mesas/entities/mesa.entity';
import { HistorialMesa, HistorialTipoEvento } from 'src/modules/mesas/entities/historial-mesa.entity';
import { ProductosService } from 'src/modules/productos/productos.service';
import { VariedadesService } from 'src/modules/productos/variedades.service';
import { clampPagination } from 'src/common/query/query-utils';
import { Cosecha } from './entities/cosecha.entity';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { QueryCosechasDto } from './dto/query-cosechas.dto';

export const AUDIT = {
  COSECHA: 'cosecha_registrada',
} as const;

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

export interface RegistrarCosechaResult {
  cosecha: Cosecha;
  mesa_id: string;
  tunel_id: string;
  posicion_recalculada: boolean;
}

@Injectable()
export class CosechaService {
  constructor(
    @InjectRepository(Cosecha)
    private readonly cosechaRepo: Repository<Cosecha>,
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly mesasService: MesasService,
    private readonly productosService: ProductosService,
    private readonly variedadesService: VariedadesService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  async registrarCosecha(
    dto: CreateCosechaDto,
    userId: string,
    auditReq: AuditReq,
  ): Promise<RegistrarCosechaResult> {
    // PRE-TRANSACTION validations (before QueryRunner opens)
    const tenantId = this.tenancy.requireTenantId();

    const mesa = await this.mesasService.getMesaById(dto.mesa_id, tenantId);

    if (mesa.estado !== MesaEstado.ACTIVA || mesa.posicion_actual === null) {
      throw new AppError({
        code: ErrorCodes.COSECHA_MESA_NO_DISPONIBLE,
        message: 'La mesa no está disponible para cosecha (debe ser activa y estar posicionada en un tunel)',
        status: 422,
      });
    }

    const posicionAlMomento = mesa.posicion_actual;

    await this.productosService.mustFindById(dto.producto_id, { strictTenant: true });
    const variedad = await this.variedadesService.mustFindById(dto.variedad_id, {
      strictTenant: true,
    });
    if (variedad.producto_id !== dto.producto_id) {
      throw new AppError({
        code: ErrorCodes.VARIEDAD_PRODUCTO_MISMATCH,
        message: 'La variedad no pertenece al producto indicado',
        status: 422,
      });
    }

    const tunel_id = mesa.tunel_id;

    // TRANSACTION
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let saved: Cosecha;
    try {
      // 1. INSERT cosecha record
      saved = await qr.manager.save(Cosecha, {
        tenant_id: tenantId,
        mesa_id: dto.mesa_id,
        tunel_id,
        producto_id: dto.producto_id,
        variedad_id: dto.variedad_id,
        posicion_al_momento: posicionAlMomento,
        fecha_hora: new Date(),
        peso_kg: dto.peso_kg,
        usuario_id: userId,
        observaciones: dto.observaciones ?? null,
      });

      // 2. UPDATE mesa: estado=en_cosecha, posicion_actual=NULL
      await qr.query(
        `UPDATE mesas SET estado = 'en_cosecha', posicion_actual = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [dto.mesa_id, tenantId],
      );

      // 3. FIFO recalc: decrement positions of mesas that were behind the harvested one
      await qr.query(
        `UPDATE mesas SET posicion_actual = posicion_actual - 1, updated_at = now()
         WHERE tunel_id = $1 AND tenant_id = $2 AND posicion_actual > $3 AND deleted_at IS NULL`,
        [tunel_id, tenantId, posicionAlMomento],
      );

      // 4. Write HistorialMesa entry inside transaction
      await qr.manager.save(HistorialMesa, {
        mesa_id: dto.mesa_id,
        tipo_evento: HistorialTipoEvento.COSECHA,
        tenant_id: tenantId,
        usuario_id: userId,
        fecha_hora: new Date(),
        detalle: { cosecha_id: saved.id, peso_kg: dto.peso_kg },
      });

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // POST-TRANSACTION: audit
    await this.writeAudit(AUDIT.COSECHA, 'cosecha', saved.id, auditReq, tenantId, 201);

    return { cosecha: saved, mesa_id: dto.mesa_id, tunel_id, posicion_recalculada: true };
  }

  async listCosechas(
    q: QueryCosechasDto,
    tenantId: string,
  ): Promise<{ items: Cosecha[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);

    const qb = this.cosechaRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId });

    if (q.mesa_id) {
      qb.andWhere('c.mesa_id = :mesa_id', { mesa_id: q.mesa_id });
    }
    if (q.tunel_id) {
      qb.andWhere('c.tunel_id = :tunel_id', { tunel_id: q.tunel_id });
    }
    if (q.fecha_desde) {
      qb.andWhere('c.fecha_hora >= :fecha_desde', { fecha_desde: new Date(q.fecha_desde) });
    }
    if (q.fecha_hasta) {
      qb.andWhere('c.fecha_hora <= :fecha_hasta', { fecha_hasta: new Date(q.fecha_hasta) });
    }

    qb.orderBy('c.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getCosechaById(id: string, tenantId: string): Promise<Cosecha> {
    const cosecha = await this.cosechaRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!cosecha) {
      throw new AppError({
        code: ErrorCodes.COSECHA_NOT_FOUND,
        message: 'Cosecha no encontrada',
        status: 404,
      });
    }
    return cosecha;
  }

  async getCosechasByMesa(
    mesa_id: string,
    q: QueryCosechasDto,
    tenantId: string,
  ): Promise<{ items: Cosecha[]; total: number }> {
    await this.mesasService.getMesaById(mesa_id, tenantId);

    const { skip, limit } = clampPagination(q.page, q.limit, 200);

    const qb = this.cosechaRepo
      .createQueryBuilder('c')
      .where('c.mesa_id = :mesa_id', { mesa_id })
      .andWhere('c.tenant_id = :tenantId', { tenantId })
      .orderBy('c.fecha_hora', 'DESC')
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
      extra: { cosechaId: entityId },
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
