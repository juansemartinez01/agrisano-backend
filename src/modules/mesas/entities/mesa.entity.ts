import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum MesaEstado {
  ACTIVA = 'activa',
  EN_COSECHA = 'en_cosecha',
  BAJA = 'baja',
}

@Entity('mesas')
export class Mesa extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'uuid' })
  tunel_id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  codigo_qr!: string;

  @Column({ type: 'int', nullable: true, default: null })
  posicion_actual!: number | null;

  @Column({
    type: 'enum',
    enum: MesaEstado,
    enumName: 'mesa_estado',
    default: MesaEstado.ACTIVA,
  })
  estado!: MesaEstado;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  fecha_ultimo_trasplante!: Date | null;

  @Column({ type: 'int', default: 450 })
  plantas_estimadas!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'date', nullable: true, default: null })
  carencia_hasta!: string | null;
}
