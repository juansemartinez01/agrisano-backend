import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Receta } from './entities/receta.entity';
import { RecetasService } from './recetas.service';
import { RecetasController } from './recetas.controller';
import { AdminRecetasController } from './admin-recetas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receta]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
  ],
  providers: [RecetasService],
  controllers: [RecetasController, AdminRecetasController],
  exports: [RecetasService],
})
export class RecetasModule {}
