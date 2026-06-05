import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('establecimientos')
export class Establecimiento extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ubicacion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
