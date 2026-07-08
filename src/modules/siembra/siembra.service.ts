import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { clampPagination } from 'src/common/query/query-utils';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { LotesService } from 'src/modules/lotes/lotes.service';
import { LoteTipo } from 'src/modules/lotes/entities/lote.entity';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Siembra } from './entities/siembra.entity';
import { Bandeja, BandejaEstado } from './entities/bandeja.entity';
import { CreateSiembraDto } from './dto/create-siembra.dto';
import { UpdateSiembraDto } from './dto/update-siembra.dto';
import { QuerySiembrasDto } from './dto/query-siembras.dto';

export const AUDIT = {
  CREATED: 'siembra_created',
  UPDATED: 'siembra_updated',
  DELETED: 'siembra_deleted',
  INGRESO_NURSERY: 'siembra_ingreso_nursery',
} as const;

interface LoteRef {
  id: string;
  numero_lote: string;
  tipo: string;
}

type BandejaWithRefs = Bandeja & {
  lote_semilla?: LoteRef;
  lote_sustrato?: LoteRef;
};

export interface SiembraWithBandejas extends Siembra {
  bandejas: BandejaWithRefs[];
}

@Injectable()
export class SiembraService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Siembra)
    private readonly siembraRepo: Repository<Siembra>,
    @InjectRepository(Bandeja)
    private readonly bandejaRepo: Repository<Bandeja>,
    private readonly lotesService: LotesService,
    private readonly estService: EstablecimientosService,
    private readonly tenancy: TenancyService,
  ) {}

  async listSiembras(
    q: QuerySiembrasDto,
  ): Promise<{ items: Siembra[]; total: number }> {
    const tenantId = this.tenancy.requireTenantId();
    const { page, limit, skip } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'created_at';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.siembraRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId });

    if (q.establecimiento_id) {
      qb.andWhere('s.establecimiento_id = :estId', { estId: q.establecimiento_id });
    }
    if (q.fecha_desde) {
      qb.andWhere('s.fecha >= :desde', { desde: q.fecha_desde });
    }
    if (q.fecha_hasta) {
      qb.andWhere('s.fecha <= :hasta', { hasta: q.fecha_hasta });
    }

    qb.orderBy(`s.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getSiembraWithBandejas(id: string): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    const bandejas = await this.bandejaRepo
      .createQueryBuilder('b')
      .leftJoinAndMapOne('b.lote_semilla', 'lotes', 'ls', 'ls.id = b.lote_semilla_id')
      .leftJoinAndMapOne('b.lote_sustrato', 'lotes', 'lsu', 'lsu.id = b.lote_sustrato_id')
      .where('b.siembra_id = :id', { id })
      .andWhere('b.tenant_id = :tenantId', { tenantId })
      .select([
        'b.id',
        'b.siembra_id',
        'b.lote_semilla_id',
        'b.lote_sustrato_id',
        'b.estado',
        'b.fecha_entrada_nursery',
        'b.fecha_trasplante',
        'b.mesa_id',
        'b.observaciones',
        'b.codigo',
        'b.establecimiento_id',
        'b.created_at',
        'b.updated_at',
        'ls.id',
        'ls.numero_lote',
        'ls.tipo',
        'lsu.id',
        'lsu.numero_lote',
        'lsu.tipo',
      ])
      .getMany() as BandejaWithRefs[];

    return { ...siembra, bandejas };
  }

  async createSiembra(
    dto: CreateSiembraDto,
    userId: string,
  ): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

    for (const group of dto.bandejas) {
      const semilla = await this.lotesService.mustFindById(
        group.lote_semilla_id,
        { strictTenant: true },
      );
      if (semilla.tipo !== LoteTipo.SEMILLA) {
        throw new AppError({
          code: ErrorCodes.LOTE_TIPO_INCORRECTO,
          message: `lote_semilla_id '${group.lote_semilla_id}' debe ser tipo semilla`,
          status: 422,
        });
      }
      const sustrato = await this.lotesService.mustFindById(
        group.lote_sustrato_id,
        { strictTenant: true },
      );
      if (sustrato.tipo !== LoteTipo.SUSTRATO) {
        throw new AppError({
          code: ErrorCodes.LOTE_TIPO_INCORRECTO,
          message: `lote_sustrato_id '${group.lote_sustrato_id}' debe ser tipo sustrato`,
          status: 422,
        });
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const siembra = qr.manager.create(Siembra, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        fecha: dto.fecha ?? new Date().toISOString().split('T')[0],
        observaciones: dto.observaciones ?? null,
        usuario_id: userId,
      });
      const savedSiembra = await qr.manager.save(Siembra, siembra);

      for (const group of dto.bandejas) {
        for (let i = 0; i < group.cantidad; i++) {
          const bandeja = qr.manager.create(Bandeja, {
            tenant_id: tenantId,
            siembra_id: savedSiembra.id,
            lote_semilla_id: group.lote_semilla_id,
            lote_sustrato_id: group.lote_sustrato_id,
            estado: BandejaEstado.COOLING_PERIOD,
            fecha_entrada_nursery: null,
            establecimiento_id: dto.establecimiento_id,
          });
          await qr.manager.save(Bandeja, bandeja);
        }
      }

      await qr.commitTransaction();
      return this.getSiembraWithBandejas(savedSiembra.id);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async ingresarNursery(id: string): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await qr.manager
        .createQueryBuilder()
        .update(Bandeja)
        .set({ estado: BandejaEstado.EN_NURSERY, fecha_entrada_nursery: () => 'now()' })
        .where('siembra_id = :id', { id })
        .andWhere('estado = :estado', { estado: BandejaEstado.COOLING_PERIOD })
        .execute();

      if (!result.affected) {
        throw new AppError({
          code: ErrorCodes.SIEMBRA_SIN_BANDEJAS_EN_COOLING,
          message: 'La siembra no tiene bandejas en cooling_period para ingresar a nursery',
          status: 422,
        });
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return this.getSiembraWithBandejas(id);
  }

  async updateSiembra(id: string, dto: UpdateSiembraDto): Promise<Siembra> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    siembra.observaciones = dto.observaciones ?? null;
    return this.siembraRepo.save(siembra);
  }

  async deleteSiembra(id: string): Promise<void> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    const trasplantadaCount = await this.bandejaRepo.count({
      where: { siembra_id: id, estado: BandejaEstado.TRASPLANTADA },
    });
    if (trasplantadaCount > 0) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_HAS_TRASPLANTADAS,
        message: 'No se puede eliminar una siembra con bandejas trasplantadas',
        status: 409,
      });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.query(
        `UPDATE bandejas SET deleted_at = now() WHERE siembra_id = $1 AND deleted_at IS NULL`,
        [id],
      );
      await qr.manager.softDelete(Siembra, id);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
