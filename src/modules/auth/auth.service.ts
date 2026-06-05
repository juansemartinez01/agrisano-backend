import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './types/jwt-payload.type';
import { TenancyService } from '../tenancy/tenancy.service';
import { requireTenantId } from 'src/common/tenancy/tenant-query.util';

function msToDate(expiresIn: string): Date {
  const m = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!m) throw new Error(`Invalid expiresIn: ${expiresIn}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 3_600_000
          : 86_400_000;
  return new Date(Date.now() + n * mult);
}

type SignUser = {
  id: string;
  email: string;
  roles: string[];
  tenant_id: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly tenancy: TenancyService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  private accessSecret() {
    return this.cfg.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-access';
  }
  private refreshSecret() {
    return this.cfg.get<string>('JWT_REFRESH_SECRET') ?? 'change-me-refresh';
  }
  private accessExpiresIn() {
    return this.cfg.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  }
  private refreshExpiresIn() {
    return this.cfg.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
  }

  private async signAccess(user: SignUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      tenant_id: user.tenant_id,
    };

    return this.jwt.signAsync(payload, {
      secret: this.accessSecret(),
      expiresIn: this.accessExpiresIn(),
    } as JwtSignOptions);
  }

  private async signRefresh(user: SignUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      tenant_id: user.tenant_id,
    };

    return this.jwt.signAsync(payload, {
      secret: this.refreshSecret(),
      expiresIn: this.refreshExpiresIn(),
    } as JwtSignOptions);
  }

  async register(email: string, password: string) {
    const tenantId = requireTenantId(this.tenancy);

    const hash = await bcrypt.hash(password, 10);

    const user = await this.users.createUser({
      tenant_id: tenantId,
      email,
      password_hash: hash,
      roleNames: ['user'],
    });

    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.name),
      tenant_id: user.tenant_id,
    };
  }

  async login(email: string, password: string) {
    // UsersService.findByEmail ya filtra por tenant actual
    const user = await this.users.findByEmail(email);
    if (!user || !user.is_active)
      throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const roles = user.roles.map((r) => r.name);
    const tenant_id = user.tenant_id;

    const access_token = await this.signAccess({
      id: user.id,
      email: user.email,
      roles,
      tenant_id: tenant_id!,
    });

    const refresh_token = await this.signRefresh({
      id: user.id,
      email: user.email,
      roles,
      tenant_id: tenant_id!,
    });

    const token_hash = await bcrypt.hash(refresh_token, 10);
    const expires_at = msToDate(this.refreshExpiresIn());

    await this.refreshRepo.save(
      this.refreshRepo.create({
        tenant_id, // ✅ heredado de BaseEntity
        user_id: user.id,
        token_hash,
        expires_at,
        revoked_at: null,
      }),
    );

    return { access_token, refresh_token };
  }

  async refresh(refresh_token: string) {
    // 1) validar firma refresh + extraer tenant
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refresh_token, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = payload?.sub;
    const tenantId = payload?.tenant_id;
    if (!userId || !tenantId)
      throw new UnauthorizedException('Invalid refresh token');

    // 2) buscar candidatos SOLO del tenant del token
    const candidates = await this.refreshRepo.find({
      where: { tenant_id: tenantId, user_id: userId, revoked_at: IsNull() },
      order: { created_at: 'DESC' as any },
      take: 20,
      relations: { user: true },
    });

    const match = await (async () => {
      for (const row of candidates) {
        const ok = await bcrypt.compare(refresh_token, row.token_hash);
        if (ok) return row;
      }
      return null;
    })();

    if (!match) throw new UnauthorizedException('Invalid refresh token');
    if (match.expires_at.getTime() <= Date.now())
      throw new UnauthorizedException('Expired refresh token');

    // 3) rotación
    match.revoked_at = new Date();
    await this.refreshRepo.save(match);

    const roles = match.user.roles.map((r) => r.name);

    const access_token = await this.signAccess({
      id: match.user.id,
      email: match.user.email,
      roles,
      tenant_id: tenantId,
    });

    const new_refresh = await this.signRefresh({
      id: match.user.id,
      email: match.user.email,
      roles,
      tenant_id: tenantId,
    });

    const new_hash = await bcrypt.hash(new_refresh, 10);
    const expires_at = msToDate(this.refreshExpiresIn());

    await this.refreshRepo.save(
      this.refreshRepo.create({
        tenant_id: tenantId,
        user_id: match.user.id,
        token_hash: new_hash,
        expires_at,
        revoked_at: null,
      }),
    );

    return { access_token, refresh_token: new_refresh };
  }

  async logout(refresh_token: string) {
    // validamos firma para poder filtrar por tenant/user (evita escanear todo)
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refresh_token, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new BadRequestException('Refresh token not found');
    }

    const tenantId = payload?.tenant_id;
    const userId = payload?.sub;
    if (!tenantId || !userId)
      throw new BadRequestException('Refresh token not found');

    const rows = await this.refreshRepo.find({
      where: { tenant_id: tenantId, user_id: userId, revoked_at: IsNull() },
      order: { created_at: 'DESC' as any },
      take: 50,
    });

    for (const row of rows) {
      const ok = await bcrypt.compare(refresh_token, row.token_hash);
      if (ok) {
        row.revoked_at = new Date();
        await this.refreshRepo.save(row);
        return { ok: true };
      }
    }

    throw new BadRequestException('Refresh token not found');
  }
}
