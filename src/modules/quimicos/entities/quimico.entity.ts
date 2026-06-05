import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';
import type { PrincipioActivo } from './principio-activo.entity';

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

  principios_activos?: PrincipioActivo[];
}
