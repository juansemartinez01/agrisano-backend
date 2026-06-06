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
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { AplicacionesQuimicasService } from './aplicaciones-quimicas.service';
import { CreateAplicacionDto } from './dto/create-aplicacion.dto';
import { QueryAplicacionesDto } from './dto/query-aplicaciones.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AplicacionesQuimicasController {
  constructor(private readonly svc: AplicacionesQuimicasService) {}

  // ──────────────────────────────────────────────────────────────────────
  // GET aplicaciones-quimicas — list
  // ──────────────────────────────────────────────────────────────────────
  @Get('aplicaciones-quimicas')
  async list(@Query() q: QueryAplicacionesDto, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listAplicaciones(q, tenantId);
    return page(r.items, p, limit, r.total);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET aplicaciones-quimicas/:id — getById
  // ──────────────────────────────────────────────────────────────────────
  @Get('aplicaciones-quimicas/:id')
  async getOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const result = await this.svc.getAplicacionById(id, tenantId);
    return ok(result);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST aplicaciones-quimicas — create
  // ──────────────────────────────────────────────────────────────────────
  @Roles('operario', 'supervisor', 'admin_global')
  @Post('aplicaciones-quimicas')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAplicacionDto, @Req() req: AuthRequest) {
    const userId = req.user?.sub;
    const result = await this.svc.createAplicacion(dto, userId);
    return ok(result);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET mesas/:mesa_id/aplicaciones — by mesa (in this controller, NOT MesasController)
  // ──────────────────────────────────────────────────────────────────────
  @Get('mesas/:mesa_id/aplicaciones')
  async getByMesa(
    @Param('mesa_id') mesa_id: string,
    @Query() q: QueryAplicacionesDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.getAplicacionesByMesa(mesa_id, q, tenantId);
    return page(r.items, p, limit, r.total);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET bandejas/:bandeja_id/aplicaciones — by bandeja (in this controller)
  // ──────────────────────────────────────────────────────────────────────
  @Get('bandejas/:bandeja_id/aplicaciones')
  async getByBandeja(
    @Param('bandeja_id') bandeja_id: string,
    @Query() q: QueryAplicacionesDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.getAplicacionesByBandeja(bandeja_id, q, tenantId);
    return page(r.items, p, limit, r.total);
  }
}
