import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('marcas')
export class Marca extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
