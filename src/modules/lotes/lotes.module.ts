import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { Lote } from './entities/lote.entity';
import { LotesService } from './lotes.service';
import { LotesController } from './lotes.controller';
import { AdminLotesController } from './admin-lotes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lote]), TenancyModule, AuditModule],
  providers: [LotesService],
  controllers: [LotesController, AdminLotesController],
  exports: [LotesService],
})
export class LotesModule {}
