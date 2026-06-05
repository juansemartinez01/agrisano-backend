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
import { RecetasService, AUDIT } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { UpdateRecetaDto } from './dto/update-receta.dto';
import { QueryRecetasDto } from './dto/query-recetas.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recetas')
export class RecetasController {
  constructor(
    private readonly svc: RecetasService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async list(@Query() q: QueryRecetasDto, @Req() req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listRecetas(q);
    return page(r.items, p, limit, r.total);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const receta = await this.svc.mustFindById(id, { strictTenant: true });
    return ok(receta);
  }

  @Roles('supervisor', 'admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRecetaDto, @Req() req: AuthRequest) {
    const receta = await this.svc.createReceta(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'receta',
      extra: {
        recetaId: receta.id,
        nombre: receta.nombre,
        establecimiento_id: receta.establecimiento_id,
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
      action: AUDIT.CREATED,
      entity: 'receta',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(receta);
  }

  @Roles('supervisor', 'admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecetaDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['nombre', 'descripcion', 'activo']);
    if (
      Object.keys((req.body as Record<string, unknown>) ?? {}).some(
        (k) => !ALLOWED.has(k),
      )
    ) {
      throw new AppError({
        code: ErrorCodes.RECETA_FIELD_IMMUTABLE,
        message: 'Solo se pueden modificar nombre, descripcion y activo',
        status: 400,
      });
    }

    const updated = await this.svc.updateReceta(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'receta',
      extra: { recetaId: id, fields: Object.keys(dto) },
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
      entity: 'receta',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteReceta(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'receta',
      extra: { recetaId: id },
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
      entity: 'receta',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
