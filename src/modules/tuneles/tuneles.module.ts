import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Tunel } from './entities/tunel.entity';
import { TunelesService } from './tuneles.service';
import { TunelesController } from './tuneles.controller';
import { AdminTunelesController } from './admin-tuneles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tunel]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
  ],
  providers: [TunelesService],
  controllers: [TunelesController, AdminTunelesController],
  exports: [TunelesService],
})
export class TunelesModule {}
