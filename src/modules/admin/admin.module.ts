import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminRolesController } from './admin-roles.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [UsersModule, AuditModule],
  controllers: [AdminUsersController, AdminRolesController],
})
export class AdminModule {}
