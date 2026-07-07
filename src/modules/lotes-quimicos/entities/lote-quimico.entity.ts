import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

@Entity('lotes_quimicos')
export class LoteQuimico extends BaseEntity {
  @Column({ type: 'uuid' })
  quimico_id!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'uuid' })
  proveedor_id!: string;

  @Column({ type: 'varchar', length: 100 })
  numero_lote!: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  cantidad_inicial!: number;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  cantidad_actual!: number;

  @Column({ type: 'date', nullable: true })
  dom!: string | null;

  @Column({ type: 'date', nullable: true })
  fecha_vencimiento!: string | null;
}
