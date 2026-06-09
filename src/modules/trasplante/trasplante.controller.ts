import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { ok, page } from 'src/common/http/api-response';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { TrasplanteService } from './trasplante.service';
import { CreateTrasplanteDto } from './dto/create-trasplante.dto';
import { QueryTrasplantesDto } from './dto/query-trasplantes.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TrasplanteController {
  constructor(
    private readonly svc: TrasplanteService,
    private readonly tenancy: TenancyService,
  ) {}

  @Roles('operario', 'supervisor', 'admin_global')
  @Post('trasplante')
  @HttpCode(200)
  async executeTrasplante(
    @Body() dto: CreateTrasplanteDto,
    @Req() req: AuthRequest,
  ) {
    const userId = req.user?.sub;
    const auditReq = {
      requestId: req.id,
      method: req.method,
      url: req.url,
      email: req.user?.email,
      userId,
    };
    const result = await this.svc.executeTrasplante(dto, userId, auditReq);
    return ok(result);
  }

  @Get('mesas/:mesa_id/trasplantes')
  async listTrasplantesByMesa(
    @Param('mesa_id') mesa_id: string,
    @Query() q: QueryTrasplantesDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const r = await this.svc.listTrasplantesByMesa(mesa_id, q, tenantId);
    const pageNum = q.page ?? 1;
    const limitNum = q.limit ?? 20;
    return page(r.items, pageNum, limitNum, r.total);
  }
}
