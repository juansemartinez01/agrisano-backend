import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { AuditLog, AuditKind } from './entities/audit-log.entity';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { redactPayload } from './audit.redact';
import { tenantContext } from '../tenancy/tenant-context';
import { applyTenantScope } from 'src/common/tenancy/apply-tenant-scope';

function currentTenantId(): string | null {
  const store = (tenantContext as any).getStore?.();
  const t = store?.tenantId ?? null;
  return t ? String(t) : null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    private readonly logger: PinoLogger,
  ) {}

  async write(kind: AuditKind, data: Partial<AuditLog>) {
    try {
      const redacted = redactPayload(kind, data.payload);

      // ✅ Autocompleta tenant_id desde contexto (si no viene explícito)
      const tenantId = data.tenant_id ?? currentTenantId() ?? null;

      const row = this.repo.create({
        tenant_id: tenantId,
        kind,
        request_id: data.request_id ?? 'unknown',
        method: data.method ?? null,
        path: data.path ?? null,
        status_code: data.status_code ?? null,
        action: data.action ?? null,
        entity: data.entity ?? null,
        target_user_id: data.target_user_id ?? null,
        target_role_id: data.target_role_id ?? null,
        actor_user_id: data.actor_user_id ?? null,
        actor_email: data.actor_email ?? null,
        payload: redacted ?? null, // ✅ siempre redactado
      });

      await this.repo.save(row);
    } catch (err) {
      this.logger.warn(
        { context: 'AuditService', err },
        'audit_persist_failed',
      );
    }
  }

  async list(q: QueryAuditLogsDto) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.repo.createQueryBuilder('a');

    // ✅ Tenant-only (fail-closed si no hay tenant en contexto)
    applyTenantScope(qb, 'a');

    if (q.kind) qb.andWhere('a.kind = :kind', { kind: q.kind });
    if (q.actor_user_id)
      qb.andWhere('a.actor_user_id = :actor', { actor: q.actor_user_id });
    if (q.target_user_id)
      qb.andWhere('a.target_user_id = :target', { target: q.target_user_id });
    if (q.entity) qb.andWhere('a.entity = :entity', { entity: q.entity });
    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    if (q.status_code !== undefined)
      qb.andWhere('a.status_code = :sc', { sc: q.status_code });

    if (q.from)
      qb.andWhere('a.created_at >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.created_at <= :to', { to: new Date(q.to) });

    if (q.q?.trim()) {
      const s = `%${q.q.trim()}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('a.actor_email ILIKE :s', { s })
            .orWhere('a.action ILIKE :s', { s })
            .orWhere('a.entity ILIKE :s', { s })
            .orWhere('a.path ILIKE :s', { s })
            .orWhere('a.request_id ILIKE :s', { s });
        }),
      );
    }

    qb.orderBy('a.created_at', q.order ?? 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      page,
      limit,
      total,
      items: items.map((x) => ({
        id: x.id,
        created_at: x.created_at,
        kind: x.kind,
        request_id: x.request_id,
        method: x.method,
        path: x.path,
        status_code: x.status_code,
        actor_user_id: x.actor_user_id,
        actor_email: x.actor_email,
        action: x.action,
        entity: x.entity,
        target_user_id: x.target_user_id,
        target_role_id: x.target_role_id,

        payload_preview: x.payload
          ? {
              action: x.payload?.action ?? null,
              entity: x.payload?.entity ?? null,
              message: x.payload?.message ?? null,
              extra: x.payload?.extra ?? null,
            }
          : null,
      })),
    };
  }

  async getById(id: string) {
    // ✅ tenant-only: si no hay tenant en contexto, no devolvemos nada
    const tenantId = currentTenantId();
    if (!tenantId) return null;

    const x = await this.repo.findOne({
      where: { id, tenant_id: tenantId } as any,
    });

    if (!x) return null;

    return {
      id: x.id,
      created_at: x.created_at,
      kind: x.kind,
      request_id: x.request_id,
      method: x.method,
      path: x.path,
      status_code: x.status_code,
      actor_user_id: x.actor_user_id,
      actor_email: x.actor_email,
      action: x.action,
      entity: x.entity,
      target_user_id: x.target_user_id,
      target_role_id: x.target_role_id,
      payload: x.payload, // ✅ redactado
    };
  }
}
