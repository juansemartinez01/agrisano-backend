import { Entity, PrimaryColumn } from 'typeorm';

@Entity('aplicacion_quimica_mesa')
export class AplicacionQuimicaMesa {
  @PrimaryColumn({ type: 'uuid' })
  aplicacion_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  mesa_id!: string;
}
