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
import { LotesService, AUDIT } from './lotes.service';
import { CreateLoteDto } from './dto/create-lote.dto';
import { UpdateLoteDto } from './dto/update-lote.dto';
import { QueryLotesDto } from './dto/query-lotes.dto';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lotes')
export class LotesController {
  constructor(
    private readonly svc: LotesService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  // All authenticated users — no @Roles (RolesGuard passes when required.length === 0)
  @Get()
  async list(@Query() q: QueryLotesDto, @Req() req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listLotes(q);
    return page(r.items, p, limit, r.total);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const lote = await this.svc.mustFindById(id, { strictTenant: true });
    return ok(lote);
  }

  @Roles('supervisor', 'admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateLoteDto, @Req() req: AuthRequest) {
    const lote = await this.svc.createLote(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'lote',
      extra: { loteId: lote.id, tipo: lote.tipo, numero_lote: lote.numero_lote },
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
      entity: 'lote',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(lote);
  }

  @Roles('supervisor', 'admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLoteDto,
    @Req() req: AuthRequest,
  ) {
    // tipo immutability guard — must be first
    if ('tipo' in (req.body ?? {})) {
      throw new AppError({
        code: ErrorCodes.LOTE_TIPO_IMMUTABLE,
        message: 'El campo tipo no puede ser modificado',
        status: 400,
      });
    }

    const updated = await this.svc.updateLote(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'lote',
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
      entity: 'lote',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteLote(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'lote',
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
      entity: 'lote',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
