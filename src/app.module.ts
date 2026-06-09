import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DbModule } from './infra/db/db.module';
import { HealthModule } from './infra/health/health.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { LoggingModule } from './infra/logging/logging.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { FilesModule } from './modules/files/files.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { EstablecimientosModule } from './modules/establecimientos/establecimientos.module';
import { LotesModule } from './modules/lotes/lotes.module';
import { SiembraModule } from './modules/siembra/siembra.module';
import { RecetasModule } from './modules/recetas/recetas.module';
import { QuimicosModule } from './modules/quimicos/quimicos.module';
import { StockMovimientosModule } from './modules/stock-movimientos/stock-movimientos.module';
import { TunelesModule } from './modules/tuneles/tuneles.module';
import { MesasModule } from './modules/mesas/mesas.module';
import { AplicacionesQuimicasModule } from './modules/aplicaciones-quimicas/aplicaciones-quimicas.module';
import { TrasplanteModule } from './modules/trasplante/trasplante.module';
import { CosechaModule } from './modules/cosecha/cosecha.module';

import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from './infra/observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),

    // ✅ Rate limit base (global)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const ttl = Number(cfg.get('THROTTLE_TTL') ?? 60); // seconds
        const limit = Number(cfg.get('THROTTLE_LIMIT') ?? 300); // req/ttl por IP
        return [{ ttl, limit }];
      },
    }),

    LoggingModule,
    DbModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AdminModule,
    AuditModule,
    FilesModule,
    TenancyModule,
    EstablecimientosModule,
    LotesModule,
    SiembraModule,
    RecetasModule,
    QuimicosModule,
    StockMovimientosModule,
    TunelesModule,
    MesasModule,
    AplicacionesQuimicasModule,
    TrasplanteModule,
    CosechaModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },

    // ✅ Guard global de throttling (se puede ajustar por endpoint con @Throttle)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
