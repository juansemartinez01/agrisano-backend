import type { AuditKind } from './entities/audit-log.entity';

function truncate(v: string, max = 500) {
  if (!v) return v;
  return v.length <= max ? v : v.slice(0, max) + '…';
}

function deepRedact(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) return obj.map(deepRedact);

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();

    // claves sensibles típicas
    if (
      key.includes('password') ||
      key.includes('pass') ||
      key.includes('token') ||
      key.includes('authorization') ||
      key.includes('cookie') ||
      key.includes('secret') ||
      key.includes('refresh')
    ) {
      out[k] = '[REDACTED]';
      continue;
    }

    out[k] = deepRedact(v);
    if (typeof out[k] === 'string') out[k] = truncate(out[k], 500);
  }
  return out;
}

export function redactPayload(kind: AuditKind, payload: any) {
  // base: sanitize general
  const safe = deepRedact(payload ?? null);

  // además, acotamos por kind (para que quede liviano)
  if (kind === 'error_5xx') {
    return {
      name: truncate(String(safe?.name ?? ''), 120),
      message: truncate(String(safe?.message ?? ''), 500),
      code: safe?.code ?? safe?.statusCode ?? null,
    };
  }

  // admin: conservar solo lo útil para auditoría
  return {
    requestId: safe?.requestId ?? safe?.request_id ?? null,
    actorUserId: safe?.actorUserId ?? safe?.actor_user_id ?? null,
    actorEmail: safe?.actorEmail ?? safe?.actor_email ?? null,
    action: safe?.action ?? null,
    entity: safe?.entity ?? null,
    targetUserId: safe?.targetUserId ?? safe?.target_user_id ?? null,
    targetRoleId: safe?.targetRoleId ?? safe?.target_role_id ?? null,
    extra: safe?.extra ?? null,
  };
}
