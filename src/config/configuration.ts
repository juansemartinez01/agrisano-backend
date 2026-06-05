export default () => ({
  // ==========================
  // Base
  // ==========================
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),

  // ==========================
  // Database
  // ==========================
  db: {
    url: process.env.DATABASE_URL!,
  },

  // ==========================
  // JWT
  // ==========================
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  // ==========================
  // Tenancy
  // ==========================
  tenancy: {
    enabled:
      String(process.env.TENANCY_ENABLED ?? 'false').toLowerCase() === 'true',
    required:
      String(process.env.TENANCY_REQUIRED ?? 'false').toLowerCase() === 'true',
    header: process.env.TENANCY_HEADER ?? 'x-tenant-id',
    seedTenantId: process.env.SEED_TENANT_ID ?? null,
  },

  // ==========================
  // Security base
  // ==========================
  security: {
    bodyLimit: process.env.BODY_LIMIT ?? '1mb',

    helmet: {
      enabled:
        String(process.env.HELMET_ENABLED ?? 'true').toLowerCase() === 'true',
    },

    cors: {
      enabled:
        String(process.env.CORS_ENABLED ?? 'true').toLowerCase() === 'true',
      origins: (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      credentials:
        String(process.env.CORS_CREDENTIALS ?? 'false').toLowerCase() ===
        'true',
    },
  },

  // ==========================
  // Rate limiting
  // ==========================
  throttling: {
    ttl: Number(process.env.THROTTLE_TTL ?? 60),
    limit: Number(process.env.THROTTLE_LIMIT ?? 300),
  },

  observability: {
    serviceName: process.env.SERVICE_NAME ?? 'api',

    metrics: {
      enabled:
        String(process.env.METRICS_ENABLED ?? 'true').toLowerCase() === 'true',
    },

    otel: {
      enabled:
        String(process.env.OTEL_ENABLED ?? 'false').toLowerCase() === 'true',
      serviceName: process.env.OTEL_SERVICE_NAME ?? null,
      exporterOtlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    },

    sentry: {
      enabled:
        String(process.env.SENTRY_ENABLED ?? 'false').toLowerCase() === 'true',
      dsn: process.env.SENTRY_DSN ?? null,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    },
  },
  // ==========================
  // Files
  // ==========================
  files: {
    driver: process.env.FILES_DRIVER ?? 'remote',

    maxBytes: Number(process.env.FILES_MAX_BYTES ?? 15 * 1024 * 1024),

    allowedMime: (process.env.FILES_ALLOWED_MIME ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),

    remote: {
      apiBase:
        process.env.FILES_API_BASE?.trim() ||
        process.env.IMAGES_API_BASE?.trim() ||
        null,

      apiKey:
        process.env.FILES_API_KEY?.trim() ||
        process.env.IMAGES_API_KEY?.trim() ||
        null,

      tenantKey:
        process.env.FILES_TENANT_KEY?.trim() ||
        process.env.IMAGES_TENANT_KEY?.trim() ||
        null,

      cdnBase:
        process.env.FILES_CDN_BASE?.trim() ||
        process.env.IMAGES_CLOUDFRONT_BASE?.trim() ||
        null,
    },

    s3: {
      region: process.env.AWS_REGION ?? null,
      bucket: process.env.FILES_BUCKET ?? null,
      prefix: process.env.FILES_PREFIX ?? 'files',
    },
  },
});
