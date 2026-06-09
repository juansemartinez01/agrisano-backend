import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HistorialTipoEvento {
  TRASPLANTE = 'trasplante',
  COSECHA = 'cosecha',
  CAMBIO_POSICION = 'cambio_posicion',
  APLICACION_QUIMICA = 'aplicacion_quimica',
  REACTIVACION = 'reactivacion',
  BAJA = 'baja',
  EN_CARENCIA = 'en_carencia',
}

@Entity('historial_mesa')
export class HistorialMesa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  mesa_id!: string;

  @Column({
    type: 'enum',
    enum: HistorialTipoEvento,
    enumName: 'historial_tipo_evento',
  })
  tipo_evento!: HistorialTipoEvento;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'jsonb', nullable: true, default: null })
  detalle!: Record<string, unknown> | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
