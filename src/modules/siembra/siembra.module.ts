import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { LotesModule } from 'src/modules/lotes/lotes.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Siembra } from './entities/siembra.entity';
import { Bandeja } from './entities/bandeja.entity';
import { SiembraService } from './siembra.service';
import { BandejaService } from './bandeja.service';
import { SiembraController } from './siembra.controller';
import { BandejaController } from './bandeja.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Siembra, Bandeja]),
    TenancyModule,
    AuditModule,
    LotesModule,
    EstablecimientosModule,
  ],
  providers: [SiembraService, BandejaService],
  controllers: [SiembraController, BandejaController],
  exports: [SiembraService, BandejaService],
})
export class SiembraModule {}
