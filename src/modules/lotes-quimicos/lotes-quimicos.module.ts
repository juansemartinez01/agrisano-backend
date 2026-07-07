import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { QuimicosModule } from 'src/modules/quimicos/quimicos.module';
import { ProveedoresModule } from 'src/modules/proveedores/proveedores.module';
import { LoteQuimico } from './entities/lote-quimico.entity';
import { LotesQuimicosService } from './lotes-quimicos.service';
import { LotesQuimicosController } from './lotes-quimicos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoteQuimico]),
    TenancyModule,
    AuditModule,
    QuimicosModule,
    ProveedoresModule,
  ],
  providers: [LotesQuimicosService],
  controllers: [LotesQuimicosController],
  exports: [LotesQuimicosService],
})
export class LotesQuimicosModule {}
