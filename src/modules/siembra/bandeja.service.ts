import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { Bandeja, BandejaEstado } from './entities/bandeja.entity';
import { QueryBandejasDto } from './dto/query-bandejas.dto';

@Injectable()
export class BandejaService extends BaseCrudTenantService<Bandeja> {
  constructor(
    @InjectRepository(Bandeja)
    private readonly bandejaRepo: Repository<Bandeja>,
  ) {
    super(bandejaRepo);
  }

  async listBandejas(
    q: QueryBandejasDto,
  ): Promise<{ items: Bandeja[]; total: number }> {
    const estadoFilter = q.estado ?? BandejaEstado.EN_NURSERY;
    const filters: Record<string, unknown> = { estado: estadoFilter };
    if (q.establecimiento_id) filters['establecimiento_id'] = q.establecimiento_id;
    if (q.siembra_id) filters['siembra_id'] = q.siembra_id;
    if (q.lote_semilla_id) filters['lote_semilla_id'] = q.lote_semilla_id;

    return this.list(
      { ...q, filters },
      {
        filterAllowed: ['estado', 'establecimiento_id', 'siembra_id', 'lote_semilla_id'],
        sortAllowed: ['fecha_entrada_nursery', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        strictTenant: true,
      },
    );
  }

  async getBandeja(id: string): Promise<Bandeja> {
    const bandeja = await this.findById(id, { strictTenant: true });
    if (!bandeja) {
      throw new AppError({
        code: ErrorCodes.BANDEJA_NOT_FOUND,
        message: 'Bandeja no encontrada',
        status: 404,
      });
    }
    return bandeja;
  }
}
