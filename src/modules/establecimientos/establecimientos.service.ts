import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { UsersService } from 'src/modules/users/users.service';
import { Establecimiento } from './entities/establecimiento.entity';
import { UsuarioEstablecimiento } from './entities/usuario-establecimiento.entity';
import { CreateEstablecimientoDto } from './dto/create-establecimiento.dto';
import { UpdateEstablecimientoDto } from './dto/update-establecimiento.dto';
import { QueryEstablecimientosDto } from './dto/query-establecimientos.dto';

export const AUDIT = {
  CREATED: 'establecimiento_created',
  UPDATED: 'establecimiento_updated',
  DEACTIVATED: 'establecimiento_deactivated',
  DELETED: 'establecimiento_deleted',
  USER_ASSIGNED: 'usuario_asignado',
  USER_REMOVED: 'usuario_removido',
} as const;

type Actor = { userId: string; roles: string[] };

@Injectable()
export class EstablecimientosService extends BaseCrudTenantService<Establecimiento> {
  constructor(
    @InjectRepository(Establecimiento)
    private readonly estRepo: Repository<Establecimiento>,

    @InjectRepository(UsuarioEstablecimiento)
    private readonly ueRepo: Repository<UsuarioEstablecimiento>,

    private readonly usersService: UsersService,
  ) {
    super(estRepo);
  }

  async listForUser(
    q: QueryEstablecimientosDto,
    actor: Actor,
  ): Promise<{ items: Establecimiento[]; total: number }> {
    const baseOpts = {
      searchColumns: ['nombre'],
      filterAllowed: ['activo'],
      sortAllowed: ['nombre', 'created_at'],
      strictTenant: true,
    };

    if (actor.roles.includes('admin_global')) {
      const filters: Record<string, unknown> = {};
      if (q.activo !== undefined) filters['activo'] = q.activo;
      return this.list({ ...q, filters }, baseOpts);
    }

    const filters: Record<string, unknown> = {};
    if (q.activo !== undefined) filters['activo'] = q.activo;
    return this.list(
      { ...q, filters },
      {
        ...baseOpts,
        customizeQb: (qb, alias) => {
          qb.innerJoin(
            'usuario_establecimiento',
            'ue',
            `ue.establecimiento_id = ${alias}.id AND ue.user_id = :userId`,
            { userId: actor.userId },
          );
        },
      },
    );
  }

  async findOneForUser(id: string, actor: Actor): Promise<Establecimiento> {
    if (actor.roles.includes('admin_global')) {
      return this.mustFindById(id, { strictTenant: true });
    }

    const tenantId = this.getTenantId({ strictTenant: true });
    const row = await this.estRepo
      .createQueryBuilder('e')
      .innerJoin(
        'usuario_establecimiento',
        'ue',
        'ue.establecimiento_id = e.id AND ue.user_id = :userId',
        { userId: actor.userId },
      )
      .where('e.id = :id', { id })
      .andWhere('e.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!row) {
      throw new AppError({
        code: ErrorCodes.ESTABLECIMIENTO_NOT_FOUND,
        message: 'Establecimiento no encontrado',
        status: 404,
      });
    }
    return row;
  }

  async createEstablecimiento(
    dto: CreateEstablecimientoDto,
  ): Promise<Establecimiento> {
    return this.create(dto, { strictTenant: true });
  }

  async updateEstablecimiento(
    id: string,
    dto: UpdateEstablecimientoDto,
  ): Promise<{ updated: Establecimiento; wasDeactivated: boolean }> {
    const prev = await this.mustFindById(id, { strictTenant: true });
    const updated = await this.update(id, dto, { strictTenant: true });
    const wasDeactivated = prev.activo === true && dto.activo === false;
    return { updated, wasDeactivated };
  }

  async deleteEstablecimiento(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });
    await this.softDelete(id, { strictTenant: true });
  }

  async assignUser(
    establecimientoId: string,
    assigneeUserId: string,
  ): Promise<UsuarioEstablecimiento> {
    await this.mustFindById(establecimientoId, { strictTenant: true });

    const user = await this.usersService.getByIdAdmin(assigneeUserId, false);
    if (!user) {
      throw new AppError({
        code: ErrorCodes.NOT_FOUND,
        message: 'Usuario no encontrado en este tenant',
        status: 404,
      });
    }

    try {
      const assignment = this.ueRepo.create({
        user_id: assigneeUserId,
        establecimiento_id: establecimientoId,
      });
      return await this.ueRepo.save(assignment);
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505') {
        throw new AppError({
          code: ErrorCodes.ASSIGNMENT_CONFLICT,
          message: 'El usuario ya está asignado a este establecimiento',
          status: 409,
        });
      }
      throw err;
    }
  }

  async removeUser(
    establecimientoId: string,
    assigneeUserId: string,
  ): Promise<void> {
    await this.mustFindById(establecimientoId, { strictTenant: true });

    const ue = await this.ueRepo.findOne({
      where: { establecimiento_id: establecimientoId, user_id: assigneeUserId },
    });

    if (!ue) {
      throw new AppError({
        code: ErrorCodes.ASSIGNMENT_NOT_FOUND,
        message: 'Asignación no encontrada',
        status: 404,
      });
    }

    await this.ueRepo.remove(ue);
  }

  async listUsers(
    establecimientoId: string,
    actor: Actor,
  ): Promise<UsuarioEstablecimiento[]> {
    await this.findOneForUser(establecimientoId, actor);
    return this.ueRepo.find({
      where: { establecimiento_id: establecimientoId },
      order: { assigned_at: 'ASC' },
    });
  }
}
