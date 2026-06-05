import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, ILike, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { QueryUsersAdminDto } from '../admin/dto/query-users.admin.dto';
import { ConfigService } from '@nestjs/config';
import { TenancyService } from '../tenancy/tenancy.service';
import { requireTenantId } from 'src/common/tenancy/tenant-query.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    private readonly tenancy: TenancyService,
    private readonly cfg: ConfigService,
  ) {}

  private normalizeEmail(v: string) {
    return v.toLowerCase().trim();
  }

  private async isSeedAdminUserId(userId: string): Promise<boolean> {
    const seedEmail = this.normalizeEmail(
      this.cfg.get<string>('SEED_ADMIN_EMAIL') ?? '',
    );
    if (!seedEmail) return false;

    const tenantId = requireTenantId(this.tenancy);
    const user = await this.usersRepo.findOne({
      where: { id: userId, tenant_id: tenantId },
    });

    if (!user) return false;

    return this.normalizeEmail(user.email) === seedEmail;
  }

  findByEmail(email: string) {
    const tenantId = requireTenantId(this.tenancy);

    return this.usersRepo.findOne({
      where: {
        tenant_id: tenantId,
        email: email.toLowerCase().trim(),
      },
      relations: { roles: true },
    });
  }

  // ✅ Roles GLOBAL: tenant_id IS NULL
  async getOrCreateRole(name: string): Promise<Role> {
    const key = name.toLowerCase().trim();

    const existing = await this.rolesRepo.findOne({
      where: { name: key, tenant_id: IsNull() },
    });

    if (existing) return existing;

    const payload: DeepPartial<Role> = {
      name: key,
      tenant_id: null,
    };

    const created = this.rolesRepo.create(payload); // ✅ ahora devuelve Role (no Role[])
    return this.rolesRepo.save(created);
  }

  async createUser(params: {
    tenant_id: string;
    email: string;
    password_hash: string;
    roleNames?: string[];
  }) {
    const email = params.email.toLowerCase().trim();
    const exists = await this.findByEmail(email);
    if (exists) throw new BadRequestException('Email already exists');

    const roles = params.roleNames?.length
      ? await Promise.all(params.roleNames.map((r) => this.getOrCreateRole(r)))
      : [await this.getOrCreateRole('user')];

    const user = this.usersRepo.create({
      tenant_id: params.tenant_id,
      email,
      password_hash: params.password_hash,
      roles,
      is_active: true,
    });

    return this.usersRepo.save(user);
  }

  async listAdmin(q: QueryUsersAdminDto) {
    const tenantId = requireTenantId(this.tenancy);

    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const includeDeleted =
      String(q.includeDeleted ?? 'false').toLowerCase() === 'true';

    const where: any = {};
    if (q.q?.trim()) where.email = ILike(`%${q.q.trim().toLowerCase()}%`);

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .where('u.tenant_id = :tenantId', { tenantId })
      .orderBy('u.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (!includeDeleted) qb.andWhere('u.deleted_at IS NULL');
    if (where.email)
      qb.andWhere('u.email ILIKE :email', { email: where.email.value });

    const [items, total] = await qb.getManyAndCount();

    return {
      page,
      limit,
      total,
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        is_active: u.is_active,
        deleted_at: u.deleted_at,
        roles: u.roles?.map((r) => r.name) ?? [],
        created_at: u.created_at,
        updated_at: u.updated_at,
      })),
    };
  }

  async getByIdAdmin(id: string, includeDeleted = false) {
    const tenantId = requireTenantId(this.tenancy);

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.id = :id', { id });

    if (!includeDeleted) qb.andWhere('u.deleted_at IS NULL');

    const u = await qb.getOne();
    return u ?? null;
  }

  async createUserAdmin(params: {
    email: string;
    password: string;
    roles?: string[];
  }) {
    const tenantId = requireTenantId(this.tenancy);

    const password_hash = await bcrypt.hash(params.password, 10);
    return this.createUser({
      tenant_id: tenantId,
      email: params.email,
      password_hash,
      roleNames: params.roles?.length ? params.roles : ['user'],
    });
  }

  async updateUserAdmin(
    id: string,
    dto: { email?: string; password?: string; is_active?: boolean },
  ) {
    const tenantId = requireTenantId(this.tenancy);
    const user = await this.usersRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) return null;

    // 🔒 no permitir cambiar email del admin seed
    if (dto.email) {
      const seedEmail = this.normalizeEmail(
        this.cfg.get<string>('SEED_ADMIN_EMAIL') ?? '',
      );
      const isSeed = seedEmail && this.normalizeEmail(user.email) === seedEmail;
      if (!isSeed) user.email = this.normalizeEmail(dto.email);
    }

    if (dto.is_active !== undefined) user.is_active = dto.is_active;

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 10);
    }

    return this.usersRepo.save(user);
  }

  async softDeleteUser(id: string) {
    const tenantId = requireTenantId(this.tenancy);
    const user = await this.usersRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) return false;

    const seedAdminEmail = (this.cfg.get<string>('SEED_ADMIN_EMAIL') ?? '')
      .toLowerCase()
      .trim();

    if (seedAdminEmail && user.email.toLowerCase().trim() === seedAdminEmail) {
      return false;
    }

    const res = await this.usersRepo.softDelete({
      id,
      tenant_id: tenantId,
    } as any);
    return !!res.affected;
  }

  async setUserRoles(userId: string, roleNames: string[]) {
    const tenantId = requireTenantId(this.tenancy);

    const user = await this.usersRepo.findOne({
      where: { id: userId, tenant_id: tenantId },
      relations: { roles: true },
    });
    if (!user) return null;

    const normalized = roleNames.map((r) => r.toLowerCase().trim());

    // 🔒 si es seed admin, forzamos que siempre tenga 'admin'
    const isSeedAdmin = await this.isSeedAdminUserId(userId);
    if (isSeedAdmin && !normalized.includes('admin')) {
      normalized.push('admin');
    }

    const roles = await Promise.all(
      normalized.map((r) => this.getOrCreateRole(r)),
    );
    user.roles = roles;

    return this.usersRepo.save(user);
  }

  // ✅ Roles GLOBAL: tenant_id IS NULL
  async listRoles() {
    const roles = await this.rolesRepo.find({
      where: { tenant_id: IsNull() } as any,
      order: { name: 'ASC' as any },
    });
    return roles.map((r) => ({ id: r.id, name: r.name }));
  }

  async createRole(name: string) {
    return this.getOrCreateRole(name);
  }

  // ✅ Roles GLOBAL: tenant_id IS NULL
  async updateRole(id: string, name: string) {
    const role = await this.rolesRepo.findOne({
      where: { id, tenant_id: IsNull() } as any,
    });
    if (!role) return null;

    role.name = name.toLowerCase().trim();
    return this.rolesRepo.save(role);
  }

  // ✅ Roles GLOBAL: tenant_id IS NULL
  async deleteRole(id: string) {
    const role = await this.rolesRepo.findOne({
      where: { id, tenant_id: IsNull() } as any,
    });
    if (!role) return false;

    if (role.name === 'admin') return false;

    const res = await this.rolesRepo.delete({ id, tenant_id: IsNull() } as any);
    return !!res.affected;
  }

  async restoreUser(id: string) {
    const tenantId = requireTenantId(this.tenancy);
    const res = await this.usersRepo.restore({
      id,
      tenant_id: tenantId,
    } as any);
    return !!res.affected;
  }

  async updateUserPasswordAdmin(id: string, password: string) {
    const tenantId = requireTenantId(this.tenancy);
    const user = await this.usersRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) return null;

    user.password_hash = await bcrypt.hash(password, 10);
    return this.usersRepo.save(user);
  }
}
