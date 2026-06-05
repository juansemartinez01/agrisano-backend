import { BadRequestException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { TenancyService } from '../../modules/tenancy/tenancy.service';

export function requireTenantId(tenancy: TenancyService): string {
  const tenantId = tenancy.getTenantId();
  if (!tenantId) throw new BadRequestException('Missing tenant_id');
  return tenantId;
}

/**
 * Aplica un filtro por tenant_id al QueryBuilder.
 * - alias: alias de la tabla principal (ej: 'u', 'fo', etc.)
 * - paramName: para evitar colisiones si se usa varias veces
 */
export function qbTenantWhere<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  tenantId: string,
  paramName = 'tenantId',
): SelectQueryBuilder<T> {
  return qb.andWhere(`${alias}.tenant_id = :${paramName}`, {
    [paramName]: tenantId,
  });
}

/** Variante cómoda: toma el tenantId del TenancyService */
export function qbTenantWhereFromCtx<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  tenancy: TenancyService,
  paramName = 'tenantId',
): SelectQueryBuilder<T> {
  const tenantId = requireTenantId(tenancy);
  return qbTenantWhere(qb, alias, tenantId, paramName);
}

/** Variante opcional: si no hay tenant, no filtra (para endpoints "global") */
export function qbTenantWhereOptional<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  tenancy: TenancyService,
  paramName = 'tenantId',
): SelectQueryBuilder<T> {
  const tenantId = tenancy.getTenantId();
  if (!tenantId) return qb;
  return qbTenantWhere(qb, alias, tenantId, paramName);
}
