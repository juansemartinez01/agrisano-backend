import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('recetas')
export class Receta extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
