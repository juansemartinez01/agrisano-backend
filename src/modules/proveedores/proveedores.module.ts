import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { EstablecimientosModule } from 'src/modules/establecimientos/establecimientos.module';
import { Proveedor } from './entities/proveedor.entity';
import { ProveedoresService } from './proveedores.service';
import { ProveedoresController } from './proveedores.controller';
import { AdminProveedoresController } from './admin-proveedores.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Proveedor]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
  ],
  providers: [ProveedoresService],
  controllers: [ProveedoresController, AdminProveedoresController],
  exports: [ProveedoresService],
})
export class ProveedoresModule {}
