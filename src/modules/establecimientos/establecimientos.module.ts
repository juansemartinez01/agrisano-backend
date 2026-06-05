import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from 'src/modules/audit/audit.module';
import { TenancyModule } from 'src/modules/tenancy/tenancy.module';
import { UsersModule } from 'src/modules/users/users.module';
import { Establecimiento } from './entities/establecimiento.entity';
import { UsuarioEstablecimiento } from './entities/usuario-establecimiento.entity';
import { EstablecimientosService } from './establecimientos.service';
import { EstablecimientosController } from './establecimientos.controller';
import { AdminEstablecimientosController } from './admin-establecimientos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Establecimiento, UsuarioEstablecimiento]),
    TenancyModule,
    AuditModule,
    UsersModule,
  ],
  providers: [EstablecimientosService],
  controllers: [EstablecimientosController, AdminEstablecimientosController],
  exports: [EstablecimientosService],
})
export class EstablecimientosModule {}
