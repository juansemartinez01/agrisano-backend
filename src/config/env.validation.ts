import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

function toNumber(v: any, def: number) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toBool(v: any, def: boolean) {
  if (v === null || v === undefined || v === '') return def;
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'yes', 'si'].includes(s)) return true;
  if (['false', '0', 'no'].includes(s)) return false;
  return def;
}

class EnvVars {
  // ==========================
  // Base
  // ==========================
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  @Transform(({ value }) => toNumber(value, 3000))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  // ==========================
  // JWT
  // ==========================
  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN!: string;

  // ==========================
  // Seed admin
  // ==========================
  @IsString()
  SEED_ADMIN_EMAIL!: string;

  @IsString()
  SEED_ADMIN_PASSWORD!: string;

  // ==========================
  // Audit
  // ==========================
  @IsOptional()
  @IsString()
  AUDIT_RETENTION_DAYS?: string;

  @IsOptional()
  @IsString()
  AUDIT_CLEANUP_CRON?: string;

  // ==========================
  // Tenancy
  // ==========================
  @IsOptional()
  @IsString()
  SEED_TENANT_ID?: string;

  @Transform(({ value }) => toBool(value, false))
  @IsBoolean()
  @IsOptional()
  TENANCY_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  TENANCY_HEADER?: string;

  @Transform(({ value }) => toBool(value, false))
  @IsBoolean()
  @IsOptional()
  TENANCY_REQUIRED?: boolean;

  // ==========================
  // Security base
  // ==========================
  @IsOptional()
  @IsString()
  BODY_LIMIT?: string; // ej: '1mb'

  @Transform(({ value }) => toBool(value, true))
  @IsBoolean()
  @IsOptional()
  HELMET_ENABLED?: boolean;

  @Transform(({ value }) => toBool(value, true))
  @IsBoolean()
  @IsOptional()
  CORS_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string; // comma-separated

  @Transform(({ value }) => toBool(value, false))
  @IsBoolean()
  @IsOptional()
  CORS_CREDENTIALS?: boolean;

  // ==========================
  // Rate limiting (Throttler)
  // ==========================
  @Transform(({ value }) => toNumber(value, 60))
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_TTL?: number;

  @Transform(({ value }) => toNumber(value, 300))
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT?: number;

  // ==========================
  // Observability
  // ==========================
  @IsOptional()
  @IsString()
  SERVICE_NAME?: string;

  // Prometheus
  @IsOptional()
  @IsString()
  METRICS_ENABLED?: string;

  // OpenTelemetry
  @IsOptional()
  @IsString()
  OTEL_ENABLED?: string;

  @IsOptional()
  @IsString()
  OTEL_SERVICE_NAME?: string;

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  // Sentry
  @IsOptional()
  @IsString()
  SENTRY_ENABLED?: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SENTRY_TRACES_SAMPLE_RATE?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvVars, config, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(
      `Invalid environment variables:\n${errors
        .map((e) => JSON.stringify(e.constraints))
        .join('\n')}`,
    );
  }

  return env;
}
