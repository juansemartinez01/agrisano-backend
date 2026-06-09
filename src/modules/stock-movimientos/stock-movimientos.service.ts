import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { clampPagination } from 'src/common/query/query-utils';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { QuimicosService } from 'src/modules/quimicos/quimicos.service';
import { QuimicoUnidadStock } from 'src/modules/quimicos/entities/quimico.entity';
import { MovimientoStock, MovimientoTipo } from './entities/movimiento-stock.entity';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';
import { QueryMovimientosDto } from './dto/query-movimientos.dto';

export const AUDIT = {
  INGRESO: 'stock_movimiento_ingreso',
  EGRESO_MANUAL: 'stock_movimiento_egreso_manual',
} as const;

export interface CreateMovimientoResult {
  movimiento: MovimientoStock;
  quimico_stock_actual: number;
  quimico_unidad_stock: QuimicoUnidadStock;
  warning?: string;
}

@Injectable()
export class StockMovimientosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovimientoStock)
    private readonly repo: Repository<MovimientoStock>,
    private readonly quimicosService: QuimicosService,
    private readonly tenancy: TenancyService,
  ) {}

  async createMovimiento(
    dto: CreateMovimientoDto,
    userId: string,
  ): Promise<CreateMovimientoResult> {
    const tenantId = this.tenancy.requireTenantId();
    const quimico = await this.quimicosService.mustFindById(dto.quimico_id, {
      strictTenant: true,
    });

    if (
      dto.tipo === MovimientoTipo.INGRESO &&
      dto.unidad_ingreso !== undefined &&
      dto.unidad_ingreso !== quimico.unidad_stock
    ) {
      throw new AppError({
        code: ErrorCodes.MOVIMIENTO_UNIDAD_MISMATCH,
        message: `La unidad de ingreso '${dto.unidad_ingreso}' no coincide con la unidad del químico ('${quimico.unidad_stock}'). Enviá la cantidad en ${quimico.unidad_stock}.`,
        status: 422,
      });
    }

    const delta =
      dto.tipo === MovimientoTipo.INGRESO
        ? Number(dto.cantidad)
        : -Number(dto.cantidad);
    const projectedStock = Number(quimico.stock_actual) + delta;
    const warning =
      projectedStock < 0 ? 'Stock resultante negativo' : undefined;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const today = new Date().toISOString().split('T')[0];
      const movimiento = qr.manager.create(MovimientoStock, {
        tenant_id: tenantId,
        quimico_id: dto.quimico_id,
        tipo: dto.tipo,
        cantidad: dto.cantidad,
        unidad_medida: quimico.unidad_stock,
        establecimiento_id: quimico.establecimiento_id,
        usuario_id: userId,
        fecha: dto.fecha ?? today,
        numero_remito: dto.numero_remito ?? null,
        observaciones: dto.observaciones ?? null,
      });
      const saved = await qr.manager.save(MovimientoStock, movimiento);
      await qr.manager.query(
        `UPDATE quimicos SET stock_actual = stock_actual + $1 WHERE id = $2`,
        [delta, dto.quimico_id],
      );
      await qr.commitTransaction();
      return {
        movimiento: saved,
        quimico_stock_actual: projectedStock,
        quimico_unidad_stock: quimico.unidad_stock,
        warning,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async listMovimientos(
    q: QueryMovimientosDto,
  ): Promise<{ items: MovimientoStock[]; total: number }> {
    const tenantId = this.tenancy.requireTenantId();
    const { page, limit, skip } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '')
      ? (q.sortBy as string)
      : 'fecha';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId });

    if (q.quimico_id) qb.andWhere('m.quimico_id = :qid', { qid: q.quimico_id });
    if (q.establecimiento_id)
      qb.andWhere('m.establecimiento_id = :eid', { eid: q.establecimiento_id });
    if (q.tipo) qb.andWhere('m.tipo = :tipo', { tipo: q.tipo });
    if (q.fecha_desde) qb.andWhere('m.fecha >= :desde', { desde: q.fecha_desde });
    if (q.fecha_hasta) qb.andWhere('m.fecha <= :hasta', { hasta: q.fecha_hasta });

    qb.orderBy(`m.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getMovimiento(id: string): Promise<MovimientoStock> {
    const tenantId = this.tenancy.requireTenantId();
    const m = await this.repo.findOne({ where: { id, tenant_id: tenantId } });
    if (!m) {
      throw new AppError({
        code: ErrorCodes.MOVIMIENTO_NOT_FOUND,
        message: 'Movimiento no encontrado',
        status: 404,
      });
    }
    return m;
  }

  async listByQuimico(
    quimicoId: string,
    q: QueryMovimientosDto,
  ): Promise<{ items: MovimientoStock[]; total: number }> {
    await this.quimicosService.mustFindById(quimicoId, { strictTenant: true });
    return this.listMovimientos({ ...q, quimico_id: quimicoId });
  }
}
