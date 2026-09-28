import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { AplicacionesQuimicasService } from './aplicaciones-quimicas.service';
import { CreateAplicacionDto } from './dto/create-aplicacion.dto';
import { UpdateAplicacionDto } from './dto/update-aplicacion.dto';
import { UpdateOperationGroupDto } from './dto/update-operation-group.dto';
import { QueryAplicacionesDto } from './dto/query-aplicaciones.dto';

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
  // PATCH aplicaciones-quimicas/:id — corrección (contexto/establecimiento_id
  // son inmutables, se validan también a nivel service)
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Patch('aplicaciones-quimicas/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAplicacionDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set([
      'fecha_hora',
      'observaciones',
      'chemical_lines',
      'bandeja_ids',
      'mesa_ids',
    ]);
    const body = req.body as Record<string, unknown>;
    const bodyKeys = Object.keys(body ?? {});
    if (bodyKeys.length === 0 || bodyKeys.some((k) => !ALLOWED.has(k))) {
      throw new AppError({
        code: ErrorCodes.APLICACION_FIELD_IMMUTABLE,
        message:
          'Solo se pueden modificar fecha_hora, observaciones, chemical_lines, bandeja_ids y mesa_ids',
        status: 400,
      });
    }

    const userId = req.user?.sub;
    const result = await this.svc.updateAplicacion(id, dto, userId);
    return ok(result);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH aplicaciones-quimicas/operation-group/:operation_group_id —
  // corrección atómica de TODAS las filas de un mismo operation_group_id
  // (crear/actualizar/borrar por ítem, ver UpdateOperationGroupDto).
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Patch('aplicaciones-quimicas/operation-group/:operation_group_id')
  async correctGroup(
    @Param('operation_group_id') operationGroupId: string,
    @Body() dto: UpdateOperationGroupDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['fecha_hora', 'observaciones', 'items']);
    const body = req.body as Record<string, unknown>;
    const bodyKeys = Object.keys(body ?? {});
    if (bodyKeys.some((k) => !ALLOWED.has(k))) {
      throw new AppError({
        code: ErrorCodes.APLICACION_FIELD_IMMUTABLE,
        message: 'Solo se pueden enviar fecha_hora, observaciones e items',
        status: 400,
      });
    }

    const userId = req.user?.sub;
    const result = await this.svc.updateOperationGroup(
      operationGroupId,
      dto,
      userId,
    );
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
