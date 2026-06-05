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
import { SiembraService, AUDIT } from './siembra.service';
import { CreateSiembraDto } from './dto/create-siembra.dto';
import { UpdateSiembraDto } from './dto/update-siembra.dto';
import { QuerySiembrasDto } from './dto/query-siembras.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('siembras')
export class SiembraController {
  constructor(
    private readonly svc: SiembraService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async list(@Query() q: QuerySiembrasDto, @Req() req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listSiembras(q);
    return page(r.items, p, limit, r.total);
  }

  @Roles('operario', 'supervisor', 'admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSiembraDto, @Req() req: AuthRequest) {
    const result = await this.svc.createSiembra(dto, req.user.sub);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'siembra',
      extra: { siembraId: result.id, totalBandejas: result.bandejas.length },
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
      entity: 'siembra',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(result);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const siembra = await this.svc.getSiembraWithBandejas(id);
    return ok(siembra);
  }

  @Roles('supervisor', 'admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSiembraDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['observaciones']);
    const bodyKeys = Object.keys((req.body as Record<string, unknown>) ?? {});
    if (bodyKeys.some((k) => !ALLOWED.has(k))) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_FIELD_IMMUTABLE,
        message: 'Solo se puede modificar el campo observaciones',
        status: 400,
      });
    }

    const updated = await this.svc.updateSiembra(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'siembra',
      extra: { siembraId: id },
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
      entity: 'siembra',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteSiembra(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'siembra',
      extra: { siembraId: id },
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
      entity: 'siembra',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
