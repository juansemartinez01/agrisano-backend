import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { TunelesService } from './tuneles.service';
import { QueryTunelesDto } from './dto/query-tuneles.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/tuneles')
export class AdminTunelesController {
  constructor(private readonly svc: TunelesService) {}

  @Get()
  async list(@Query() q: QueryTunelesDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listTuneles(q);
    return page(r.items, p, limit, r.total);
  }
}
