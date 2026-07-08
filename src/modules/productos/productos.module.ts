import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { Producto } from './entities/producto.entity';
import { Variedad } from './entities/variedad.entity';
import { ProductosService } from './productos.service';
import { VariedadesService } from './variedades.service';
import { ProductosController } from './productos.controller';
import { VariedadesController } from './variedades.controller';
import { AdminProductosController } from './admin-productos.controller';
import { AdminVariedadesController } from './admin-variedades.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Producto, Variedad]), TenancyModule, AuditModule],
  providers: [ProductosService, VariedadesService],
  controllers: [
    ProductosController,
    VariedadesController,
    AdminProductosController,
    AdminVariedadesController,
  ],
  exports: [ProductosService, VariedadesService],
})
export class ProductosModule {}
