import type { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../../infra/observability/prometheus/metrics.service';



function normalizePath(p: string): string {
  // uuid v4-ish
  const uuid =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

  // números (ids)
  const num = /\/\d+(?=\/|$)/g;

  return p.replace(uuid, ':id').replace(num, '/:id');
}

function getRouteLabel(req: any): string {
  const route = req.route?.path;
  const baseUrl = req.baseUrl;

  if (route && baseUrl) return `${baseUrl}${route}`;
  if (route) return String(route);

  const raw = String(req.path || req.url || 'unknown').split('?')[0];
  return normalizePath(raw);
}


export function metricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction) => {

    if (req.path === '/metrics') return next();

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const seconds = Number(end - start) / 1e9;

      const method = req.method;
      const route = getRouteLabel(req);
      const status = String(res.statusCode);

            const sc = res.statusCode;

            if (sc >= 400 && sc < 500) {
              metrics.httpRequests4xxTotal.inc(
                { method, route, status_code: status },
                1,
              );
            } else if (sc >= 500 && sc < 600) {
              metrics.httpRequests5xxTotal.inc(
                { method, route, status_code: status },
                1,
              );
            }


      metrics.httpRequestsTotal.inc({ method, route, status_code: status }, 1);
      metrics.httpRequestDuration.observe(
        { method, route, status_code: status },
        seconds,
      );
    });

    next();
  };
}
