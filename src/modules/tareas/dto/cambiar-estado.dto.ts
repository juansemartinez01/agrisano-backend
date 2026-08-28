import { IsEnum } from 'class-validator';
import { TareaEstado } from '../entities/tarea.entity';

export class CambiarEstadoDto {
  @IsEnum(TareaEstado)
  estado!: TareaEstado;
}
