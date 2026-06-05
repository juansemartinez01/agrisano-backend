import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditCleanupJob {
  constructor(
    private readonly cfg: ConfigService,
    private readonly logger: PinoLogger,
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  @Cron(process.env.AUDIT_CLEANUP_CRON || '0 3 * * *')
  async run() {
    const days = Number(this.cfg.get<string>('AUDIT_RETENTION_DAYS') ?? '90');
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const res = await this.repo.delete({ created_at: LessThan(cutoff) });

    this.logger.info(
      { context: 'AuditCleanupJob', days, cutoff, deleted: res.affected ?? 0 },
      'audit_cleanup',
    );
  }
}
