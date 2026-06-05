import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';
import { Role } from './role.entity';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';

@Entity('users')
@Index('UQ_users_tenant_email', ['tenant_id', 'email'], { unique: true })
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  email!: string;

  @Column({ type: 'varchar', length: 120 })
  password_hash!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @ManyToMany(() => Role, (r) => r.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @OneToMany(() => RefreshToken, (t) => t.user)
  refresh_tokens!: RefreshToken[];
}
