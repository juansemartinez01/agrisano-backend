import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from 'src/common/database/base.entity';

export enum TareaAmbito {
  NURSERY = 'nursery',
  GREENHOUSE = 'greenhouse',
}

export enum TareaEstado {
  PENDIENTE = 'pendiente',
  EN_PROGRESO = 'en_progreso',
  COMPLETADA = 'completada',
  CANCELADA = 'cancelada',
}

@Entity('tareas')
@Index(['tenant_id', 'establecimiento_id', 'ambito', 'orden'])
@Index(['tenant_id', 'establecimiento_id', 'estado'])
export class Tarea extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  // enumName explicito: sin el, TypeORM deriva el nombre del tipo de la tabla y
  // la columna, y queda imposible de referenciar limpio en migraciones futuras.
  @Column({ type: 'enum', enum: TareaAmbito, enumName: 'tarea_ambito' })
  ambito!: TareaAmbito;

  @Column({
    type: 'enum',
    enum: TareaEstado,
    enumName: 'tarea_estado',
    default: TareaEstado.PENDIENTE,
  })
  estado!: TareaEstado;

  @Column({ type: 'varchar', length: 150 })
  titulo!: string;

  @Column({ type: 'text', nullable: true, default: null })
  descripcion!: string | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  asignado_a_usuario_id!: string | null;

  /** Posicion dentro del tablero (tenant_id, establecimiento_id, ambito). */
  @Column({ type: 'int' })
  orden!: number;

  @Column({ type: 'uuid' })
  creada_por_usuario_id!: string;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  completada_at!: Date | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  completada_por_usuario_id!: string | null;
}
