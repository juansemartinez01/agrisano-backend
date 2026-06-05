import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { LotesService } from './lotes.service';
import { QueryLotesDto } from './dto/query-lotes.dto';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload };

@Roles('admin_global')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/lotes')
export class AdminLotesController {
  constructor(private readonly svc: LotesService) {}

  @Get()
  async list(@Query() q: QueryLotesDto, @Req() _req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listLotes(q);
    return page(r.items, p, limit, r.total);
  }
}
