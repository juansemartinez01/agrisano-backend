import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import { startTracing } from './infra/observability/tracing/tracing';
import { initSentry } from './infra/observability/sentry/sentry';
import { metricsMiddleware } from './common/middlewares/metrics.middleware';
import { MetricsService } from './infra/observability/prometheus/metrics.service';

function parseBool(v: any, def = false) {
  if (v === true || v === false) return v;
  if (v === null || v === undefined) return def;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'si'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return def;
}

function parseList(v?: string): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

async function bootstrap() {
  // ✅ observability bootstrap (opt-in por env)
  await startTracing();
  initSentry();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Nest usa el logger de pino
  app.useLogger(app.get(Logger));

  // ==========================
  // ✅ Security: request size limits
  // ==========================
  const bodyLimit = process.env.BODY_LIMIT ?? '1mb';
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

  // ==========================
  // ✅ Security: ValidationPipe global (pro)
  // ==========================
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ==========================
  // ✅ Security: Helmet
  // ==========================
  const helmetEnabled = parseBool(process.env.HELMET_ENABLED, true);
  if (helmetEnabled) {
    app.use(
      helmet({
        // si más adelante metés swagger y te rompe CSP, lo ajustamos acá
        contentSecurityPolicy: false,
      }),
    );
  }

  // ==========================
  // ✅ Security: CORS por env
  // ==========================
  const corsEnabled = parseBool(process.env.CORS_ENABLED, true);
  if (corsEnabled) {
    const origins = parseList(process.env.CORS_ORIGINS);
    const allowCredentials = parseBool(process.env.CORS_CREDENTIALS, false);

    app.enableCors({
      credentials: allowCredentials,
      origin: (origin, cb) => {
        // permitir server-to-server / Postman / curl (sin Origin)
        if (!origin) return cb(null, true);

        // si no configuraste lista, permitimos todo en dev
        if (origins.length === 0) return cb(null, true);

        // match exacto
        if (origins.includes(origin)) return cb(null, true);

        return cb(new Error(`CORS blocked for origin: ${origin}`), false);
      },
    });
  }

  // ✅ metrics middleware (si querés desactivar por env, lo hacemos)
  const metrics = app.get(MetricsService);
  app.use(metricsMiddleware(metrics));

  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
