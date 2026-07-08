import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { MarcasModule } from 'src/modules/marcas/marcas.module';
import { Quimico } from './entities/quimico.entity';
import { PrincipioActivo } from './entities/principio-activo.entity';
import { QuimicoPrincipioActivo } from './entities/quimico-principio-activo.entity';
import { QuimicosService } from './quimicos.service';
import { PrincipiosActivosService } from './principios-activos.service';
import { QuimicosController } from './quimicos.controller';
import { PrincipiosActivosController } from './principios-activos.controller';
import { AdminQuimicosController } from './admin-quimicos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quimico, PrincipioActivo, QuimicoPrincipioActivo]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
    MarcasModule,
  ],
  providers: [QuimicosService, PrincipiosActivosService],
  controllers: [QuimicosController, PrincipiosActivosController, AdminQuimicosController],
  exports: [QuimicosService, PrincipiosActivosService],
})
export class QuimicosModule {}
