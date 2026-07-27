import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('mesa_bandeja')
export class MesaBandeja {
  @PrimaryColumn({ type: 'uuid' })
  mesa_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  bandeja_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_trasplante!: Date;

  // Sin dato histórico: nunca existió antes de este campo (filas viejas quedan NULL).
  @Column({ type: 'uuid', nullable: true })
  usuario_id!: string | null;

  // Snapshot del responsable al momento de creación (auditoría histórica).
  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_apellido_snapshot!: string | null;
}
