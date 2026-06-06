import { Entity, PrimaryColumn } from 'typeorm';

@Entity('aplicacion_quimica_bandeja')
export class AplicacionQuimicaBandeja {
  @PrimaryColumn({ type: 'uuid' })
  aplicacion_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  bandeja_id!: string;
}
