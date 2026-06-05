import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { AuditModule } from 'src/modules/audit/audit.module';
import { QuimicosModule } from 'src/modules/quimicos/quimicos.module';
import { MovimientoStock } from './entities/movimiento-stock.entity';
import { StockMovimientosService } from './stock-movimientos.service';
import { StockMovimientosController } from './stock-movimientos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MovimientoStock]),
    TenancyModule,
    AuditModule,
    QuimicosModule,
  ],
  providers: [StockMovimientosService],
  controllers: [StockMovimientosController],
})
export class StockMovimientosModule {}
