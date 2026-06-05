import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';
import { User } from './user.entity';

@Entity('roles')
export class Role extends BaseEntity {
  @Column({ type: 'varchar', length: 40, unique: true })
  name!: string; // e.g. 'admin', 'user'

  @ManyToMany(() => User, (u) => u.roles)
  users!: User[];
}
