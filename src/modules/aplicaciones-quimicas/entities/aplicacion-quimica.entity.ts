import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AplicacionContexto {
  NURSERY = 'nursery',
  INVERNADERO = 'invernadero',
}

@Entity('aplicaciones_quimicas')
export class AplicacionQuimica {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({
    type: 'enum',
    enum: AplicacionContexto,
    enumName: 'aplicacion_contexto',
  })
  contexto!: AplicacionContexto;

  @Column({ type: 'uuid', nullable: true })
  receta_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
