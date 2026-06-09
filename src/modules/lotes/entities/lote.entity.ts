import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum LoteTipo {
  SEMILLA = 'semilla',
  SUSTRATO = 'sustrato',
}

export enum LoteProducto {
  LECHUGA = 'lechuga',
  ESPINACA = 'espinaca',
  RUCULA = 'rucula',
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

  // Semilla-only fields (nullable — sustrato rows leave these null)
  @Column({ type: 'enum', enum: LoteProducto, nullable: true })
  producto!: LoteProducto | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  variedad!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batch!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  seed_company!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  supplier!: string | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;
}
