import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { TunelesModule } from 'src/modules/tuneles/tuneles.module';
import { Mesa } from './entities/mesa.entity';
import { HistorialMesa } from './entities/historial-mesa.entity';
import { MesasService } from './mesas.service';
import { HistorialMesaService } from './historial-mesa.service';
import { MesasController } from './mesas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Mesa, HistorialMesa]),
    TenancyModule,
    AuditModule,
    TunelesModule,
    EstablecimientosModule,
  ],
  providers: [MesasService, HistorialMesaService],
  controllers: [MesasController],
  exports: [MesasService, HistorialMesaService],
})
export class MesasModule {}
