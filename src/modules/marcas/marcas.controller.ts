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
import { MarcasService, AUDIT } from './marcas.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { QueryMarcasDto } from './dto/query-marcas.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('marcas')
export class MarcasController {
  constructor(
    private readonly svc: MarcasService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async list(@Query() q: QueryMarcasDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listMarcas(q);
    return page(r.items, p, limit, r.total);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const marca = await this.svc.mustFindById(id, { strictTenant: true });
    return ok(marca);
  }

  @Roles('supervisor', 'admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMarcaDto, @Req() req: AuthRequest) {
    const marca = await this.svc.createMarca(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'marca',
      extra: { marcaId: marca.id, nombre: marca.nombre },
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
      entity: 'marca',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(marca);
  }

  @Roles('supervisor', 'admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMarcaDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['nombre', 'activo']);
    if (
      Object.keys((req.body as Record<string, unknown>) ?? {}).some(
        (k) => !ALLOWED.has(k),
      )
    ) {
      throw new AppError({
        code: ErrorCodes.MARCA_FIELD_IMMUTABLE,
        message: 'Solo se pueden modificar nombre y activo',
        status: 400,
      });
    }

    const updated = await this.svc.updateMarca(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'marca',
      extra: { marcaId: id, fields: Object.keys(dto) },
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
      entity: 'marca',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteMarca(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'marca',
      extra: { marcaId: id },
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
      entity: 'marca',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
