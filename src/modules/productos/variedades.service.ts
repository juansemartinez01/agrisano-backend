import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ProductosService } from './productos.service';
import { Variedad } from './entities/variedad.entity';
import { CreateVariedadDto } from './dto/create-variedad.dto';
import { UpdateVariedadDto } from './dto/update-variedad.dto';
import { QueryVariedadesDto } from './dto/query-variedades.dto';

export const AUDIT = {
  CREATED: 'variedad_created',
  UPDATED: 'variedad_updated',
  DELETED: 'variedad_deleted',
} as const;

@Injectable()
export class VariedadesService extends BaseCrudTenantService<Variedad> {
  constructor(
    @InjectRepository(Variedad)
    private readonly variedadRepo: Repository<Variedad>,
    private readonly productosService: ProductosService,
  ) {
    super(variedadRepo);
  }

  async listVariedades(
    q: QueryVariedadesDto,
  ): Promise<{ items: Variedad[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.producto_id !== undefined) filters['producto_id'] = q.producto_id;
    if (q.activo !== undefined) filters['activo'] = q.activo;

    return this.list(
      { ...q, filters },
      {
        searchColumns: ['nombre'],
        filterAllowed: ['producto_id', 'activo'],
        sortAllowed: ['nombre', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
      },
    );
  }

  async createVariedad(dto: CreateVariedadDto): Promise<Variedad> {
    await this.productosService.mustFindById(dto.producto_id, {
      strictTenant: true,
    });

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.variedadRepo.findOne({
      where: {
        tenant_id: tenantId,
        producto_id: dto.producto_id,
        nombre: dto.nombre,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.VARIEDAD_NOMBRE_DUPLICADO,
        message: `Ya existe una variedad con nombre '${dto.nombre}' para este producto`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateVariedad(id: string, dto: UpdateVariedadDto): Promise<Variedad> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.variedadRepo
        .createQueryBuilder('v')
        .where('v.tenant_id = :tenantId', { tenantId })
        .andWhere('v.producto_id = :productoId', { productoId: current.producto_id })
        .andWhere('v.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('v.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.VARIEDAD_NOMBRE_DUPLICADO,
          message: `Ya existe una variedad con nombre '${dto.nombre}' para este producto`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteVariedad(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    const [lotes, cosechas] = await Promise.all([
      this.variedadRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM lotes WHERE variedad_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
      this.variedadRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM cosechas WHERE variedad_id = $1`,
        [id],
      ) as Promise<[{ cnt: number }]>,
    ]);

    if ((lotes[0]?.cnt ?? 0) > 0 || (cosechas[0]?.cnt ?? 0) > 0) {
      throw new AppError({
        code: ErrorCodes.VARIEDAD_REFERENCED,
        message:
          'La variedad está referenciada por lotes o cosechas y no puede ser eliminada',
        status: 409,
      });
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
