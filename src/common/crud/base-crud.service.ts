import {
  Repository,
  DeepPartial,
  FindOptionsWhere,
  IsNull,
  ObjectLiteral,
  SelectQueryBuilder,
  Brackets,
} from 'typeorm';
import { AppError } from '../errors/app-error';
import { ErrorCodes, type ErrorCode } from '../errors/error-codes';
import { tenantContext } from '../../modules/tenancy/tenant-context';
import {
  clampPagination,
  applySearch,
  applySort,
  applyEqualsFilters,
} from '../query/query-utils';

type TenantEntity = { id: string; tenant_id: string | null };

function currentTenantId(): string | null {
  const store = (tenantContext as any).getStore?.();
  return store?.tenantId ?? null;
}

function ensureObject(input: any): Record<string, any> {
  if (Array.isArray(input)) {
    throw new Error('BaseCrudTenantService expected object payload, got array');
  }
  return input ?? {};
}

function requireTenantOrFail(tenantId: string | null) {
  if (!tenantId) {
    throw new AppError({
      code: ErrorCodes.TENANT_REQUIRED,
      message: 'Tenant is required',
      status: 400,
    });
  }
  return tenantId;
}

export type CrudListQuery = {
  page?: number;
  limit?: number;

  // opcionales, si tu endpoint los agrega después
  q?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';

  // filtros equals (ej: { is_active: true })
  filters?: Record<string, any>;

  // extra por si querés pasar cosas sueltas sin chocar
  [k: string]: any;
};

export type CrudListOptions<T extends ObjectLiteral> = {
  alias?: string;

  /** columnas permitidas para orderBy (white-list) */
  sortAllowed?: string[];

  /** fallback sort */
  sortFallback?: { by: string; order: 'ASC' | 'DESC' };

  /** columnas para ILIKE search */
  searchColumns?: string[];

  /** filtros equals permitidos */
  filterAllowed?: string[];

  /**
   * allowGlobal:
   * - true => (tenant_id = tenant) OR (tenant_id IS NULL)
   * - false => solo tenant_id = tenant
   */
  allowGlobal?: boolean;

  /**
   * strictTenant:
   * - true => si no hay tenant en contexto, tira TENANT_REQUIRED (400)
   * - false => fail-closed (no devuelve nada), salvo allowGlobal que devuelve solo global
   */
  strictTenant?: boolean;

  /** nombre de columna tenant (por default tenant_id) */
  tenantColumn?: string;

  /** si tu entidad no tiene soft delete, ponelo false */
  withSoftDelete?: boolean;

  /**
   * hook para joins o condiciones extra
   * (se ejecuta antes de filtros/search/sort)
   */
  customizeQb?: (qb: SelectQueryBuilder<T>, alias: string) => void;
};

export class BaseCrudTenantService<T extends TenantEntity> {
  constructor(protected readonly repo: Repository<T>) {}

  protected getTenantId(opts?: { strictTenant?: boolean }): string | null {
    const t = currentTenantId();
    if (opts?.strictTenant) requireTenantOrFail(t);
    return t;
  }

  /**
   * Aplica scope tenant al QB.
   * Regla:
   * - no tenant:
   *    - strictTenant => 400
   *    - allowGlobal => solo global (tenant_id IS NULL)
   *    - else => 1=0
   * - tenant:
   *    - allowGlobal => (tenant_id=tenant OR tenant_id IS NULL)
   *    - else => tenant_id=tenant
   */
  protected applyTenantScopeQb(
    qb: SelectQueryBuilder<T>,
    alias: string,
    opts?: {
      allowGlobal?: boolean;
      strictTenant?: boolean;
      tenantColumn?: string;
    },
  ) {
    const tenantId = this.getTenantId({ strictTenant: opts?.strictTenant });
    const col = opts?.tenantColumn ?? 'tenant_id';

    if (!tenantId) {
      if (opts?.allowGlobal) qb.andWhere(`${alias}.${col} IS NULL`);
      else qb.andWhere('1=0');
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

  async findById(
    id: string,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<T | null> {
    const tenantId = this.getTenantId({ strictTenant: opts?.strictTenant });

    if (!tenantId) {
      if (opts?.allowGlobal) {
        return this.repo.findOne({
          where: { id, tenant_id: IsNull() } as any,
        });
      }
      return null;
    }

    if (opts?.allowGlobal) {
      const inTenant = await this.repo.findOne({
        where: { id, tenant_id: tenantId } as any,
      });
      if (inTenant) return inTenant;

      return this.repo.findOne({
        where: { id, tenant_id: IsNull() } as any,
      });
    }

    return this.repo.findOne({
      where: { id, tenant_id: tenantId } as FindOptionsWhere<T>,
    });
  }

  async mustFindById(
    id: string,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<T> {
    const row = await this.findById(id, opts);
    if (!row) {
      throw new AppError({
        code: ErrorCodes.NOT_FOUND,
        message: 'Resource not found',
        status: 404,
        details: { id },
      });
    }
    return row;
  }

  /**
   * LIST tenant-safe (PAGINADO)
   */
  async list(
    q: CrudListQuery,
    opts?: CrudListOptions<T>,
  ): Promise<{ items: T[]; total: number }> {
    const alias = opts?.alias ?? 't';
    const { page, limit, skip } = clampPagination(q.page, q.limit, 200);

    const qb = this.repo.createQueryBuilder(alias);

    // soft delete (por default TypeORM excluye soft deleted, pero dejamos opción)
    // si alguien habilita withDeleted en algún lado, esto lo vuelve explícito.
    if (opts?.withSoftDelete === false) {
      // nada
    } else {
      // por default no hace falta, pero dejamos el comentario
      // qb.andWhere(`${alias}.deleted_at IS NULL`);
    }

    // ✅ tenant scope hard
    this.applyTenantScopeQb(qb, alias, {
      allowGlobal: opts?.allowGlobal ?? false,
      strictTenant: opts?.strictTenant ?? false,
      tenantColumn: opts?.tenantColumn,
    });

    // hook custom (joins / extra wheres)
    opts?.customizeQb?.(qb, alias);

    // search
    applySearch(qb as any, alias, q.q, opts?.searchColumns ?? []);

    // equals filters
    applyEqualsFilters(
      qb as any,
      alias,
      q.filters ?? {},
      opts?.filterAllowed ?? [],
    );

    // sort (whitelist)
    applySort(
      qb as any,
      alias,
      q.sortBy,
      q.sortOrder,
      opts?.sortAllowed ?? [],
      opts?.sortFallback ?? { by: 'created_at', order: 'DESC' },
    );

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * CREATE tenant-safe
   * - si tenant_id no viene: se setea tenant actual
   * - si allowGlobal=true y querés crear global: pasar tenant_id=null explícito
   */
  async create(
    data: Partial<T>,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<T> {
    const tenantId = this.getTenantId({ strictTenant: opts?.strictTenant });

    const normalized = ensureObject({ ...(data as any) });

    if (normalized.tenant_id === undefined) {
      if (opts?.allowGlobal && !tenantId) normalized.tenant_id = null;
      else normalized.tenant_id = tenantId ?? null;
    }

    // si strictTenant y no tenant y no global => falla
    if (opts?.strictTenant && !tenantId && normalized.tenant_id === null) {
      // si strictTenant y allowGlobal false, no debería llegar
      // dejamos esto por seguridad
      requireTenantOrFail(tenantId);
    }

    const row = this.repo.create(normalized as DeepPartial<T>);
    return this.repo.save(row);
  }

  /**
   * UPDATE tenant-safe
   * - valida scope antes
   * - NO permite cambiar tenant_id
   */
  async update(
    id: string,
    patch: Partial<T>,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<T> {
    const row = await this.mustFindById(id, opts);

    const safePatch = ensureObject({ ...(patch as any) });
    delete safePatch.tenant_id;

    Object.assign(row as any, safePatch);
    return this.repo.save(row);
  }

  async softDelete(
    id: string,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<boolean> {
    const row = await this.findById(id, opts);
    if (!row) return false;

    await this.repo.softDelete(id as any);
    return true;
  }

  async restore(
    id: string,
    opts?: { allowGlobal?: boolean; strictTenant?: boolean },
  ): Promise<boolean> {
    const row = await this.findById(id, opts);
    if (!row) return false;

    const res = await this.repo.restore(id as any);
    return (res.affected ?? 0) > 0;
  }
}
