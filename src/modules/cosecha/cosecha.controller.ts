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
import { CosechaService } from './cosecha.service';
import { CreateCosechaDto } from './dto/create-cosecha.dto';
import { QueryCosechasDto } from './dto/query-cosechas.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CosechaController {
  constructor(
    private readonly svc: CosechaService,
    private readonly tenancy: TenancyService,
  ) {}

  @Roles('operario', 'supervisor', 'admin_global')
  @Post('cosecha')
  @HttpCode(201)
  async registrarCosecha(
    @Body() dto: CreateCosechaDto,
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
    const result = await this.svc.registrarCosecha(dto, userId, auditReq);
    return ok(result);
  }

  @Get('cosecha')
  async listCosechas(
    @Query() q: QueryCosechasDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const r = await this.svc.listCosechas(q, tenantId);
    const pageNum = q.page ?? 1;
    const limitNum = q.limit ?? 20;
    return page(r.items, pageNum, limitNum, r.total);
  }

  @Get('cosecha/:id')
  async getCosechaById(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const cosecha = await this.svc.getCosechaById(id, tenantId);
    return ok(cosecha);
  }

  @Get('mesas/:mesa_id/cosechas')
  async getCosechasByMesa(
    @Param('mesa_id') mesa_id: string,
    @Query() q: QueryCosechasDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const r = await this.svc.getCosechasByMesa(mesa_id, q, tenantId);
    const pageNum = q.page ?? 1;
    const limitNum = q.limit ?? 20;
    return page(r.items, pageNum, limitNum, r.total);
  }
}
