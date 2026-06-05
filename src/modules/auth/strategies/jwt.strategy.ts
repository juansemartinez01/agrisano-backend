// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../types/jwt-payload.type';
import { TenancyService } from '../../tenancy/tenancy.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly tenancyEnabled: boolean;
  private readonly tenancyRequired: boolean;

  constructor(
    cfg: ConfigService,
    private readonly tenancy: TenancyService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.get<string>('JWT_ACCESS_SECRET'),
    });

    this.tenancyEnabled =
      String(cfg.get('TENANCY_ENABLED') ?? 'false').toLowerCase() === 'true';

    this.tenancyRequired =
      String(cfg.get('TENANCY_REQUIRED') ?? 'false').toLowerCase() === 'true';
  }

  async validate(payload: JwtPayload) {
    // payload base
    const user = {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      tenant_id: payload.tenant_id ?? null,
    };

    // ✅ Tenancy enforcement (solo si está habilitado)
    if (this.tenancyEnabled) {
      const ctxTenantId = this.tenancy.getTenantId(); // viene del middleware (header)
      if (this.tenancyRequired && !ctxTenantId) {
        throw new UnauthorizedException('Missing tenant_id');
      }

      // Si vino tenant por header/context, debe coincidir con el del token
      if (ctxTenantId && user.tenant_id && ctxTenantId !== user.tenant_id) {
        throw new UnauthorizedException('Tenant mismatch');
      }

      // Si por alguna razón el token no trae tenant_id y tenancy está required, bloqueamos
      if (this.tenancyRequired && !user.tenant_id) {
        throw new UnauthorizedException('Missing tenant_id in token');
      }

      // Si hay contexto y el token trae tenant_id null (no debería), forzamos coherencia
      if (ctxTenantId && !user.tenant_id) {
        user.tenant_id = ctxTenantId;
      }
    }

    return user;
  }
}
