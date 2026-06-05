import { Brackets, SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export function clampPagination(page?: number, limit?: number, max = 200) {
  const p = Math.max(1, Number(page ?? 1));
  const l = Math.min(max, Math.max(1, Number(limit ?? 20)));
  const skip = (p - 1) * l;
  return { page: p, limit: l, skip };
}

export function applySort<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  sortBy?: string,
  sortOrder?: 'ASC' | 'DESC',
  allowed: string[] = [],
  fallback: { by: string; order: 'ASC' | 'DESC' } = {
    by: 'created_at',
    order: 'DESC',
  },
) {
  const by = sortBy && allowed.includes(sortBy) ? sortBy : fallback.by;
  const ord = sortOrder ?? fallback.order;
  qb.orderBy(`${alias}.${by}`, ord);
  return qb;
}

export function applySearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  q?: string,
  columns: string[] = [],
) {
  const s = (q ?? '').trim();
  if (!s || columns.length === 0) return qb;

  const like = `%${s}%`;
  qb.andWhere(
    new Brackets((b) => {
      for (const c of columns) {
        b.orWhere(`${alias}.${c} ILIKE :like`, { like });
      }
    }),
  );
  return qb;
}

export function applyEqualsFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  filters: Record<string, any>,
  allowed: string[] = [],
) {
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    if (!allowed.includes(k)) continue;
    qb.andWhere(`${alias}.${k} = :${k}`, { [k]: v });
  }
  return qb;
}
