import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
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
import { ok } from 'src/common/http/api-response';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { PrincipiosActivosService } from './principios-activos.service';
import { AUDIT } from './quimicos.service';
import { CreatePrincipioActivoDto } from './dto/create-principio-activo.dto';
import { UpdatePrincipioActivoDto } from './dto/update-principio-activo.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('principios-activos')
export class PrincipiosActivosController {
  constructor(
    private readonly svc: PrincipiosActivosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async listAll() {
    const list = await this.svc.listAll();
    return ok(list);
  }

  @Roles('admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePrincipioActivoDto, @Req() req: AuthRequest) {
    const pa = await this.svc.create(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.PA_CREATED,
      entity: 'principio_activo',
      extra: { paId: pa.id, nombre: pa.nombre },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.PA_CREATED,
      entity: 'principio_activo',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(pa);
  }

  @Roles('admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePrincipioActivoDto,
    @Req() req: AuthRequest,
  ) {
    const updated = await this.svc.update(id, dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.PA_UPDATED,
      entity: 'principio_activo',
      extra: { paId: id, nombre: dto.nombre },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.PA_UPDATED,
      entity: 'principio_activo',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.delete(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.PA_DELETED,
      entity: 'principio_activo',
      extra: { paId: id },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.PA_DELETED,
      entity: 'principio_activo',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }
}
