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
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { LotesQuimicosService, AUDIT } from './lotes-quimicos.service';
import { CreateLoteQuimicoDto } from './dto/create-lote-quimico.dto';
import { UpdateLoteQuimicoDto } from './dto/update-lote-quimico.dto';
import { AjusteLoteQuimicoDto } from './dto/ajuste-lote-quimico.dto';
import { QueryLotesQuimicosDto } from './dto/query-lotes-quimicos.dto';

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
export class LotesQuimicosController {
  constructor(
    private readonly svc: LotesQuimicosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('lotes-quimicos')
  async list(@Query() q: QueryLotesQuimicosDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listLotes(q);
    return page(r.items, p, limit, r.total);
  }

  @Get('lotes-quimicos/:id')
  async getOne(@Param('id') id: string) {
    const lote = await this.svc.mustFindById(id, { strictTenant: true });
    return ok(lote);
  }

  @Get('quimicos/:quimicoId/lotes')
  async listByQuimico(
    @Param('quimicoId') quimicoId: string,
    @Query() q: QueryLotesQuimicosDto,
  ) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listLotes({ ...q, quimico_id: quimicoId });
    return page(r.items, p, limit, r.total);
  }

  @Roles('supervisor', 'admin_global')
  @Post('lotes-quimicos')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateLoteQuimicoDto, @Req() req: AuthRequest) {
    const lote = await this.svc.createLote(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'lote_quimico',
      extra: { loteId: lote.id, quimicoId: lote.quimico_id, numeroLote: lote.numero_lote },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.CREATED,
      entity: 'lote_quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(lote);
  }

  @Roles('supervisor', 'admin_global')
  @Patch('lotes-quimicos/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLoteQuimicoDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['numero_lote', 'proveedor_id', 'dom', 'fecha_vencimiento']);
    if (
      Object.keys((req.body as Record<string, unknown>) ?? {}).some(
        (k) => !ALLOWED.has(k),
      )
    ) {
      throw new AppError({
        code: ErrorCodes.LOTE_QUIMICO_FIELD_IMMUTABLE,
        message: 'Solo se pueden modificar numero_lote, proveedor_id, dom y fecha_vencimiento',
        status: 400,
      });
    }

    const updated = await this.svc.updateLote(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'lote_quimico',
      extra: { loteId: id, fields: Object.keys(dto) },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.UPDATED,
      entity: 'lote_quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('supervisor', 'admin_global')
  @Post('lotes-quimicos/:id/ajuste')
  async ajustar(
    @Param('id') id: string,
    @Body() dto: AjusteLoteQuimicoDto,
    @Req() req: AuthRequest,
  ) {
    const updated = await this.svc.ajustarLote(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.AJUSTADO,
      entity: 'lote_quimico',
      extra: { loteId: id, cantidad: dto.cantidad, observaciones: dto.observaciones },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.AJUSTADO,
      entity: 'lote_quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete('lotes-quimicos/:id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteLote(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'lote_quimico',
      extra: { loteId: id },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.DELETED,
      entity: 'lote_quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
