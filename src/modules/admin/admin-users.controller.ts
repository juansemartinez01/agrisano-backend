import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';

import { QueryUsersAdminDto } from './dto/query-users.admin.dto';
import { CreateUserAdminDto } from './dto/create-user.admin.dto';
import { UpdateUserAdminDto } from './dto/update-user.admin.dto';
import { SetUserRolesAdminDto } from './dto/set-user-roles.admin.dto';
import { UpdateUserPasswordAdminDto } from './dto/update-user-password.admin.dto';

import { PinoLogger } from 'nestjs-pino';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { AuditService } from '../audit/audit.service';

@Roles('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query() q: QueryUsersAdminDto) {
    return this.users.listAdmin(q);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const u = await this.users.getByIdAdmin(id, true);
    if (!u) return { ok: false, message: 'User not found' };

    return {
      ok: true,
      item: {
        id: u.id,
        email: u.email,
        is_active: u.is_active,
        deleted_at: u.deleted_at,
        roles: u.roles?.map((r) => r.name) ?? [],
        created_at: u.created_at,
        updated_at: u.updated_at,
      },
    };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateUserAdminDto) {
    const u = await this.users.createUserAdmin({
      email: dto.email,
      password: dto.password,
      roles: dto.roles,
    });

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'create',
      entity: 'user',
      targetUserId: u.id,
      extra: { createdEmail: u.email, roles: u.roles.map((r) => r.name) },
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
      entity: 'user',
      target_user_id: u.id,
      payload: auditPayload,
      // tenant_id: req.tenantId ?? null, // si lo tenés en el futuro
    });

    return {
      ok: true,
      item: { id: u.id, email: u.email, roles: u.roles.map((r) => r.name) },
    };
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserAdminDto,
  ) {
    const u = await this.users.updateUserAdmin(id, dto);

    if (!u) {
      const auditPayload = auditLogPayload({
        requestId: req.id,
        actorUserId: req.user?.sub,
        actorEmail: req.user?.email,
        action: 'update',
        entity: 'user',
        targetUserId: id,
        extra: { result: 'not_found', fields: Object.keys(dto) },
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
        entity: 'user',
        target_user_id: id,
        payload: auditPayload,
      });

      return { ok: false, message: 'User not found' };
    }

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'update',
      entity: 'user',
      targetUserId: id,
      extra: { fields: Object.keys(dto) },
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
      entity: 'user',
      target_user_id: id,
      payload: auditPayload,
    });

    return { ok: true };
  }

  @Patch(':id/password')
  async updatePassword(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserPasswordAdminDto,
  ) {
    const u = await this.users.updateUserPasswordAdmin(id, dto.password);

    if (!u) {
      const auditPayload = auditLogPayload({
        requestId: req.id,
        actorUserId: req.user?.sub,
        actorEmail: req.user?.email,
        action: 'update_password',
        entity: 'user',
        targetUserId: id,
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
        action: 'update_password',
        entity: 'user',
        target_user_id: id,
        payload: auditPayload,
      });

      return { ok: false, message: 'User not found' };
    }

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'update_password',
      entity: 'user',
      targetUserId: id,
    });

    this.logger.info(auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'update_password',
      entity: 'user',
      target_user_id: id,
      payload: auditPayload,
    });

    return { ok: true };
  }

  @Post(':id/roles')
  async setRoles(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SetUserRolesAdminDto,
  ) {
    const u = await this.users.setUserRoles(id, dto.roles);

    if (!u) {
      const auditPayload = auditLogPayload({
        requestId: req.id,
        actorUserId: req.user?.sub,
        actorEmail: req.user?.email,
        action: 'set_roles',
        entity: 'user',
        targetUserId: id,
        extra: { result: 'not_found', requestedRoles: dto.roles },
      });

      this.logger.warn(auditPayload, 'admin_audit');

      await this.audit.write('admin', {
        request_id: req.id,
        method: req.method,
        path: req.url,
        status_code: 404,
        actor_user_id: req.user?.sub ?? null,
        actor_email: req.user?.email ?? null,
        action: 'set_roles',
        entity: 'user',
        target_user_id: id,
        payload: auditPayload,
      });

      return { ok: false, message: 'User not found' };
    }

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'set_roles',
      entity: 'user',
      targetUserId: id,
      extra: { requestedRoles: dto.roles, roles: u.roles.map((r) => r.name) },
    });

    this.logger.info(auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 200,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'set_roles',
      entity: 'user',
      target_user_id: id,
      payload: auditPayload,
    });

    return { ok: true, roles: u.roles.map((r) => r.name) };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const ok = await this.users.softDeleteUser(id);

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'soft_delete',
      entity: 'user',
      targetUserId: id,
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
      action: 'soft_delete',
      entity: 'user',
      target_user_id: id,
      payload: auditPayload,
    });

    return ok
      ? { ok: true }
      : { ok: false, message: 'User not found or not deletable' };
  }

  @Post(':id/restore')
  async restore(@Req() req: any, @Param('id') id: string) {
    const ok = await this.users.restoreUser(id);

    const auditPayload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'restore',
      entity: 'user',
      targetUserId: id,
      extra: { ok },
    });

    (this.logger as any)[ok ? 'info' : 'warn'](auditPayload, 'admin_audit');

    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: ok ? 200 : 404,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: 'restore',
      entity: 'user',
      target_user_id: id,
      payload: auditPayload,
    });

    return ok ? { ok: true } : { ok: false, message: 'User not found' };
  }
}
