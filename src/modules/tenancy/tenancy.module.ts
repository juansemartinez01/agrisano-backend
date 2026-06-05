import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenancyMiddleware } from './tenancy.middleware';
import { TenancyService } from './tenancy.service';

@Module({
  imports: [ConfigModule], // ✅ asegura ConfigService disponible
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenancyMiddleware).forRoutes('*');
  }
}
