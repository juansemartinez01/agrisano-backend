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

  // Snapshot del responsable al momento de creación (auditoría histórica).
  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_apellido_snapshot!: string | null;
}
