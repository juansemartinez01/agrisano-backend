import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { VariedadesService } from './variedades.service';
import { QueryVariedadesDto } from './dto/query-variedades.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/variedades')
export class AdminVariedadesController {
  constructor(private readonly svc: VariedadesService) {}

  @Get()
  async list(@Query() q: QueryVariedadesDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listVariedades(q);
    return page(r.items, p, limit, r.total);
  }
}
