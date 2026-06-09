import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { CategoriaPackingEnum } from './lote-packing.entity';

@Entity('lotes_packing_categorias')
export class LotePackingCategoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  lote_packing_id!: string;

  @Column({ type: 'varchar', length: 10 })
  categoria!: CategoriaPackingEnum;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_kg!: number;

  @Column({ type: 'int' })
  cantidad_cajas!: number;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_neto_por_caja!: number;
}
