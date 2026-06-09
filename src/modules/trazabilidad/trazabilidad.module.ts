import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { CosechaModule } from 'src/modules/cosecha/cosecha.module';
import { MesasModule } from 'src/modules/mesas/mesas.module';
import { TrazabilidadService } from './trazabilidad.service';
import { TrazabilidadController } from './trazabilidad.controller';

@Module({
  imports: [TenancyModule, CosechaModule, MesasModule],
  providers: [TrazabilidadService],
  controllers: [TrazabilidadController],
  exports: [],
})
export class TrazabilidadModule {}
