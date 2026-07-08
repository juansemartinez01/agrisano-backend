import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { Marca } from './entities/marca.entity';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { QueryMarcasDto } from './dto/query-marcas.dto';

export const AUDIT = {
  CREATED: 'marca_created',
  UPDATED: 'marca_updated',
  DELETED: 'marca_deleted',
} as const;

@Injectable()
export class MarcasService extends BaseCrudTenantService<Marca> {
  constructor(
    @InjectRepository(Marca)
    private readonly marcaRepo: Repository<Marca>,
  ) {
    super(marcaRepo);
  }

  async listMarcas(
    q: QueryMarcasDto,
  ): Promise<{ items: Marca[]; total: number }> {
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

  async createMarca(dto: CreateMarcaDto): Promise<Marca> {
    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.marcaRepo.findOne({
      where: { tenant_id: tenantId, nombre: dto.nombre },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.MARCA_NOMBRE_DUPLICADO,
        message: `Ya existe una marca con nombre '${dto.nombre}'`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateMarca(id: string, dto: UpdateMarcaDto): Promise<Marca> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.marcaRepo
        .createQueryBuilder('m')
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('m.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.MARCA_NOMBRE_DUPLICADO,
          message: `Ya existe una marca con nombre '${dto.nombre}'`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteMarca(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    const [quimicos, lotes] = await Promise.all([
      this.marcaRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM quimicos WHERE marca_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
      this.marcaRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM lotes WHERE marca_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
    ]);

    if ((quimicos[0]?.cnt ?? 0) > 0 || (lotes[0]?.cnt ?? 0) > 0) {
      throw new AppError({
        code: ErrorCodes.MARCA_REFERENCED,
        message:
          'La marca está referenciada por químicos o lotes y no puede ser eliminada',
        status: 409,
      });
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
