import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { RecetasService } from './recetas.service';
import { QueryRecetasDto } from './dto/query-recetas.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/recetas')
export class AdminRecetasController {
  constructor(private readonly svc: RecetasService) {}

  @Get()
  async list(@Query() q: QueryRecetasDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listRecetas(q);
    return page(r.items, p, limit, r.total);
  }
}
