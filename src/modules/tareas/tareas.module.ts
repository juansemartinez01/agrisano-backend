import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Tarea } from './entities/tarea.entity';
import { TareasService } from './tareas.service';
import { TareasController } from './tareas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tarea]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
  ],
  providers: [TareasService],
  controllers: [TareasController],
  exports: [TareasService],
})
export class TareasModule {}
