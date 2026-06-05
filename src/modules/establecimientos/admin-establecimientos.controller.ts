import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { EstablecimientosService } from './establecimientos.service';
import { QueryEstablecimientosDto } from './dto/query-establecimientos.dto';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/establecimientos')
export class AdminEstablecimientosController {
  constructor(private readonly svc: EstablecimientosService) {}

  @Get()
  async list(@Query() q: QueryEstablecimientosDto, @Req() req: AuthRequest) {
    const actor = { userId: req.user.sub, roles: req.user.roles };
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listForUser(q, actor);
    return page(r.items, p, limit, r.total);
  }
}
