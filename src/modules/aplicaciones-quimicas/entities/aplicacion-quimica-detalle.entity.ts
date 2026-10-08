import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';

@Entity('aplicaciones_quimicas_detalle')
export class AplicacionQuimicaDetalle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  aplicacion_id!: string;

  @Column({ type: 'uuid' })
  lote_quimico_id!: string;

  @Column({ type: 'decimal', precision: 13, scale: 6, nullable: true })
  dosis!: number | null;

  @Column({
    type: 'enum',
    enum: QuimicoRateUnidad,
    enumName: 'quimico_rate_unidad',
    nullable: true,
  })
  dosis_unidad!: QuimicoRateUnidad | null;

  @Column({ type: 'decimal', precision: 13, scale: 6 })
  cantidad!: number;

  @Column({ type: 'varchar', length: 30 })
  unidad_medida!: string;
}
