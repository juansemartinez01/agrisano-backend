import { Entity, PrimaryColumn } from 'typeorm';

@Entity('quimico_principio_activo')
export class QuimicoPrincipioActivo {
  @PrimaryColumn({ type: 'uuid' })
  quimico_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  principio_activo_id!: string;
}
