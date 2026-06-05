import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { MesasService } from './mesas.service';
import { CreateMesaDto } from './dto/create-mesa.dto';
import { UpdateMesaDto } from './dto/update-mesa.dto';
import { QueryMesasDto } from './dto/query-mesas.dto';
import { QueryHistorialDto } from './dto/query-historial.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MesasController {
  constructor(
    private readonly svc: MesasService,
    private readonly logger: PinoLogger,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // GET mesas — list (no role guard)
  // ──────────────────────────────────────────────────────────────────────
  @Get('mesas')
  async list(@Query() q: QueryMesasDto, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listMesas(q, tenantId);
    return page(r.items, p, limit, r.total);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET mesas/qr/:codigoQr — MUST be declared BEFORE mesas/:id
  // ──────────────────────────────────────────────────────────────────────
  @Get('mesas/qr/:codigoQr')
  async getByQr(@Param('codigoQr') codigoQr: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const mesa = await this.svc.getMesaByQr(codigoQr, tenantId);
    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET mesas/:id
  // ──────────────────────────────────────────────────────────────────────
  @Get('mesas/:id')
  async getOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const mesa = await this.svc.getMesaById(id, tenantId);
    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST mesas — create
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Post('mesas')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMesaDto, @Req() req: AuthRequest) {
    const userId = req.user?.sub;
    const mesa = await this.svc.createMesa(dto, userId);

    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH mesas/:id — update (strict immutability guard)
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Patch('mesas/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMesaDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['plantas_estimadas', 'activo']);
    const body = req.body as Record<string, unknown>;
    if (Object.keys(body ?? {}).some((k) => !ALLOWED.has(k))) {
      throw new AppError({
        code: ErrorCodes.MESA_FIELD_IMMUTABLE,
        message: 'Solo se pueden modificar plantas_estimadas y activo',
        status: 400,
      });
    }

    const tenantId = req.tenantId ?? '';
    const mesa = await this.svc.updateMesa(id, dto, tenantId);
    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // DELETE mesas/:id — soft delete (admin_global only, estado=baja required)
  // ──────────────────────────────────────────────────────────────────────
  @Roles('admin_global')
  @Delete('mesas/:id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    await this.svc.deleteMesa(id, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      email: req.user?.email,
      userId: req.user?.sub,
    }, tenantId);
    return ok({ deleted: true });
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST mesas/:id/dar-de-baja
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Post('mesas/:id/dar-de-baja')
  @HttpCode(HttpStatus.OK)
  async darDeBaja(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const mesa = await this.svc.darDeBaja(id, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      email: req.user?.email,
      userId: req.user?.sub,
    }, tenantId);
    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST mesas/:id/reactivar
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Post('mesas/:id/reactivar')
  @HttpCode(HttpStatus.OK)
  async reactivar(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = req.tenantId ?? '';
    const mesa = await this.svc.reactivar(id, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      email: req.user?.email,
      userId: req.user?.sub,
    }, tenantId);
    return ok(mesa);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET mesas/:id/historial
  // ──────────────────────────────────────────────────────────────────────
  @Get('mesas/:id/historial')
  async getHistorial(
    @Param('id') id: string,
    @Query() q: QueryHistorialDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.getHistorial(id, q, tenantId);
    return page(r.items, p, limit, r.total);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET tuneles/:tunel_id/mesas — in MesasController (NOT TunelesController)
  // ──────────────────────────────────────────────────────────────────────
  @Get('tuneles/:tunel_id/mesas')
  async getMesasByTunel(
    @Param('tunel_id') tunel_id: string,
    @Query() q: QueryMesasDto,
    @Req() req: AuthRequest,
  ) {
    const tenantId = req.tenantId ?? '';
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.getMesasByTunel(tunel_id, q, tenantId);
    return page(r.items, p, limit, r.total);
  }
}
