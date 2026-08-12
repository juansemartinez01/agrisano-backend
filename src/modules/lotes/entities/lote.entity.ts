import { Entity, Column } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum LoteTipo {
  SEMILLA = 'semilla',
  SUSTRATO = 'sustrato',
  VERMICULITA = 'vermiculita',
}

export enum LoteEstado {
  HABILITADO = 'habilitado',
  CONSUMIDO = 'consumido',
}

@Entity('lotes')
export class Lote extends BaseEntity {
  @Column({ type: 'enum', enum: LoteTipo })
  tipo!: LoteTipo;

  @Column({ type: 'varchar', length: 100 })
  numero_lote!: string;

  @Column({ type: 'uuid', nullable: true })
  establecimiento_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  proveedor_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  marca_id!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Estado de consumo — independiente de `activo` (baja administrativa)
  @Column({ type: 'enum', enum: LoteEstado, default: LoteEstado.HABILITADO })
  estado!: LoteEstado;

  @Column({ type: 'timestamptz', nullable: true })
  fecha_consumido!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  usuario_consumido_id!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_consumido_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_consumido_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_consumido_apellido_snapshot!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones_consumo!: string | null;

  // Semilla-only fields (nullable — sustrato rows leave these null)
  @Column({ type: 'uuid', nullable: true })
  producto_id!: string | null;

  @Column({ type: 'uuid', nullable: true })
  variedad_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batch!: string | null;

  @Column({ type: 'uuid', nullable: true })
  proveedor_semilla_id!: string | null;

  // Vermiculita-only field (nullable — semilla y sustrato lo dejan en null).
  // La coherencia tipo <-> grado la garantiza el CHECK "CHK_lotes_grado".
  @Column({ type: 'smallint', nullable: true })
  grado!: number | null;
}
