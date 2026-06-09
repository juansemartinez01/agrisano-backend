import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { CosechaModule } from 'src/modules/cosecha/cosecha.module';
import { LotePacking } from './entities/lote-packing.entity';
import { LotePackingCategoria } from './entities/lote-packing-categoria.entity';
import { PackingService } from './packing.service';
import { PackingController } from './packing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LotePacking, LotePackingCategoria]),
    TenancyModule,
    AuditModule,
    CosechaModule,
  ],
  providers: [PackingService],
  controllers: [PackingController],
  exports: [],
})
export class PackingModule {}
