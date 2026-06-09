import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { MesasModule } from 'src/modules/mesas/mesas.module';
import { SiembraModule } from 'src/modules/siembra/siembra.module';
import { TunelesModule } from 'src/modules/tuneles/tuneles.module';
import { MesaBandeja } from './entities/mesa-bandeja.entity';
import { TrasplanteService } from './trasplante.service';
import { TrasplanteController } from './trasplante.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MesaBandeja]),
    TenancyModule,
    AuditModule,
    MesasModule,
    SiembraModule,
    TunelesModule,
  ],
  providers: [TrasplanteService],
  controllers: [TrasplanteController],
})
export class TrasplanteModule {}
