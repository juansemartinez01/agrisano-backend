import { Module } from '@nestjs/common';
import { MetricsController } from './prometheus/metrics.controller';
import { MetricsService } from './prometheus/metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
