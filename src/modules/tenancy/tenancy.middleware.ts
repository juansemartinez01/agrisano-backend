import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenant-context';

function headerValue(req: Request, name: string): string | null {
  const v = req.headers[name.toLowerCase()];
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ? String(v[0]) : null;
  return String(v);
}

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(private readonly cfg: ConfigService) {}

  use(
    req: Request & { user?: any; tenantId?: any; tenantKey?: any },
    _res: Response,
    next: NextFunction,
  ) {
    const enabled = Boolean(this.cfg.get<boolean>('tenancy.enabled'));

    const required = Boolean(this.cfg.get<boolean>('tenancy.required'));

    const headerName = String(
      this.cfg.get<string>('tenancy.header') ?? 'x-tenant-id',
    ).toLowerCase();


    // 1) Preferir JWT (si existe) — opción A pro
    const jwtTenantId = req.user?.tenant_id ?? null;
    const jwtTenantKey = req.user?.tenant_key ?? null;

    // 2) Fallback a headers (para login/register o integraciones)
    const hTenantId = headerValue(req, 'x-tenant-id');
    const hTenantKey = headerValue(req, 'x-tenant-key');

    const tenantId = jwtTenantId ?? hTenantId ?? null;
    const tenantKey = jwtTenantKey ?? hTenantKey ?? null;

    // Validación "required": considera JWT o header (según TENANCY_HEADER)
    const primaryFromJwt =
      headerName === 'x-tenant-id'
        ? jwtTenantId
        : headerName === 'x-tenant-key'
          ? jwtTenantKey
          : null;

    const primaryFromHeader = headerValue(req, headerName);
    const primary = primaryFromJwt ?? primaryFromHeader;

    if (required && !primary) {
      throw new BadRequestException(
        `Missing tenant (jwt or header): ${headerName}`,
      );
    }

    req.tenantId = tenantId;
    req.tenantKey = tenantKey;

    const requestId = (req as any).id ?? null;

    tenantContext.run(
      { tenantId: req.tenantId, tenantKey: req.tenantKey, requestId },
      () => next(),
    );
  }
}
