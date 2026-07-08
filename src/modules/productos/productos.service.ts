import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { Producto } from './entities/producto.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { QueryProductosDto } from './dto/query-productos.dto';

export const AUDIT = {
  CREATED: 'producto_created',
  UPDATED: 'producto_updated',
  DELETED: 'producto_deleted',
} as const;

@Injectable()
export class ProductosService extends BaseCrudTenantService<Producto> {
  constructor(
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
  ) {
    super(productoRepo);
  }

  async listProductos(
    q: QueryProductosDto,
  ): Promise<{ items: Producto[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.activo !== undefined) filters['activo'] = q.activo;

    return this.list(
      { ...q, filters },
      {
        searchColumns: ['nombre'],
        filterAllowed: ['activo'],
        sortAllowed: ['nombre', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
      },
    );
  }

  async createProducto(dto: CreateProductoDto): Promise<Producto> {
    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.productoRepo.findOne({
      where: { tenant_id: tenantId, nombre: dto.nombre },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.PRODUCTO_NOMBRE_DUPLICADO,
        message: `Ya existe un producto con nombre '${dto.nombre}'`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateProducto(id: string, dto: UpdateProductoDto): Promise<Producto> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.productoRepo
        .createQueryBuilder('p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('p.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.PRODUCTO_NOMBRE_DUPLICADO,
          message: `Ya existe un producto con nombre '${dto.nombre}'`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteProducto(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    const [variedades, lotes, cosechas] = await Promise.all([
      this.productoRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM variedades WHERE producto_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
      this.productoRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM lotes WHERE producto_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
      this.productoRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM cosechas WHERE producto_id = $1`,
        [id],
      ) as Promise<[{ cnt: number }]>,
    ]);

    if (
      (variedades[0]?.cnt ?? 0) > 0 ||
      (lotes[0]?.cnt ?? 0) > 0 ||
      (cosechas[0]?.cnt ?? 0) > 0
    ) {
      throw new AppError({
        code: ErrorCodes.PRODUCTO_REFERENCED,
        message:
          'El producto está referenciado por variedades, lotes o cosechas y no puede ser eliminado',
        status: 409,
      });
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
