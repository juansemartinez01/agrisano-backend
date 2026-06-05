import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MovimientoTipo {
  INGRESO = 'ingreso',
  EGRESO_MANUAL = 'egreso_manual',
}

@Entity('movimientos_stock')
export class MovimientoStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  quimico_id!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'enum', enum: MovimientoTipo })
  tipo!: MovimientoTipo;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  cantidad!: number;

  @Column({ type: 'varchar', length: 30 })
  unidad_medida!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  numero_remito!: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'date' })
  fecha!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
