import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { BandejaService } from './bandeja.service';
import { QueryBandejasDto } from './dto/query-bandejas.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bandejas')
export class BandejaController {
  constructor(private readonly svc: BandejaService) {}

  @Get()
  async list(@Query() q: QueryBandejasDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listBandejas(q);
    return page(r.items, p, limit, r.total);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const bandeja = await this.svc.getBandeja(id);
    return ok(bandeja);
  }
}
