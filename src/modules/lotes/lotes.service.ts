import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ProveedoresService } from 'src/modules/proveedores/proveedores.service';
import { ProductosService } from 'src/modules/productos/productos.service';
import { VariedadesService } from 'src/modules/productos/variedades.service';
import { Lote, LoteTipo } from './entities/lote.entity';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';
import { QueryLotesDto } from './dto/query-lotes.dto';

export const AUDIT = {
  CREATED: 'lote_created',
  UPDATED: 'lote_updated',
  DELETED: 'lote_deleted',
} as const;

@Injectable()
export class LotesService extends BaseCrudTenantService<Lote> {
  constructor(
    @InjectRepository(Lote)
    private readonly loteRepo: Repository<Lote>,
    private readonly proveedoresService: ProveedoresService,
    private readonly productosService: ProductosService,
    private readonly variedadesService: VariedadesService,
  ) {
    super(loteRepo);
  }

  private async validateProductoVariedad(
    productoId: string,
    variedadId: string,
  ): Promise<void> {
    await this.productosService.mustFindById(productoId, { strictTenant: true });
    const variedad = await this.variedadesService.mustFindById(variedadId, {
      strictTenant: true,
    });
    if (variedad.producto_id !== productoId) {
      throw new AppError({
        code: ErrorCodes.VARIEDAD_PRODUCTO_MISMATCH,
        message: 'La variedad no pertenece al producto indicado',
        status: 422,
      });
    }
  }

  async listLotes(
    q: QueryLotesDto,
  ): Promise<{ items: Lote[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.tipo !== undefined) filters['tipo'] = q.tipo;
    if (q.activo !== undefined) filters['activo'] = q.activo;

    return this.list(
      { ...q, filters },
      {
        filterAllowed: ['tipo', 'activo'],
        sortAllowed: ['numero_lote', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
        customizeQb: q.q
          ? (qb, alias) => {
              qb.andWhere(`${alias}.numero_lote ILIKE :search`, {
                search: `%${q.q}%`,
              });
            }
          : undefined,
      },
    );
  }

  async createLote(dto: CreateLoteDto): Promise<Lote> {
    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    await this.proveedoresService.mustFindById(dto.proveedor_id, {
      strictTenant: true,
    });

    if (
      dto.tipo === LoteTipo.SUSTRATO &&
      (dto.proveedor_semilla_id || dto.producto_id || dto.variedad_id)
    ) {
      if (dto.proveedor_semilla_id) {
        throw new AppError({
          code: ErrorCodes.LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO,
          message: 'proveedor_semilla_id solo aplica a lotes de tipo semilla',
          status: 422,
        });
      }
      throw new AppError({
        code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
        message: 'producto_id/variedad_id solo aplica a lotes de tipo semilla',
        status: 422,
      });
    }
    if (dto.tipo === LoteTipo.SEMILLA) {
      await this.proveedoresService.mustFindById(dto.proveedor_semilla_id!, {
        strictTenant: true,
      });
      await this.validateProductoVariedad(dto.producto_id!, dto.variedad_id!);
    }

    const conflict = await this.loteRepo.findOne({
      where: {
        tenant_id: tenantId,
        tipo: dto.tipo,
        numero_lote: dto.numero_lote,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.LOTE_NUMERO_DUPLICADO,
        message: `Ya existe un lote con numero_lote '${dto.numero_lote}' para tipo '${dto.tipo}'`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateLote(id: string, dto: UpdateLoteDto): Promise<Lote> {
    if (dto.proveedor_id !== undefined) {
      await this.proveedoresService.mustFindById(dto.proveedor_id, {
        strictTenant: true,
      });
    }

    if (
      dto.proveedor_semilla_id !== undefined ||
      dto.producto_id !== undefined ||
      dto.variedad_id !== undefined ||
      dto.numero_lote
    ) {
      const current = await this.mustFindById(id, { strictTenant: true });

      if (dto.proveedor_semilla_id !== undefined) {
        if (current.tipo === LoteTipo.SUSTRATO) {
          throw new AppError({
            code: ErrorCodes.LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO,
            message: 'proveedor_semilla_id solo aplica a lotes de tipo semilla',
            status: 422,
          });
        }
        await this.proveedoresService.mustFindById(dto.proveedor_semilla_id, {
          strictTenant: true,
        });
      }

      if (dto.producto_id !== undefined || dto.variedad_id !== undefined) {
        if (current.tipo === LoteTipo.SUSTRATO) {
          throw new AppError({
            code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
            message: 'producto_id/variedad_id solo aplica a lotes de tipo semilla',
            status: 422,
          });
        }
        const productoId = dto.producto_id ?? current.producto_id!;
        const variedadId = dto.variedad_id ?? current.variedad_id!;
        await this.validateProductoVariedad(productoId, variedadId);
      }

      if (dto.numero_lote) {
        const tenantId = this.getTenantId({ strictTenant: true }) as string;

        const conflict = await this.loteRepo
          .createQueryBuilder('l')
          .where('l.tenant_id = :tenantId', { tenantId })
          .andWhere('l.tipo = :tipo', { tipo: current.tipo as LoteTipo })
          .andWhere('l.numero_lote = :numero_lote', {
            numero_lote: dto.numero_lote,
          })
          .andWhere('l.id != :id', { id })
          .getOne();

        if (conflict) {
          throw new AppError({
            code: ErrorCodes.LOTE_NUMERO_DUPLICADO,
            message: `Ya existe un lote con numero_lote '${dto.numero_lote}' para ese tipo`,
            status: 409,
          });
        }
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteLote(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    try {
      const result = (await this.loteRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM bandejas WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1`,
        [id],
      )) as [{ cnt: number }];

      if (result[0]?.cnt > 0) {
        throw new AppError({
          code: ErrorCodes.LOTE_REFERENCED_BY_BANDEJA,
          message:
            'El lote está referenciado por una o más bandejas y no puede ser eliminado',
          status: 409,
        });
      }
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      // bandejas table does not yet exist (M04 not deployed) — skip gracefully
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
