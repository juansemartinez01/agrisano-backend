import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new client.Registry();

  // métricas HTTP
  readonly httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  // ✅ errores 4xx / 5xx (para alertas)
  readonly httpRequests4xxTotal = new client.Counter({
    name: 'http_requests_4xx_total',
    help: 'Total HTTP 4xx responses',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly httpRequests5xxTotal = new client.Counter({
    name: 'http_requests_5xx_total',
    help: 'Total HTTP 5xx responses',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  onModuleInit() {
    // default node/process metrics
    this.registry.setDefaultLabels({
      service: process.env.SERVICE_NAME ?? 'api',
      env: process.env.NODE_ENV ?? 'development',
    });

    client.collectDefaultMetrics({ register: this.registry });
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
