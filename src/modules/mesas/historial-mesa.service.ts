import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { clampPagination } from 'src/common/query/query-utils';
import { HistorialMesa, HistorialTipoEvento } from './entities/historial-mesa.entity';
import { QueryHistorialDto } from './dto/query-historial.dto';

@Injectable()
export class HistorialMesaService {
  constructor(
    @InjectRepository(HistorialMesa)
    private readonly historialRepo: Repository<HistorialMesa>,
  ) {}

  async writeEvent(data: {
    mesa_id: string;
    tipo_evento: HistorialTipoEvento;
    detalle?: Record<string, unknown>;
    usuario_id: string;
    tenant_id: string | null;
  }): Promise<HistorialMesa> {
    const record = this.historialRepo.create({
      mesa_id: data.mesa_id,
      tipo_evento: data.tipo_evento,
      detalle: data.detalle ?? null,
      usuario_id: data.usuario_id,
      tenant_id: data.tenant_id,
      fecha_hora: new Date(),
    });
    return this.historialRepo.save(record);
  }

  async listByMesa(
    mesa_id: string,
    q: QueryHistorialDto,
    tenantId: string | null,
  ): Promise<{ items: HistorialMesa[]; total: number }> {
    const { skip, limit } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha_hora', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'fecha_hora';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.historialRepo
      .createQueryBuilder('h')
      .where('h.mesa_id = :mesa_id', { mesa_id })
      .andWhere('h.tenant_id = :tenantId', { tenantId })
      .orderBy(`h.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
