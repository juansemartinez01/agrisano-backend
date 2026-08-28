import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { TareaAmbito } from '../entities/tarea.entity';

export class ReordenarTareasDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsEnum(TareaAmbito)
  ambito!: TareaAmbito;

  /** El orden del array es el orden final: la primera posicion queda en orden 1. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  tarea_ids!: string[];
}
