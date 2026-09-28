import {
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
import { OperationGroupItemDto } from './operation-group-item.dto';

export class UpdateOperationGroupDto {
  // Nivel grupo: aplica a toda fila creada o actualizada por este request;
  // nunca a las borradas, nunca a filas del grupo ausentes de `items`. Si una
  // fila puntual necesita un valor distinto al resto, para eso sigue
  // existiendo el PATCH de fila única.
  @IsOptional()
  @IsISO8601()
  fecha_hora?: string;

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
