import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { ProveedoresService } from './proveedores.service';
import { QueryProveedoresDto } from './dto/query-proveedores.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/proveedores')
export class AdminProveedoresController {
  constructor(private readonly svc: ProveedoresService) {}

  @Get()
  async list(@Query() q: QueryProveedoresDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listProveedores(q);
    return page(r.items, p, limit, r.total);
  }
}
