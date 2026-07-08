import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum BandejaEstado {
  COOLING_PERIOD = 'cooling_period',
  EN_NURSERY = 'en_nursery',
  TRASPLANTADA = 'trasplantada',
}

@Entity('bandejas')
export class Bandeja extends BaseEntity {
  @Column({ type: 'uuid' })
  siembra_id!: string;

  @Column({ type: 'uuid' })
  lote_semilla_id!: string;

  @Column({ type: 'uuid' })
  lote_sustrato_id!: string;

  @Column({ type: 'enum', enum: BandejaEstado, default: BandejaEstado.COOLING_PERIOD })
  estado!: BandejaEstado;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_entrada_nursery!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_trasplante!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  mesa_id!: string | null;

  @Column({ type: 'varchar', length: 100, unique: true })
  codigo!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;
}
