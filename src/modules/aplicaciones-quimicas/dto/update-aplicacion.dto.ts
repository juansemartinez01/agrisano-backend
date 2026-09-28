import {
  IsUUID,
  IsOptional,
  IsString,
  IsISO8601,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DetalleItemDto } from './create-aplicacion.dto';

export class UpdateAplicacionDto {
  @IsOptional()
  @IsISO8601()
  fecha_hora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string | null;

  // Reemplaza TODAS las líneas de químico de la aplicación (no hace merge
  // parcial) — la primera línea pasa a ser la nueva primaria del header.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  chemical_lines?: DetalleItemDto[];

  // Reemplaza TODOS los targets — no puede vaciar la aplicación.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  bandeja_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  mesa_ids?: string[];
}
