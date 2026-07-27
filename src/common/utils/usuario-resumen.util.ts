import { DataSource, EntityManager } from 'typeorm';

// Shape público de "quién hizo esto" — igual en todos los módulos.
export interface UsuarioResumen {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
}

interface UsuarioRaw {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
}

// Columnas snapshot que cada tabla auditada agrega (mismo nombre en las 6).
export interface UsuarioSnapshotFields {
  usuario_email_snapshot: string | null;
  usuario_nombre_snapshot: string | null;
  usuario_apellido_snapshot: string | null;
}

/**
 * Batch lookup de usuarios por id. Select explícito: jamás exponer
 * password_hash u otros campos sensibles. No filtra por is_active/deleted_at
 * a propósito: un responsable desactivado o borrado lógicamente igual debe
 * poder identificarse en registros históricos.
 */
export async function buildUsuariosMap(
  runner: DataSource | EntityManager,
  userIds: string[],
  tenantId: string,
): Promise<Map<string, UsuarioResumen>> {
  const map = new Map<string, UsuarioResumen>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return map;

  const rows = await runner
    .createQueryBuilder()
    .select('u.id', 'id')
    .addSelect('u.nombre', 'nombre')
    .addSelect('u.apellido', 'apellido')
    .addSelect('u.email', 'email')
    .from('users', 'u')
    .where('u.id IN (:...ids)', { ids })
    .andWhere('(u.tenant_id = :tenantId OR u.tenant_id IS NULL)', { tenantId })
    .getRawMany<UsuarioRaw>();

  for (const r of rows) {
    map.set(r.id, { id: r.id, nombre: r.nombre, apellido: r.apellido, email: r.email });
  }
  return map;
}

/** Snapshot a persistir en el momento de creación de un registro auditado. */
export async function fetchUsuarioSnapshot(
  runner: DataSource | EntityManager,
  userId: string,
  tenantId: string,
): Promise<UsuarioSnapshotFields> {
  const map = await buildUsuariosMap(runner, [userId], tenantId);
  const u = map.get(userId);
  return {
    usuario_email_snapshot: u?.email ?? null,
    usuario_nombre_snapshot: u?.nombre ?? null,
    usuario_apellido_snapshot: u?.apellido ?? null,
  };
}

/**
 * Prioriza el snapshot histórico guardado en la fila; completa con el
 * usuario relacionado (join/lookup en vivo) si falta algo; devuelve null
 * solo cuando no hay ningún email recuperable de ninguna de las dos fuentes.
 */
export function resolveUsuarioResumen(
  usuario_id: string,
  snapshot: Partial<UsuarioSnapshotFields> | null | undefined,
  live: UsuarioResumen | null | undefined,
): UsuarioResumen | null {
  const email = snapshot?.usuario_email_snapshot ?? live?.email ?? null;
  if (email === null) return null;
  return {
    id: usuario_id,
    email,
    nombre: snapshot?.usuario_nombre_snapshot ?? live?.nombre ?? null,
    apellido: snapshot?.usuario_apellido_snapshot ?? live?.apellido ?? null,
  };
}
