export function auditLogPayload(params: {
  requestId?: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  entity: string;
  targetUserId?: string;
  targetRoleId?: string;
  extra?: Record<string, any>;
}) {
  const {
    requestId,
    actorUserId,
    actorEmail,
    action,
    entity,
    targetUserId,
    targetRoleId,
    extra,
  } = params;

  return {
    event: 'admin_audit',
    requestId,
    actorUserId,
    actorEmail,
    action,
    entity,
    targetUserId,
    targetRoleId,
    ...(extra ?? {}),
  };
}
