import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('tuneles')
export class Tunel extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'int' })
  capacidad_maxima!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
