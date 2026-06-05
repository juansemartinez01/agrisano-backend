import { Brackets, IsNull, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { tenantContext } from 'src/modules/tenancy/tenant-context';

function currentTenantId(): string | null {
  const store = (tenantContext as any).getStore?.();
  return store?.tenantId ?? null;
}

/**
 * Aplica scope de tenant a un QueryBuilder.
 *
 * Reglas:
 * - Si NO hay tenant en contexto:
 *    - allowGlobal=false -> no devuelve nada (fail-closed)
 *    - allowGlobal=true  -> solo tenant_id IS NULL (global)
 *
 * - Si hay tenant:
 *    - allowGlobal=false -> tenant_id = :tenantId
 *    - allowGlobal=true  -> (tenant_id = :tenantId OR tenant_id IS NULL)
 *
 * Nota: asume que la entidad tiene columna `tenant_id`.
 */
export function applyTenantScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  opts?: { allowGlobal?: boolean; column?: string },
): SelectQueryBuilder<T> {
  const tenantId = currentTenantId();
  const col = opts?.column ?? 'tenant_id';

  if (!tenantId) {
    if (opts?.allowGlobal) {
      qb.andWhere(`${alias}.${col} IS NULL`);
    } else {
      qb.andWhere('1=0');
    }
    return qb;
  }

  if (opts?.allowGlobal) {
    qb.andWhere(
      new Brackets((b) => {
        b.where(`${alias}.${col} = :tenantId`, { tenantId }).orWhere(
          `${alias}.${col} IS NULL`,
        );
      }),
    );
    return qb;
  }

  qb.andWhere(`${alias}.${col} = :tenantId`, { tenantId });
  return qb;
}