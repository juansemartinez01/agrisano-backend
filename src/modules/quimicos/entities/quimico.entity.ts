import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';
import type { PrincipioActivo } from './principio-activo.entity';

export enum QuimicoUnidadStock {
  KG = 'kg',
  G = 'g',
  L = 'l',
  ML = 'ml',
}

export enum QuimicoRateUnidad {
  KG_L = 'kg/l',
  G_L = 'g/l',
  ML_L = 'ml/l',
  L_L = 'l/l',
}

@Entity('quimicos')
export class Quimico extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 30 })
  unidad_medida!: string;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  stock_actual!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'boolean', default: false })
  nombre_lista!: boolean;

  @Column({ type: 'enum', enum: QuimicoUnidadStock })
  unidad_stock!: QuimicoUnidadStock;

  @Column({ type: 'enum', enum: QuimicoRateUnidad })
  rate_unidad!: QuimicoRateUnidad;

  @Column({ type: 'int', nullable: true })
  withholding_period_dias!: number | null;

  @Column({ type: 'date', nullable: true })
  manufacture_date!: string | null;

  @Column({ type: 'date', nullable: true })
  dom!: string | null;

  @Column({ type: 'uuid', nullable: true })
  proveedor_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batch!: string | null;

  principios_activos?: PrincipioActivo[];
}
