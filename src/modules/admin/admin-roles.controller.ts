import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';

import { CreateRoleAdminDto } from './dto/create-role.admin.dto';
import { UpdateRoleAdminDto } from './dto/update-role.admin.dto';

import { PinoLogger } from 'nestjs-pino';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { AuditService } from '../audit/audit.service';

@Roles('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(
    private readonly users: UsersService,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.users.listRoles();
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateRoleAdminDto) {
    const r = await this.users.createRole(dto.name);

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'create',
      entity: 'role',
      targetRoleId: r.id,
      extra: { name: r.name },
    });

    this.logger.info(auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'create',
      entity: 'role',
      target_role_id: r.id,
      payload: auditPayload,
    });

    return { ok: true, item: { id: r.id, name: r.name } };
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRoleAdminDto,
  ) {
    if (!dto.name) return { ok: false, message: 'name is required' };

    const r = await this.users.updateRole(id, dto.name);
    if (!r) {
      const auditPayload = auditLogPayload({
        requestId: req.id,
        actorUserId: req.user?.sub,
        actorEmail: req.user?.email,
        action: 'update',
        entity: 'role',
        targetRoleId: id,
        extra: { result: 'not_found' },
      });

      this.logger.warn(auditPayload, 'admin_audit');

      await this.audit.write('admin', {
        request_id: req.id,
        method: req.method,
        path: req.url,
        status_code: 404,
        actor_user_id: req.user?.sub ?? null,
        actor_email: req.user?.email ?? null,
        action: 'update',
        entity: 'role',
        target_role_id: id,
        payload: auditPayload,
      });

      return { ok: false, message: 'Role not found' };
    }

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'update',
      entity: 'role',
      targetRoleId: id,
      extra: { name: r.name },
    });

    this.logger.info(auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'update',
      entity: 'role',
      target_role_id: id,
      payload: auditPayload,
    });

    return { ok: true };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const ok = await this.users.deleteRole(id);

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'delete',
      entity: 'role',
      targetRoleId: id,
      extra: { ok },
    });

    (this.logger as any)[ok ? 'info' : 'warn'](auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: ok ? 200 : 409,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'delete',
      entity: 'role',
      target_role_id: id,
      payload: auditPayload,
    });

    return ok
      ? { ok: true }
      : { ok: false, message: 'Role not found or not deletable' };
  }
}
