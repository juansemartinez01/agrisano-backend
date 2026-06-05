import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Tunel } from './entities/tunel.entity';
import { CreateTunelDto } from './dto/create-tunel.dto';
import { UpdateTunelDto } from './dto/update-tunel.dto';
import { QueryTunelesDto } from './dto/query-tuneles.dto';

export const AUDIT = {
  CREATED: 'tunel_created',
  UPDATED: 'tunel_updated',
  DELETED: 'tunel_deleted',
} as const;

@Injectable()
export class TunelesService extends BaseCrudTenantService<Tunel> {
  constructor(
    @InjectRepository(Tunel)
    private readonly tunelRepo: Repository<Tunel>,
    private readonly estService: EstablecimientosService,
  ) {
    super(tunelRepo);
  }

  async listTuneles(
    q: QueryTunelesDto,
  ): Promise<{ items: Tunel[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.establecimiento_id !== undefined)
      filters['establecimiento_id'] = q.establecimiento_id;
    if (q.activo !== undefined) filters['activo'] = q.activo; // NO default (FR-010)

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

  async createTunel(dto: CreateTunelDto): Promise<Tunel> {
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.tunelRepo.findOne({
      where: {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        nombre: dto.nombre,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.TUNEL_NOMBRE_DUPLICADO,
        message: `Ya existe un tunel con nombre '${dto.nombre}' en este establecimiento`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateTunel(id: string, dto: UpdateTunelDto): Promise<Tunel> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.tunelRepo
        .createQueryBuilder('t')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.establecimiento_id = :estId', {
          estId: current.establecimiento_id,
        })
        .andWhere('t.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('t.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.TUNEL_NOMBRE_DUPLICADO,
          message: `Ya existe un tunel con nombre '${dto.nombre}' en este establecimiento`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteTunel(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });
    await this.softDelete(id, { strictTenant: true });
  }
}
