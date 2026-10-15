import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { ReversionesController } from './reversiones.controller';
import { ReversionesService } from './reversiones.service';

// Toca tablas de varios modulos (mesas, cosechas, bandejas, historial, packing)
// con SQL directo y en una sola transaccion, sin importar los modulos de esas
// features: es la unica forma de hacerlo atomico sin acoplarlos.
@Module({
  imports: [TenancyModule, AuditModule],
  providers: [ReversionesService],
  controllers: [ReversionesController],
})
export class ReversionesModule {}
