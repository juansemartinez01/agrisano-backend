import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';
import { BandejaEstado } from './bandeja.entity';

// Conjunto cerrado: sumar un motivo es un ALTER TYPE, no una pantalla de
// administración. 'otro' exige observaciones (regla de aplicación).
export enum BandejaDescarteMotivo {
  CAIDA = 'caida',
  ROTURA = 'rotura',
  CONTAMINACION = 'contaminacion',
  PLAGA = 'plaga',
  MALA_GERMINACION = 'mala_germinacion',
  ERROR_CARGA = 'error_carga',
  OTRO = 'otro',
}

// No extiende BaseEntity, mismo criterio que MesaBandeja: la identidad del
// descarte *es* la bandeja (de ahí la PK), y un registro append-only e
// irreversible no necesita id propio, ni updated_at, ni deleted_at.
@Entity('bandeja_descartes')
export class BandejaDescarte {
  @PrimaryColumn({ type: 'uuid' })
  bandeja_id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenant_id!: string | null;

  // Se toma de la fila bloqueada dentro de la transacción, nunca del request:
  // así no hay ventana entre leer el estado y guardarlo. Nunca 'descartada'.
  @Column({
    type: 'enum',
    enum: BandejaEstado,
    enumName: 'bandeja_estado',
  })
  estado_anterior!: BandejaEstado;

  @Column({
    type: 'enum',
    enum: BandejaDescarteMotivo,
    enumName: 'bandeja_descarte_motivo',
  })
  motivo!: BandejaDescarteMotivo;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  // Fecha del incidente, no de la carga: admite registro retroactivo. Para la
  // fecha de carga está created_at.
  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha_descarte!: Date;

  @Column({ type: 'uuid' })
  usuario_id!: string;

  // Snapshot del responsable al momento del registro (auditoría histórica).
  @Column({ type: 'varchar', length: 150, nullable: true })
  usuario_email_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_nombre_snapshot!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  usuario_apellido_snapshot!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
