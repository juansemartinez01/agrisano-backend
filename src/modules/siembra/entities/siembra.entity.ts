import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('siembras')
export class Siembra extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'date' })
  fecha!: string; // stored as 'YYYY-MM-DD'

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;
}
