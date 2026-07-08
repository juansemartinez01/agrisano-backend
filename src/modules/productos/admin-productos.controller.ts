import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { ProductosService } from './productos.service';
import { QueryProductosDto } from './dto/query-productos.dto';

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/productos')
export class AdminProductosController {
  constructor(private readonly svc: ProductosService) {}

  @Get()
  async list(@Query() q: QueryProductosDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listProductos(q);
    return page(r.items, p, limit, r.total);
  }
}
