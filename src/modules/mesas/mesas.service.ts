import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { TunelesService } from 'src/modules/tuneles/tuneles.service';
import { clampPagination } from 'src/common/query/query-utils';
import { Mesa, MesaEstado } from './entities/mesa.entity';
import { HistorialMesa, HistorialTipoEvento } from './entities/historial-mesa.entity';
import { HistorialMesaService } from './historial-mesa.service';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { UpdateMesaDto } from './dto/update-mesa.dto';
import { QueryMesasDto } from './dto/query-mesas.dto';
import { QueryHistorialDto } from './dto/query-historial.dto';

export const AUDIT = {
  CREATED: 'mesa_created',
  DAR_DE_BAJA: 'mesa_dar_de_baja',
  REACTIVADA: 'mesa_reactivada',
  DELETED: 'mesa_deleted',
} as const;

export interface MesaWithTunel extends Mesa {
  tunel?: { nombre: string; capacidad_maxima: number };
}

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

@Injectable()
export class MesasService {
  constructor(
    @InjectRepository(Mesa)
    private readonly mesaRepo: Repository<Mesa>,
    private readonly dataSource: DataSource,
    private readonly tunelesService: TunelesService,
    private readonly estService: EstablecimientosService,
    private readonly tenancy: TenancyService,
    private readonly historialService: HistorialMesaService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  async createMesa(dto: CreateMesaDto, userId: string): Promise<Mesa> {
    const tenantId = this.tenancy.requireTenantId();

    await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

    const tunel = await this.tunelesService.mustFindById(dto.tunel_id, { strictTenant: true });
    if (tunel.establecimiento_id !== dto.establecimiento_id) {
      throw new AppError({
        code: ErrorCodes.TUNEL_NOT_FOUND,
        message: 'El tunel no pertenece al establecimiento indicado',
        status: 404,
      });
    }

    const codigoQr = randomUUID();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result: Array<{ max: string | null }> = await qr.query(
        `SELECT MAX(posicion_actual) AS max FROM mesas WHERE tunel_id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND posicion_actual IS NOT NULL`,
        [dto.tunel_id, tenantId],
      );
      const newPos: number = (Number(result[0]?.max) || 0) + 1;

      const mesa = qr.manager.create(Mesa, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        tunel_id: dto.tunel_id,
        codigo_qr: codigoQr,
        posicion_actual: newPos,
        estado: MesaEstado.ACTIVA,
        plantas_estimadas: 450,
        activo: true,
      });
      const saved = await qr.manager.save(Mesa, mesa);
      await qr.commitTransaction();
      return saved;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async listMesas(
    q: QueryMesasDto,
    tenantId: string,
  ): Promise<{ items: Mesa[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['created_at', 'posicion_actual', 'estado'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'created_at';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.mesaRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL');

    if (q.establecimiento_id !== undefined)
      qb.andWhere('m.establecimiento_id = :eid', { eid: q.establecimiento_id });
    if (q.tunel_id !== undefined)
      qb.andWhere('m.tunel_id = :tid', { tid: q.tunel_id });
    if (q.estado !== undefined)
      qb.andWhere('m.estado = :estado', { estado: q.estado });
    if (q.activo !== undefined)
      qb.andWhere('m.activo = :activo', { activo: q.activo });
    if (q.q) {
      const search = `%${q.q}%`;
      qb.andWhere('m.codigo_qr ILIKE :search', { search });
    }

    qb.orderBy(`m.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getMesaById(id: string, tenantId: string): Promise<MesaWithTunel> {
    const { entities, raw } = await this.mesaRepo
      .createQueryBuilder('m')
      .leftJoin('tuneles', 't', 't.id = m.tunel_id')
      .addSelect(['t.nombre', 't.capacidad_maxima'])
      .where('m.id = :id', { id })
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL')
      .getRawAndEntities();

    if (!entities[0]) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }

    const mesa = entities[0] as MesaWithTunel;
    const r = raw[0] as Record<string, unknown>;
    mesa.tunel = {
      nombre: (r['t_nombre'] as string) ?? '',
      capacidad_maxima: Number(r['t_capacidad_maxima']) ?? 0,
    };
    return mesa;
  }

  async getMesaByQr(codigoQr: string, tenantId: string): Promise<MesaWithTunel> {
    const { entities, raw } = await this.mesaRepo
      .createQueryBuilder('m')
      .leftJoin('tuneles', 't', 't.id = m.tunel_id')
      .addSelect(['t.nombre', 't.capacidad_maxima'])
      .where('m.codigo_qr = :codigoQr', { codigoQr })
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL')
      .getRawAndEntities();

    if (!entities[0]) {
      throw new AppError({
        code: ErrorCodes.MESA_QR_NOT_FOUND,
        message: 'Mesa no encontrada para el código QR indicado',
        status: 404,
      });
    }

    const mesa = entities[0] as MesaWithTunel;
    const r = raw[0] as Record<string, unknown>;
    mesa.tunel = {
      nombre: (r['t_nombre'] as string) ?? '',
      capacidad_maxima: Number(r['t_capacidad_maxima']) ?? 0,
    };
    return mesa;
  }

  async getMesasByTunel(
    tunel_id: string,
    q: QueryMesasDto,
    tenantId: string,
  ): Promise<{ items: Mesa[]; total: number }> {
    await this.tunelesService.mustFindById(tunel_id, { strictTenant: true });

    const { skip, limit } = clampPagination(q.page, q.limit, 200);

    const qb = this.mesaRepo
      .createQueryBuilder('m')
      .where('m.tunel_id = :tunel_id', { tunel_id })
      .andWhere('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.posicion_actual IS NOT NULL')
      .andWhere('m.deleted_at IS NULL')
      .orderBy('m.posicion_actual', 'ASC')
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async updateMesa(id: string, dto: UpdateMesaDto, tenantId: string): Promise<Mesa> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    await this.mesaRepo.update({ id, tenant_id: tenantId }, dto);
    return { ...mesa, ...dto };
  }

  async darDeBaja(id: string, auditReq: AuditReq, tenantId: string): Promise<Mesa> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    if (mesa.estado === MesaEstado.BAJA) {
      throw new AppError({
        code: ErrorCodes.MESA_ESTADO_INVALIDO,
        message: 'La mesa ya está en estado baja',
        status: 409,
      });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE mesas SET estado = 'baja', posicion_actual = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      const historial = qr.manager.create(HistorialMesa, {
        tenant_id: tenantId,
        mesa_id: id,
        tipo_evento: HistorialTipoEvento.BAJA,
        usuario_id: auditReq.userId,
        fecha_hora: new Date(),
      });
      await qr.manager.save(HistorialMesa, historial);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    await this.writeAudit(AUDIT.DAR_DE_BAJA, 'mesa', id, auditReq, tenantId, 200);
    return { ...mesa, estado: MesaEstado.BAJA, posicion_actual: null };
  }

  async reactivar(id: string, auditReq: AuditReq, tenantId: string): Promise<Mesa> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    if (mesa.estado !== MesaEstado.BAJA) {
      throw new AppError({
        code: ErrorCodes.MESA_ESTADO_INVALIDO,
        message: 'Solo se puede reactivar una mesa en estado baja',
        status: 409,
      });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE mesas SET estado = 'activa', posicion_actual = NULL, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      const historial = qr.manager.create(HistorialMesa, {
        tenant_id: tenantId,
        mesa_id: id,
        tipo_evento: HistorialTipoEvento.REACTIVACION,
        usuario_id: auditReq.userId,
        fecha_hora: new Date(),
      });
      await qr.manager.save(HistorialMesa, historial);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    await this.writeAudit(AUDIT.REACTIVADA, 'mesa', id, auditReq, tenantId, 200);
    return { ...mesa, estado: MesaEstado.ACTIVA, posicion_actual: null };
  }

  async deleteMesa(id: string, auditReq: AuditReq, tenantId: string): Promise<void> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    if (mesa.estado !== MesaEstado.BAJA) {
      throw new AppError({
        code: ErrorCodes.MESA_SOLO_BAJA_DELETE,
        message: 'Solo se puede eliminar una mesa en estado baja',
        status: 409,
      });
    }

    await this.mesaRepo.softDelete({ id, tenant_id: tenantId });
    await this.writeAudit(AUDIT.DELETED, 'mesa', id, auditReq, tenantId, 200);
  }

  async updateMesaTunel(
    id: string,
    tunel_id: string,
    posicion_actual: number,
    fecha_ultimo_trasplante: Date,
    tenantId: string,
  ): Promise<void> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    await this.mesaRepo.update(
      { id, tenant_id: tenantId },
      { tunel_id, posicion_actual, fecha_ultimo_trasplante },
    );
  }

  async updateMesaEstado(
    id: string,
    estado: MesaEstado,
    posicion_actual: number | null,
    tenantId: string,
  ): Promise<void> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    await this.mesaRepo.update({ id, tenant_id: tenantId }, { estado, posicion_actual });
  }

  async getHistorial(
    id: string,
    q: QueryHistorialDto,
    tenantId: string,
  ): Promise<{ items: HistorialMesa[]; total: number }> {
    const mesa = await this.mesaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!mesa) {
      throw new AppError({
        code: ErrorCodes.MESA_NOT_FOUND,
        message: 'Mesa no encontrada',
        status: 404,
      });
    }
    return this.historialService.listByMesa(id, q, tenantId);
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
      extra: { mesaId: entityId },
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
