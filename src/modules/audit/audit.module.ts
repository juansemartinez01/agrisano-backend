import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditCleanupJob } from './audit.cleanup';
import { AdminAuditController } from './admin-audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), ScheduleModule.forRoot()],
  providers: [AuditService, AuditCleanupJob],
  exports: [AuditService],
  controllers: [AdminAuditController],
})
export class AuditModule {}
