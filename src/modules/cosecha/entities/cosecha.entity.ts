import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cosechas')
export class Cosecha {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  mesa_id!: string;

  @Column({ type: 'uuid' })
  tunel_id!: string;

  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  variedad_id!: string | null;

  @Column({ type: 'int', default: 1 })
  posicion_al_momento!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  peso_kg!: number | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  // Snapshot del responsable al momento de creación (auditoría histórica).
  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_apellido_snapshot!: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  observaciones!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
