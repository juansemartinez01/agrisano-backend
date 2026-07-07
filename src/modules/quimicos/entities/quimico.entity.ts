import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';
import type { PrincipioActivo } from './principio-activo.entity';

export enum QuimicoUnidadMedida {
  KG = 'kg',
  L = 'l',
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

  @Column({ type: 'enum', enum: QuimicoUnidadMedida })
  unidad_medida!: QuimicoUnidadMedida;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'enum', enum: QuimicoRateUnidad })
  rate_unidad!: QuimicoRateUnidad;

  @Column({ type: 'int', nullable: true })
  withholding_period_dias!: number | null;

  principios_activos?: PrincipioActivo[];
}
