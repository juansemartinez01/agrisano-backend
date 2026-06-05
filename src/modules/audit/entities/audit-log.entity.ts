import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/database/base.entity';

export type AuditKind = 'admin' | 'error_5xx';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  // tenant-ready (nullable para proyectos single-tenant)
  

  @Index()
  @Column({ type: 'varchar', length: 50 })
  kind!: AuditKind; // 'admin' | 'error_5xx'

  @Index()
  @Column({ type: 'varchar', length: 60 })
  request_id!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  path!: string | null;

  @Column({ type: 'int', nullable: true })
  status_code!: number | null;

  // admin audit
  @Column({ type: 'varchar', length: 80, nullable: true })
  action!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  entity!: string | null;

  @Column({ type: 'uuid', nullable: true })
  target_user_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  target_role_id!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  actor_user_id!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  actor_email!: string | null;

  // estructura flexible
  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, any> | null;
}
