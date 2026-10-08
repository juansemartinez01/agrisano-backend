import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';

export enum AplicacionContexto {
  NURSERY = 'nursery',
  GREENHOUSE = 'greenhouse',
}

@Entity('aplicaciones_quimicas')
export class AplicacionQuimica {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({
    type: 'enum',
    enum: AplicacionContexto,
    enumName: 'aplicacion_contexto',
  })
  contexto!: AplicacionContexto;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  // Snapshot del responsable al momento de creación (auditoría histórica:
  // no se re-escribe si el usuario cambia su nombre o es desactivado después).
  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_apellido_snapshot!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  // Primary chemical lot applied
  @Column({ type: 'uuid', nullable: true })
  lote_quimico_id!: string | null;

  @Column({ type: 'decimal', precision: 13, scale: 6, nullable: true })
  dosis!: number | null;

  @Column({
    type: 'enum',
    enum: QuimicoRateUnidad,
    enumName: 'quimico_rate_unidad',
    nullable: true,
  })
  dosis_unidad!: QuimicoRateUnidad | null;

  // Snapshotted from lote at time of application
  @Column({ type: 'varchar', length: 100, nullable: true })
  batch!: string | null;

  // Recalculado (MAX entre el químico primario y todos los adicionales de
  // aplicaciones_quimicas_detalle) cada vez que se crea o edita esta fila o
  // cualquier otra que comparta target — no es un snapshot fijo de creación.
  @Column({ type: 'int', nullable: true })
  withholding_period_dias!: number | null;

  // Groups multiple independently-created rows that originated from the same
  // logical user action (e.g. a >200-target request the frontend chunked into
  // several sequential POSTs). Purely presentational — never merges DB rows.
  @Column({ type: 'uuid', nullable: true })
  operation_group_id!: string | null;

  // Quién hizo la última corrección (PATCH) y su snapshot al momento de
  // editar. Null mientras la fila nunca fue editada.
  @Column({ type: 'uuid', nullable: true })
  updated_by!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  updated_by_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  updated_by_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  updated_by_apellido_snapshot!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
