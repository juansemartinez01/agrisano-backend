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
import { EstablecimientosService, AUDIT } from './establecimientos.service';
import { CreateEstablecimientoDto } from './dto/create-establecimiento.dto';
import { UpdateEstablecimientoDto } from './dto/update-establecimiento.dto';
import { QueryEstablecimientosDto } from './dto/query-establecimientos.dto';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';

type AuthRequest = Request & { user: JwtPayload; id: string; tenantId?: string | null; method: string; url: string };

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('establecimientos')
export class EstablecimientosController {
  constructor(
    private readonly svc: EstablecimientosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Roles('admin_global', 'supervisor', 'operario')
  @Get()
  async list(@Query() q: QueryEstablecimientosDto, @Req() req: AuthRequest) {
    const actor = { userId: req.user.sub, roles: req.user.roles };
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listForUser(q, actor);
    return page(r.items, p, limit, r.total);
  }

  @Roles('admin_global', 'supervisor', 'operario')
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: AuthRequest) {
    const actor = { userId: req.user.sub, roles: req.user.roles };
    const est = await this.svc.findOneForUser(id, actor);
    return ok(est);
  }

  @Roles('admin_global')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEstablecimientoDto, @Req() req: AuthRequest) {
    const est = await this.svc.createEstablecimiento(dto);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.CREATED,
      entity: 'establecimiento',
      extra: { establecimientoId: est.id, nombre: est.nombre },
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
      entity: 'establecimiento',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(est);
  }

  @Roles('admin_global')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEstablecimientoDto,
    @Req() req: AuthRequest,
  ) {
    const { updated, wasDeactivated } = await this.svc.updateEstablecimiento(
      id,
      dto,
    );

    const updatePayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.UPDATED,
      entity: 'establecimiento',
      extra: { establecimientoId: id, fields: Object.keys(dto) },
    });
    this.logger.info(updatePayload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.UPDATED,
      entity: 'establecimiento',
      tenant_id: req.tenantId ?? null,
      payload: updatePayload,
    });

    if (wasDeactivated) {
      const deactivatedPayload = auditLogPayload({
        requestId: req.id,
        actorUserId: req.user?.sub,
        actorEmail: req.user?.email,
        action: AUDIT.DEACTIVATED,
        entity: 'establecimiento',
        extra: { establecimientoId: id },
      });
      this.logger.info(deactivatedPayload, 'admin_audit');
      await this.audit.write('admin', {
        request_id: req.id,
        method: req.method,
        path: req.url,
        status_code: 200,
        actor_user_id: req.user?.sub ?? null,
        actor_email: req.user?.email ?? null,
        action: AUDIT.DEACTIVATED,
        entity: 'establecimiento',
        tenant_id: req.tenantId ?? null,
        payload: deactivatedPayload,
      });
    }

    return ok(updated);
  }

  @Roles('admin_global')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteEstablecimiento(id);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DELETED,
      entity: 'establecimiento',
      extra: { establecimientoId: id },
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
      entity: 'establecimiento',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ deleted: true });
  }

  @Roles('admin_global')
  @Post(':id/usuarios/:userId')
  @HttpCode(HttpStatus.CREATED)
  async assignUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    const assignment = await this.svc.assignUser(id, userId);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.USER_ASSIGNED,
      entity: 'establecimiento',
      targetUserId: userId,
      extra: { establecimientoId: id },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.USER_ASSIGNED,
      entity: 'establecimiento',
      target_user_id: userId,
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok(assignment);
  }

  @Roles('admin_global')
  @Delete(':id/usuarios/:userId')
  async removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: AuthRequest,
  ) {
    await this.svc.removeUser(id, userId);

    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.USER_REMOVED,
      entity: 'establecimiento',
      targetUserId: userId,
      extra: { establecimientoId: id },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.USER_REMOVED,
      entity: 'establecimiento',
      target_user_id: userId,
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({ removed: true });
  }

  @Roles('admin_global', 'supervisor')
  @Get(':id/usuarios')
  async listUsers(@Param('id') id: string, @Req() req: AuthRequest) {
    const actor = { userId: req.user.sub, roles: req.user.roles };
    const assignments = await this.svc.listUsers(id, actor);
    return ok(assignments);
  }
}
