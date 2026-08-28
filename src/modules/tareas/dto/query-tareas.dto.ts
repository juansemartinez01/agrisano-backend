import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { TareaAmbito, TareaEstado } from '../entities/tarea.entity';

export class QueryTareasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsEnum(TareaAmbito)
  ambito?: TareaAmbito;

  @IsOptional()
  @IsEnum(TareaEstado)
  estado?: TareaEstado;

  /** uuid, o el literal 'me' que el service resuelve al usuario del token. */
  @ValidateIf((o: QueryTareasDto) => o.asignado_a !== 'me')
  @IsOptional()
  @IsUUID()
  asignado_a?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
