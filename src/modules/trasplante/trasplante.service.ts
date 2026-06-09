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
import { BandejaService } from 'src/modules/siembra/bandeja.service';
import { BandejaEstado } from 'src/modules/siembra/entities/bandeja.entity';
import { TunelesService } from 'src/modules/tuneles/tuneles.service';
import { clampPagination } from 'src/common/query/query-utils';
import { MesaBandeja } from './entities/mesa-bandeja.entity';
import { CreateTrasplanteDto } from './dto/create-trasplante.dto';
import { QueryTrasplantesDto } from './dto/query-trasplantes.dto';

export const AUDIT = {
  TRASPLANTE: 'trasplante_ejecutado',
} as const;

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

export interface ExecuteTrasplanteResult {
  mesa_id: string;
  tunel_id: string;
  posicion_actual: number;
  bandejas_trasplantadas: string[];
}

@Injectable()
export class TrasplanteService {
  constructor(
    @InjectRepository(MesaBandeja)
    private readonly mesaBandejaRepo: Repository<MesaBandeja>,
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly mesasService: MesasService,
    private readonly bandejaService: BandejaService,
    private readonly tunelesService: TunelesService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  async executeTrasplante(
    dto: CreateTrasplanteDto,
    userId: string,
    auditReq: AuditReq,
  ): Promise<ExecuteTrasplanteResult> {
    const tenantId = this.tenancy.requireTenantId();

    // 1. Load and validate mesa
    const mesa = await this.mesasService.getMesaById(dto.mesa_id, tenantId);

    // 2. Validate mesa state: en_cosecha OR (activa AND posicion_actual IS NULL)
    const transplantable =
      mesa.estado === MesaEstado.EN_COSECHA ||
      (mesa.estado === MesaEstado.ACTIVA && mesa.posicion_actual === null);
    if (!transplantable) {
      throw new AppError({
        code: ErrorCodes.TRASPLANTE_MESA_ESTADO_INVALIDO,
        message: 'La mesa no está en un estado válido para trasplante (debe ser en_cosecha o activa sin posición)',
        status: 422,
      });
    }

    // 3. Load and validate tunnel
    const tunel = await this.tunelesService.mustFindById(dto.tunel_id, { strictTenant: true });

    // 4. Validate same establecimiento
    if (tunel.establecimiento_id !== mesa.establecimiento_id) {
      throw new AppError({
        code: ErrorCodes.TRASPLANTE_ESTABLECIMIENTO_MISMATCH,
        message: 'El tunel no pertenece al mismo establecimiento que la mesa',
        status: 422,
      });
    }

    // 5. Validate each bandeja (pre-transaction)
    for (const bandeja_id of dto.bandeja_ids) {
      const bandeja = await this.bandejaService.getBandeja(bandeja_id);
      if (
        bandeja.estado !== BandejaEstado.EN_NURSERY ||
        bandeja.establecimiento_id !== mesa.establecimiento_id
      ) {
        throw new AppError({
          code: ErrorCodes.TRASPLANTE_BANDEJA_INVALIDA,
          message: `La bandeja ${bandeja_id} no está disponible para trasplante (debe ser en_nursery del mismo establecimiento)`,
          status: 422,
        });
      }
    }

    // ── TRANSACTION ──────────────────────────────────────────────────────
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let newPos: number;
    try {
      // 6. Calculate new FIFO position
      const result = (await qr.query(
        `SELECT MAX(posicion_actual) AS max FROM mesas WHERE tunel_id = $1 AND deleted_at IS NULL AND posicion_actual IS NOT NULL`,
        [dto.tunel_id],
      )) as Array<{ max: string | null }>;
      newPos = (Number(result[0]?.max) || 0) + 1;

      // 7. Update each bandeja + insert MesaBandeja
      const now = new Date();
      for (const bandeja_id of dto.bandeja_ids) {
        await qr.query(
          `UPDATE bandejas SET estado = 'trasplantada', mesa_id = $1, fecha_trasplante = now(), updated_at = now() WHERE id = $2`,
          [dto.mesa_id, bandeja_id],
        );
        await qr.manager.save(MesaBandeja, {
          mesa_id: dto.mesa_id,
          bandeja_id,
          fecha_trasplante: now,
        });
      }

      // 8. Update mesa
      await qr.query(
        `UPDATE mesas SET estado = 'activa', posicion_actual = $1, tunel_id = $2, fecha_ultimo_trasplante = now(), updated_at = now() WHERE id = $3`,
        [newPos, dto.tunel_id, dto.mesa_id],
      );

      // 9. Write HistorialMesa
      await qr.manager.save(HistorialMesa, {
        mesa_id: dto.mesa_id,
        tipo_evento: HistorialTipoEvento.TRASPLANTE,
        tenant_id: tenantId,
        usuario_id: userId,
        fecha_hora: new Date(),
        detalle: {
          tunel_id: dto.tunel_id,
          posicion_actual: newPos,
          bandeja_ids: dto.bandeja_ids,
          observaciones: dto.observaciones ?? null,
        },
      });

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // 10. Audit (post-transaction)
    await this.writeAudit(AUDIT.TRASPLANTE, 'trasplante', dto.mesa_id, auditReq, tenantId, 200);

    return {
      mesa_id: dto.mesa_id,
      tunel_id: dto.tunel_id,
      posicion_actual: newPos,
      bandejas_trasplantadas: dto.bandeja_ids,
    };
  }

  async listTrasplantesByMesa(
    mesa_id: string,
    q: QueryTrasplantesDto,
    tenantId: string,
  ): Promise<{ items: MesaBandeja[]; total: number }> {
    // Validate mesa exists and belongs to tenant (throws 404 if not)
    await this.mesasService.getMesaById(mesa_id, tenantId);

    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.mesaBandejaRepo
      .createQueryBuilder('mb')
      .where('mb.mesa_id = :mesa_id', { mesa_id })
      .orderBy('mb.fecha_trasplante', sortOrder)
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
