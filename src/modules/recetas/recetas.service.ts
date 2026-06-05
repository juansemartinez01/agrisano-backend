import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Receta } from './entities/receta.entity';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { UpdateRecetaDto } from './dto/update-receta.dto';
import { QueryRecetasDto } from './dto/query-recetas.dto';

export const AUDIT = {
  CREATED: 'receta_created',
  UPDATED: 'receta_updated',
  DELETED: 'receta_deleted',
} as const;

@Injectable()
export class RecetasService extends BaseCrudTenantService<Receta> {
  constructor(
    @InjectRepository(Receta)
    private readonly recetaRepo: Repository<Receta>,
    private readonly estService: EstablecimientosService,
  ) {
    super(recetaRepo);
  }

  async listRecetas(
    q: QueryRecetasDto,
  ): Promise<{ items: Receta[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.establecimiento_id !== undefined)
      filters['establecimiento_id'] = q.establecimiento_id;
    if (q.activo !== undefined) filters['activo'] = q.activo; // NO default (FR-007)

    return this.list(
      { ...q, filters },
      {
        searchColumns: ['nombre'],
        filterAllowed: ['establecimiento_id', 'activo'],
        sortAllowed: ['nombre', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
      },
    );
  }

  async createReceta(dto: CreateRecetaDto): Promise<Receta> {
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.recetaRepo.findOne({
      where: {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        nombre: dto.nombre,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.RECETA_NOMBRE_DUPLICADO,
        message: `Ya existe una receta con nombre '${dto.nombre}' en este establecimiento`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateReceta(id: string, dto: UpdateRecetaDto): Promise<Receta> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.recetaRepo
        .createQueryBuilder('r')
        .where('r.tenant_id = :tenantId', { tenantId })
        .andWhere('r.establecimiento_id = :estId', {
          estId: current.establecimiento_id,
        })
        .andWhere('r.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('r.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.RECETA_NOMBRE_DUPLICADO,
          message: `Ya existe una receta con nombre '${dto.nombre}' en este establecimiento`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteReceta(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });
    await this.softDelete(id, { strictTenant: true });
  }
}
