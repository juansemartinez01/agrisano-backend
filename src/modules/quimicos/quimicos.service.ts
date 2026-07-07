import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { runInTx } from 'src/common/database/transaction';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Quimico } from './entities/quimico.entity';
import { PrincipioActivo } from './entities/principio-activo.entity';
import { QuimicoPrincipioActivo } from './entities/quimico-principio-activo.entity';
import { CreateQuimicoDto } from './dto/create-quimico.dto';
import { UpdateQuimicoDto } from './dto/update-quimico.dto';
import { QueryQuimicosDto } from './dto/query-quimicos.dto';

export const AUDIT = {
  QUIMICO_CREATED: 'quimico_created',
  QUIMICO_UPDATED: 'quimico_updated',
  QUIMICO_DELETED: 'quimico_deleted',
  PA_CREATED: 'principio_activo_created',
  PA_UPDATED: 'principio_activo_updated',
  PA_DELETED: 'principio_activo_deleted',
} as const;

@Injectable()
export class QuimicosService extends BaseCrudTenantService<Quimico> {
  constructor(
    @InjectRepository(Quimico)
    private readonly quimicoRepo: Repository<Quimico>,
    @InjectRepository(QuimicoPrincipioActivo)
    private readonly qpaRepo: Repository<QuimicoPrincipioActivo>,
    @InjectRepository(PrincipioActivo)
    private readonly paRepo: Repository<PrincipioActivo>,
    private readonly estService: EstablecimientosService,
    private readonly dataSource: DataSource,
  ) {
    super(quimicoRepo);
  }

  async listQuimicos(
    q: QueryQuimicosDto,
  ): Promise<{ items: Quimico[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.establecimiento_id !== undefined)
      filters['establecimiento_id'] = q.establecimiento_id;
    if (q.activo !== undefined) filters['activo'] = q.activo; // NO default (FR-001)

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

  async getQuimicoWithPrincipios(id: string): Promise<Quimico> {
    const quimico = await this.mustFindById(id, { strictTenant: true });

    const links = await this.qpaRepo.find({ where: { quimico_id: id } });
    if (links.length === 0) {
      quimico.principios_activos = [];
      return quimico;
    }

    const paIds = links.map((l) => l.principio_activo_id);
    quimico.principios_activos = await this.paRepo.findBy({ id: In(paIds) });
    return quimico;
  }

  private async validatePrincipioActivoIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.paRepo.findBy({ id: In(ids) });
    if (found.length !== ids.length) {
      const foundSet = new Set(found.map((p) => p.id));
      const unknownIds = ids.filter((id) => !foundSet.has(id));
      throw new AppError({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Principios activos no encontrados',
        status: 400,
        details: { unknown_ids: unknownIds },
      });
    }
  }

  async createQuimico(dto: CreateQuimicoDto): Promise<Quimico> {
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    const tenantId = this.getTenantId({ strictTenant: true }) as string;

    const conflict = await this.quimicoRepo.findOne({
      where: {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        nombre: dto.nombre,
      },
    });
    if (conflict) {
      throw new AppError({
        code: ErrorCodes.QUIMICO_NOMBRE_DUPLICADO,
        message: `Ya existe un químico con nombre '${dto.nombre}' en este establecimiento`,
        status: 409,
      });
    }

    const paIds = dto.principios_activos ?? [];
    await this.validatePrincipioActivoIds(paIds);

    const quimico = await this.create(
      {
        establecimiento_id: dto.establecimiento_id,
        nombre: dto.nombre,
        unidad_medida: dto.unidad_medida,
        rate_unidad: dto.rate_unidad,
        withholding_period_dias: dto.withholding_period_dias ?? null,
      },
      { strictTenant: true },
    );

    if (paIds.length > 0) {
      await this.qpaRepo.insert(
        paIds.map((paId) => ({ quimico_id: quimico.id, principio_activo_id: paId })),
      );
    }

    return this.getQuimicoWithPrincipios(quimico.id);
  }

  async updateQuimico(id: string, dto: UpdateQuimicoDto): Promise<Quimico> {
    const current = await this.mustFindById(id, { strictTenant: true });

    if (dto.nombre !== undefined && dto.nombre !== current.nombre) {
      const tenantId = this.getTenantId({ strictTenant: true }) as string;

      const conflict = await this.quimicoRepo
        .createQueryBuilder('q')
        .where('q.tenant_id = :tenantId', { tenantId })
        .andWhere('q.establecimiento_id = :estId', {
          estId: current.establecimiento_id,
        })
        .andWhere('q.nombre = :nombre', { nombre: dto.nombre })
        .andWhere('q.id != :id', { id })
        .getOne();

      if (conflict) {
        throw new AppError({
          code: ErrorCodes.QUIMICO_NOMBRE_DUPLICADO,
          message: `Ya existe un químico con nombre '${dto.nombre}' en este establecimiento`,
          status: 409,
        });
      }
    }

    if (dto.principios_activos !== undefined) {
      await this.validatePrincipioActivoIds(dto.principios_activos);

      await runInTx(this.dataSource, async (mgr) => {
        await mgr.delete(QuimicoPrincipioActivo, { quimico_id: id });
        if (dto.principios_activos!.length > 0) {
          await mgr.insert(
            QuimicoPrincipioActivo,
            dto.principios_activos!.map((paId) => ({
              quimico_id: id,
              principio_activo_id: paId,
            })),
          );
        }
      });
    }

    const updatePayload: Partial<Quimico> = {};
    if (dto.nombre !== undefined) updatePayload.nombre = dto.nombre;
    if (dto.unidad_medida !== undefined) updatePayload.unidad_medida = dto.unidad_medida;
    if (dto.activo !== undefined) updatePayload.activo = dto.activo;
    if (dto.rate_unidad !== undefined) updatePayload.rate_unidad = dto.rate_unidad;
    if (dto.withholding_period_dias !== undefined) updatePayload.withholding_period_dias = dto.withholding_period_dias;

    if (Object.keys(updatePayload).length > 0) {
      await this.update(id, updatePayload, { strictTenant: true });
    }

    return this.getQuimicoWithPrincipios(id);
  }

  async deleteQuimico(id: string): Promise<void> {
    await this.mustFindById(id, { strictTenant: true });
    await this.softDelete(id, { strictTenant: true });
  }
}
