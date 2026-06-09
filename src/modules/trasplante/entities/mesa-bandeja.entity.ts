import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('mesa_bandeja')
export class MesaBandeja {
  @PrimaryColumn({ type: 'uuid' })
  mesa_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  bandeja_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_trasplante!: Date;
}
