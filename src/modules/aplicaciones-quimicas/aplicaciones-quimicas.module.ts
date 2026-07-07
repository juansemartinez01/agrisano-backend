import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { SiembraModule } from 'src/modules/siembra/siembra.module';
import { MesasModule } from 'src/modules/mesas/mesas.module';
import { LotesQuimicosModule } from 'src/modules/lotes-quimicos/lotes-quimicos.module';
import { AplicacionQuimica } from './entities/aplicacion-quimica.entity';
import { AplicacionQuimicaDetalle } from './entities/aplicacion-quimica-detalle.entity';
import { AplicacionQuimicaBandeja } from './entities/aplicacion-quimica-bandeja.entity';
import { AplicacionQuimicaMesa } from './entities/aplicacion-quimica-mesa.entity';
import { AplicacionesQuimicasService } from './aplicaciones-quimicas.service';
import { AplicacionesQuimicasController } from './aplicaciones-quimicas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AplicacionQuimica,
      AplicacionQuimicaDetalle,
      AplicacionQuimicaBandeja,
      AplicacionQuimicaMesa,
    ]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
    SiembraModule,
    MesasModule,
    LotesQuimicosModule,
  ],
  providers: [AplicacionesQuimicasService],
  controllers: [AplicacionesQuimicasController],
})
export class AplicacionesQuimicasModule {}
