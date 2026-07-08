import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { MarcasService } from './marcas.service';
import { QueryMarcasDto } from './dto/query-marcas.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/marcas')
export class AdminMarcasController {
  constructor(private readonly svc: MarcasService) {}

  @Get()
  async list(@Query() q: QueryMarcasDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listMarcas(q);
    return page(r.items, p, limit, r.total);
  }
}
