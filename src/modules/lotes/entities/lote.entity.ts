import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum LoteTipo {
  SEMILLA = 'semilla',
  SUSTRATO = 'sustrato',
}

@Entity('lotes')
export class Lote extends BaseEntity {
  @Column({ type: 'enum', enum: LoteTipo })
  tipo!: LoteTipo;

  @Column({ type: 'varchar', length: 100 })
  numero_lote!: string;

  @Column({ type: 'uuid', nullable: true })
  establecimiento_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  proveedor_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  marca_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Semilla-only fields (nullable — sustrato rows leave these null)
  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  variedad_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batch!: string | null;

  @Column({ type: 'uuid', nullable: true })
  proveedor_semilla_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;
}
