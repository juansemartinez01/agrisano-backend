import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('usuario_establecimiento')
@Unique('UQ_ue_user_establecimiento', ['user_id', 'establecimiento_id'])
export class UsuarioEstablecimiento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  assigned_at!: Date;
}
