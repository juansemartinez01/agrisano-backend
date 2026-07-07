import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Proveedor } from './entities/proveedor.entity';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { QueryProveedoresDto } from './dto/query-proveedores.dto';

export const AUDIT = {
  CREATED: 'proveedor_created',
  UPDATED: 'proveedor_updated',
  DELETED: 'proveedor_deleted',
} as const;

@Injectable()
export class ProveedoresService extends BaseCrudTenantService<Proveedor> {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedorRepo: Repository<Proveedor>,
    private readonly estService: EstablecimientosService,
  ) {
    super(proveedorRepo);
  }

  async listProveedores(
    q: QueryProveedoresDto,
  ): Promise<{ items: Proveedor[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.establecimiento_id !== undefined)
      filters['establecimiento_id'] = q.establecimiento_id;
    if (q.activo !== undefined) filters['activo'] = q.activo;

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

  async createProveedor(dto: CreateProveedorDto): Promise<Proveedor> {
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.proveedorRepo.findOne({
      where: {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        nombre: dto.nombre,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.PROVEEDOR_NOMBRE_DUPLICADO,
        message: `Ya existe un proveedor con nombre '${dto.nombre}' en este establecimiento`,
        status: 409,
      });
    }

    return this.create(dto, { strictTenant: true });
  }

  async updateProveedor(id: string, dto: UpdateProveedorDto): Promise<Proveedor> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.proveedorRepo
        .createQueryBuilder('p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('p.establecimiento_id = :estId', {
          estId: current.establecimiento_id,
        })
        .andWhere('p.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('p.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.PROVEEDOR_NOMBRE_DUPLICADO,
          message: `Ya existe un proveedor con nombre '${dto.nombre}' en este establecimiento`,
          status: 409,
        });
      }
    }

    return this.update(id, dto, { strictTenant: true });
  }

  async deleteProveedor(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });

    const [lotesCount, quimicosCount] = await Promise.all([
      this.proveedorRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM lotes WHERE proveedor_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
      this.proveedorRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM quimicos WHERE proveedor_id = $1 AND deleted_at IS NULL`,
        [id],
      ) as Promise<[{ cnt: number }]>,
    ]);

    if ((lotesCount[0]?.cnt ?? 0) > 0 || (quimicosCount[0]?.cnt ?? 0) > 0) {
      throw new AppError({
        code: ErrorCodes.PROVEEDOR_REFERENCED,
        message:
          'El proveedor está referenciado por uno o más lotes/quimicos y no puede ser eliminado',
        status: 409,
      });
    }

    await this.softDelete(id, { strictTenant: true });
  }
}
