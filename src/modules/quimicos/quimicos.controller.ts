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
import { QuimicosService, AUDIT } from './quimicos.service';
import { CreateQuimicoDto } from './dto/create-quimico.dto';
import { UpdateQuimicoDto } from './dto/update-quimico.dto';
import { QueryQuimicosDto } from './dto/query-quimicos.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quimicos')
export class QuimicosController {
  constructor(
    private readonly svc: QuimicosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async list(@Query() q: QueryQuimicosDto, @Req() _req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listQuimicos(q);
    return page(r.items, p, limit, r.total);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const quimico = await this.svc.getQuimicoWithPrincipios(id);
    return ok(quimico);
  }

  @Roles('supervisor', 'admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateQuimicoDto, @Req() req: AuthRequest) {
    const quimico = await this.svc.createQuimico(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.QUIMICO_CREATED,
      entity: 'quimico',
      extra: {
        quimicoId: quimico.id,
        nombre: quimico.nombre,
        establecimiento_id: quimico.establecimiento_id,
      },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.QUIMICO_CREATED,
      entity: 'quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(quimico);
  }

  @Roles('supervisor', 'admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuimicoDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set([
      'nombre', 'unidad_medida', 'activo', 'principios_activos',
      'nombre_lista', 'unidad_stock', 'rate_unidad',
      'withholding_period_dias', 'manufacture_date', 'dom',
      'supplier', 'batch',
    ]);
    if (
      Object.keys((req.body as Record<string, unknown>) ?? {}).some(
        (k) => !ALLOWED.has(k),
      )
    ) {
      throw new AppError({
        code: ErrorCodes.QUIMICO_FIELD_IMMUTABLE,
        message: 'Campo no permitido. Los campos inmutables son: id, tenant_id, establecimiento_id, stock_actual',
        status: 400,
      });
    }

    const updated = await this.svc.updateQuimico(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.QUIMICO_UPDATED,
      entity: 'quimico',
      extra: { quimicoId: id, fields: Object.keys(dto) },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.QUIMICO_UPDATED,
      entity: 'quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteQuimico(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.QUIMICO_DELETED,
      entity: 'quimico',
      extra: { quimicoId: id },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.QUIMICO_DELETED,
      entity: 'quimico',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
