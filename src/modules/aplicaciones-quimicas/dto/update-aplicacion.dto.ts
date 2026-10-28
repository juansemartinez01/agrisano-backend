import {
  IsUUID,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsFechaHoraConZona } from 'src/common/validators/fecha-hora-con-zona.validator';
import { DetalleItemDto } from './create-aplicacion.dto';

export class UpdateAplicacionDto {
  // Corrección de horarios. Si se manda uno solo, se valida contra el otro
  // guardado; en una aplicación sin horarios (anterior a la feature) hay que
  // mandar los dos. `fecha_hora` ya no se acepta: es siempre igual al fin.
  @IsOptional()
  @IsFechaHoraConZona()
  fecha_hora_inicio?: string;

  @IsOptional()
  @IsFechaHoraConZona()
  fecha_hora_fin?: string;

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
