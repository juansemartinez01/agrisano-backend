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

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  // Primary chemical lot applied
  @Column({ type: 'uuid', nullable: true })
  lote_quimico_id!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
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

  @Column({ type: 'int', nullable: true })
  withholding_period_dias!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
