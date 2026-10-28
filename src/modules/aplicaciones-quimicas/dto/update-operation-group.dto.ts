import {
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
import { OperationGroupItemDto } from './operation-group-item.dto';

export class UpdateOperationGroupDto {
  // Nivel grupo: aplica a toda fila creada o actualizada por este request;
  // nunca a las borradas, nunca a filas del grupo ausentes de `items`. Si una
  // fila puntual necesita un valor distinto al resto, para eso sigue
  // existiendo el PATCH de fila única.
  // Horarios de nivel grupo: si falta uno se completa con el guardado del
  // grupo; un ítem `create` sin ellos hereda los de las filas existentes.
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OperationGroupItemDto)
  items!: OperationGroupItemDto[];
}
