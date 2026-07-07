import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { QuimicosService } from 'src/modules/quimicos/quimicos.service';
import { Quimico } from 'src/modules/quimicos/entities/quimico.entity';
import { ProveedoresService } from 'src/modules/proveedores/proveedores.service';
import { LoteQuimico } from './entities/lote-quimico.entity';
import { CreateLoteQuimicoDto } from './dto/create-lote-quimico.dto';
import { UpdateLoteQuimicoDto } from './dto/update-lote-quimico.dto';
import { AjusteLoteQuimicoDto } from './dto/ajuste-lote-quimico.dto';
import { QueryLotesQuimicosDto } from './dto/query-lotes-quimicos.dto';

export const AUDIT = {
  CREATED: 'lote_quimico_created',
  UPDATED: 'lote_quimico_updated',
  AJUSTADO: 'lote_quimico_ajustado',
  DELETED: 'lote_quimico_deleted',
} as const;

@Injectable()
export class LotesQuimicosService extends BaseCrudTenantService<LoteQuimico> {
  constructor(
    @InjectRepository(LoteQuimico)
    private readonly loteRepo: Repository<LoteQuimico>,
    private readonly quimicosService: QuimicosService,
    private readonly proveedoresService: ProveedoresService,
  ) {
    super(loteRepo);
  }

  private async validateProveedor(
    proveedorId: string,
    establecimientoId: string,
  ): Promise<void> {
    const proveedor = await this.proveedoresService.mustFindById(proveedorId, {
      strictTenant: true,
    });
    if (proveedor.establecimiento_id !== establecimientoId) {
      throw new AppError({
        code: ErrorCodes.PROVEEDOR_ESTABLECIMIENTO_MISMATCH,
        message: 'El proveedor no pertenece al establecimiento del lote',
        status: 422,
      });
    }
  }

  async listLotes(
    q: QueryLotesQuimicosDto,
  ): Promise<{ items: LoteQuimico[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.quimico_id !== undefined) filters['quimico_id'] = q.quimico_id;
    if (q.establecimiento_id !== undefined)
      filters['establecimiento_id'] = q.establecimiento_id;

    return this.list(
      { ...q, filters },
      {
        searchColumns: ['numero_lote'],
        filterAllowed: ['quimico_id', 'establecimiento_id'],
        sortAllowed: ['numero_lote', 'fecha_vencimiento', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
        customizeQb:
          q.con_stock === true
            ? (qb, alias) => {
                qb.andWhere(`${alias}.cantidad_actual > 0`);
              }
            : undefined,
      },
    );
  }

  async mustFindByIdWithQuimico(
    id: string,
  ): Promise<{ lote: LoteQuimico; quimico: Quimico }> {
    const lote = await this.mustFindById(id, { strictTenant: true });
    const quimico = await this.quimicosService.mustFindById(lote.quimico_id, {
      strictTenant: true,
    });
    return { lote, quimico };
  }

  async createLote(dto: CreateLoteQuimicoDto): Promise<LoteQuimico> {
    const quimico = await this.quimicosService.mustFindById(dto.quimico_id, {
      strictTenant: true,
    });

    await this.validateProveedor(dto.proveedor_id, quimico.establecimiento_id);

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.loteRepo.findOne({
      where: {
        tenant_id: tenantId,
        quimico_id: dto.quimico_id,
        numero_lote: dto.numero_lote,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_NUMERO_DUPLICADO,
        message: `Ya existe un lote con numero_lote '${dto.numero_lote}' para este químico`,
        status: 409,
      });
    }

    return this.create(
      {
        quimico_id: dto.quimico_id,
        establecimiento_id: quimico.establecimiento_id,
        proveedor_id: dto.proveedor_id,
        numero_lote: dto.numero_lote,
        cantidad_inicial: dto.cantidad_inicial,
        cantidad_actual: dto.cantidad_inicial,
        dom: dto.dom ?? null,
        fecha_vencimiento: dto.fecha_vencimiento ?? null,
      },
      { strictTenant: true },
    );
  }

  async updateLote(id: string, dto: UpdateLoteQuimicoDto): Promise<LoteQuimico> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.proveedor_id !== undefined) {
      await this.validateProveedor(dto.proveedor_id, current.establecimiento_id);
    }

    if (dto.numero_lote !== undefined && dto.numero_lote !== current.numero_lote) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.loteRepo
        .createQueryBuilder('l')
        .where('l.tenant_id = :tenantId', { tenantId })
        .andWhere('l.quimico_id = :quimicoId', { quimicoId: current.quimico_id })
        .andWhere('l.numero_lote = :numeroLote', { numeroLote: dto.numero_lote })
        .andWhere('l.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.LOTE_QUIMICO_NUMERO_DUPLICADO,
          message: `Ya existe un lote con numero_lote '${dto.numero_lote}' para este químico`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async ajustarLote(
    id: string,
    dto: AjusteLoteQuimicoDto,
  ): Promise<LoteQuimico> {
    const tenantId = this.getTenantId({ strictTenant: true }) as string;
    await this.mustFindById(id, { strictTenant: true });

    const result = await this.loteRepo
      .createQueryBuilder()
      .update(LoteQuimico)
      .set({ cantidad_actual: () => 'cantidad_actual - :cantidad' })
      .where('id = :id', { id })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere('cantidad_actual >= :cantidad', { cantidad: dto.cantidad })
      .setParameter('cantidad', dto.cantidad)
      .execute();

    if (!result.affected) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_STOCK_INSUFICIENTE,
        message: 'La cantidad a ajustar supera el stock disponible en el lote',
        status: 422,
      });
    }

    return this.mustFindById(id, { strictTenant: true });
  }

  async deleteLote(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    const result = (await this.loteRepo.manager.query(
      `SELECT COUNT(*)::int AS cnt FROM aplicaciones_quimicas_detalle WHERE lote_quimico_id = $1`,
      [id],
    )) as [{ cnt: number }];

    if (result[0]?.cnt > 0) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_REFERENCED,
        message:
          'El lote está referenciado por una o más aplicaciones y no puede ser eliminado',
        status: 409,
      });
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
