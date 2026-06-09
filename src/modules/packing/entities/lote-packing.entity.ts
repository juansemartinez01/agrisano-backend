import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CategoriaPackingEnum {
  PRIMERA = 'primera',
  SEGUNDA = 'segunda',
  DESCARTE = 'descarte',
}

@Entity('lotes_packing')
export class LotePacking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  @Column({ type: 'uuid', unique: true })
  cosecha_id!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_hora!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  peso_bruto_kg!: number;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  @Column({ type: 'text', nullable: true, default: null })
  observaciones!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
