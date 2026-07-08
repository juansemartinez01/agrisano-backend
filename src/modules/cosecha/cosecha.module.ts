import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { MesasModule } from 'src/modules/mesas/mesas.module';
import { ProductosModule } from 'src/modules/productos/productos.module';
import { Cosecha } from './entities/cosecha.entity';
import { CosechaService } from './cosecha.service';
import { CosechaController } from './cosecha.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cosecha]),
    TenancyModule,
    AuditModule,
    MesasModule,
    ProductosModule,
  ],
  providers: [CosechaService],
  controllers: [CosechaController],
  exports: [CosechaService],
})
export class CosechaModule {}
