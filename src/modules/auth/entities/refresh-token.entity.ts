import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_tenant_user_revoked', [
  'tenant_id',
  'user_id',
  'revoked_at',
])
export class RefreshToken extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, (u) => u.refresh_tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 120 })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;
}
