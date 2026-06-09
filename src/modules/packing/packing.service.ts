import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { CosechaService } from 'src/modules/cosecha/cosecha.service';
import { clampPagination } from 'src/common/query/query-utils';
import { LotePacking } from './entities/lote-packing.entity';
import { LotePackingCategoria } from './entities/lote-packing-categoria.entity';
import { CreatePackingDto } from './dto/create-packing.dto';
import { QueryPackingDto } from './dto/query-packing.dto';

export const AUDIT = {
  PACKING: 'packing_registrado',
} as const;

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

export interface RegistrarPackingResult {
  lote_packing: LotePacking;
  categorias: LotePackingCategoria[];
}

@Injectable()
export class PackingService {
  constructor(
    @InjectRepository(LotePacking)
    private readonly lotePackingRepo: Repository<LotePacking>,
    @InjectRepository(LotePackingCategoria)
    private readonly categoriaRepo: Repository<LotePackingCategoria>,
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly cosechaService: CosechaService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  async registrarPacking(
    dto: CreatePackingDto,
    userId: string,
    auditReq: AuditReq,
  ): Promise<RegistrarPackingResult> {
    // PRE-TRANSACTION validations (all before QueryRunner opens)
    const tenantId = this.tenancy.requireTenantId();

    // 1. Validate cosecha exists and belongs to tenant
    await this.cosechaService.getCosechaById(dto.cosecha_id, tenantId);

    // 2. Duplicate-category check
    const cats = dto.categorias.map((c) => c.categoria);
    if (new Set(cats).size !== cats.length) {
      throw new AppError({
        code: ErrorCodes.PACKING_CATEGORIA_DUPLICADA,
        message: 'No se permiten categorías duplicadas en el mismo lote de packing',
        status: 422,
      });
    }

    // 3. Uniqueness pre-check
    const existing = await this.lotePackingRepo.findOne({
      where: { cosecha_id: dto.cosecha_id },
    });
    if (existing) {
      throw new AppError({
        code: ErrorCodes.PACKING_YA_REGISTRADO,
        message: 'Ya existe un registro de packing para esta cosecha',
        status: 409,
      });
    }

    // TRANSACTION
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let saved: LotePacking;
    let savedCategorias: LotePackingCategoria[];
    try {
      // 1. INSERT lote_packing
      saved = await qr.manager.save(LotePacking, {
        tenant_id: tenantId,
        cosecha_id: dto.cosecha_id,
        fecha_hora: new Date(),
        peso_bruto_kg: dto.peso_bruto_kg,
        usuario_id: userId,
        observaciones: dto.observaciones ?? null,
      });

      // 2. INSERT all categorias
      savedCategorias = await qr.manager.save(
        LotePackingCategoria,
        dto.categorias.map((c) => ({
          lote_packing_id: saved.id,
          categoria: c.categoria,
          peso_kg: c.peso_kg,
          cantidad_cajas: c.cantidad_cajas,
          peso_neto_por_caja: c.peso_neto_por_caja,
        })),
      );

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // POST-TRANSACTION: audit
    await this.writeAudit(AUDIT.PACKING, 'lote_packing', saved.id, auditReq, tenantId, 201);

    return { lote_packing: saved, categorias: savedCategorias };
  }

  async getPackingById(
    id: string,
    tenantId: string,
  ): Promise<RegistrarPackingResult> {
    const lp = await this.lotePackingRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!lp) {
      throw new AppError({
        code: ErrorCodes.PACKING_NOT_FOUND,
        message: 'Registro de packing no encontrado',
        status: 404,
      });
    }
    const categorias = await this.categoriaRepo.find({
      where: { lote_packing_id: id },
    });
    return { lote_packing: lp, categorias };
  }

  async getPackingByCosecha(
    cosecha_id: string,
    tenantId: string,
  ): Promise<RegistrarPackingResult> {
    await this.cosechaService.getCosechaById(cosecha_id, tenantId);

    const lp = await this.lotePackingRepo.findOne({
      where: { cosecha_id, tenant_id: tenantId },
    });
    if (!lp) {
      throw new AppError({
        code: ErrorCodes.PACKING_NOT_FOUND,
        message: 'No se encontró registro de packing para esta cosecha',
        status: 404,
      });
    }
    const categorias = await this.categoriaRepo.find({
      where: { lote_packing_id: lp.id },
    });
    return { lote_packing: lp, categorias };
  }

  async listPacking(
    q: QueryPackingDto,
    tenantId: string,
  ): Promise<{ items: LotePacking[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);

    const qb = this.lotePackingRepo
      .createQueryBuilder('lp')
      .where('lp.tenant_id = :tenantId', { tenantId });

    if (q.cosecha_id) {
      qb.andWhere('lp.cosecha_id = :cosecha_id', { cosecha_id: q.cosecha_id });
    }

    qb.orderBy('lp.fecha_hora', q.sortOrder ?? 'DESC').skip(skip).take(limit);

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
      extra: { packingId: entityId },
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
