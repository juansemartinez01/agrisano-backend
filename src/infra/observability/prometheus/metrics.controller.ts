import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metricsText() {
    // el header real lo setea prom-client; este es compatible igual
    const body = await this.metrics.metricsText();
    return body;
  }
}
