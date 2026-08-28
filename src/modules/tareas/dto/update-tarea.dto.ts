import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// Solo los tres campos editables. establecimiento_id, ambito, estado y orden
// son inmutables por esta via: el estado tiene su endpoint y el orden el suyo.
// IsOptional ignora tanto undefined como null, asi que mandar null explicito
// en descripcion o asignado_a_usuario_id es valido y significa "limpiar".
export class UpdateTareaDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion?: string | null;

  @IsOptional()
  @IsUUID()
  asignado_a_usuario_id?: string | null;
}
