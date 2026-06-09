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
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { PackingService } from './packing.service';
import { CreatePackingDto } from './dto/create-packing.dto';
import { QueryPackingDto } from './dto/query-packing.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PackingController {
  constructor(private readonly svc: PackingService) {}

  @Roles('operario', 'supervisor', 'admin_global')
  @Post('packing')
  @HttpCode(201)
  async registrarPacking(
    @Body() dto: CreatePackingDto,
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
    const result = await this.svc.registrarPacking(dto, userId, auditReq);
    return ok(result);
  }

  @Get('packing')
  async listPacking(
    @Query() q: QueryPackingDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const r = await this.svc.listPacking(q, tenantId);
    return page(r.items, q.page ?? 1, q.limit ?? 20, r.total);
  }

  @Get('packing/:id')
  async getPackingById(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const result = await this.svc.getPackingById(id, tenantId);
    return ok(result);
  }

  @Get('cosechas/:cosecha_id/packing')
  async getPackingByCosecha(
    @Param('cosecha_id') cosecha_id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const result = await this.svc.getPackingByCosecha(cosecha_id, tenantId);
    return ok(result);
  }
}
