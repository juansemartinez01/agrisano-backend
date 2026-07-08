import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { Marca } from './entities/marca.entity';
import { MarcasService } from './marcas.service';
import { MarcasController } from './marcas.controller';
import { AdminMarcasController } from './admin-marcas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Marca]), TenancyModule, AuditModule],
  providers: [MarcasService],
  controllers: [MarcasController, AdminMarcasController],
  exports: [MarcasService],
})
export class MarcasModule {}
