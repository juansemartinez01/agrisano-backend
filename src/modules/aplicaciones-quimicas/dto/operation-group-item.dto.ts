import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DetalleItemDto } from './create-aplicacion.dto';

export enum OperationGroupOp {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

// Un ítem por fila física del grupo. Las reglas cruzadas por `op` (create sin
// id, delete sin chemical_lines/targets, id no duplicado entre ítems, campo
// de target coherente con el contexto del grupo) las valida el service, no
// este DTO — mismo criterio que el guard de contexto-vs-target que ya usa
// updateAplicacion.
export class OperationGroupItemDto {
  @IsEnum(OperationGroupOp)
  op!: OperationGroupOp;

  @ValidateIf((o: OperationGroupItemDto) => o.op !== OperationGroupOp.CREATE)
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  chemical_lines?: DetalleItemDto[];

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
