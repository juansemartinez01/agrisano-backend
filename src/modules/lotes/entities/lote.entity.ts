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

  @Column({ type: 'varchar', length: 200, nullable: true })
  proveedor!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
