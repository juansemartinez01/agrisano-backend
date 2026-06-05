import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Roles('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: QueryAuditLogsDto) {
    return this.audit.list(q);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const row = await this.audit.getById(id);
    return row ? { ok: true, item: row } : { ok: false, message: 'Not found' };
  }
}
