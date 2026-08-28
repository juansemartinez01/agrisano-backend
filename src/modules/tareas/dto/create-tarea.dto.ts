import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TareaAmbito } from '../entities/tarea.entity';

export class CreateTareaDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsEnum(TareaAmbito)
  ambito!: TareaAmbito;

  // El trim corre antes de validar, asi que un titulo de solo espacios queda
  // vacio y lo rechaza IsNotEmpty en vez de guardarse en blanco.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsUUID()
  asignado_a_usuario_id?: string;
}
