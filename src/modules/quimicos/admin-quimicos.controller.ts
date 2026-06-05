import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { QuimicosService } from './quimicos.service';
import { QueryQuimicosDto } from './dto/query-quimicos.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/quimicos')
export class AdminQuimicosController {
  constructor(private readonly svc: QuimicosService) {}

  @Get()
  async list(@Query() q: QueryQuimicosDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listQuimicos(q);
    return page(r.items, p, limit, r.total);
  }
}
