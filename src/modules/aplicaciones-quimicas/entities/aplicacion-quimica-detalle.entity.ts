import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('aplicaciones_quimicas_detalle')
export class AplicacionQuimicaDetalle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  aplicacion_id!: string;

  @Column({ type: 'uuid' })
  lote_quimico_id!: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  cantidad!: number;

  @Column({ type: 'varchar', length: 30 })
  unidad_medida!: string;
}
