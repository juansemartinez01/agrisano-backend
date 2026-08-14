import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';
import type { PrincipioActivo } from './principio-activo.entity';

export enum QuimicoUnidadMedida {
  KG = 'kg',
  L = 'l',
}

// Dos familias: concentración (X por litro de caldo) y superficie (X por
// hectárea). La dosis es informativa — el backend no convierte entre unidades
// ni valida coherencia contra unidad_medida.
export enum QuimicoRateUnidad {
  KG_L = 'kg/L',
  G_L = 'g/L',
  ML_L = 'mL/L',
  L_L = 'L/L',
  ML_HA = 'mL/Ha',
  L_HA = 'L/Ha',
  G_HA = 'g/Ha',
  KG_HA = 'kg/Ha',
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

  @Column({ type: 'uuid', nullable: true })
  marca_id!: string | null;

  principios_activos?: PrincipioActivo[];
}
