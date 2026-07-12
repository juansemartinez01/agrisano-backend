import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';
import { User } from './user.entity';

// Nota: 'admin' y 'admin_global' son dos dominios de privilegio intencionalmente
// separados, ambos acotados al mismo tenant (no es una jerarquía plataforma/tenant):
// - 'admin': administración de IAM (admin/users, admin/roles, admin/audit-logs).
// - 'admin_global': administración operativa/catálogos en todos los establecimientos
//   del tenant (vs. supervisor/operario, restringidos a los establecimientos que
//   tienen vinculados en usuario_establecimiento). El nombre es engañoso (no
//   significa "global entre tenants") pero es así por diseño, no un bug.
@Entity('roles')
export class Role extends BaseEntity {
  @Column({ type: 'varchar', length: 40, unique: true })
  name!: string; // e.g. 'admin', 'user'

  @ManyToMany(() => User, (u) => u.roles)
  users!: User[];
}
