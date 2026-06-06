import { IsOptional, IsUUID, IsEnum, IsString, IsIn, IsISO8601 } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { AplicacionContexto } from '../entities/aplicacion-quimica.entity';

export class QueryAplicacionesDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsEnum(AplicacionContexto)
  contexto?: AplicacionContexto;

  @IsOptional()
  @IsUUID()
  receta_id?: string;

  @IsOptional()
  @IsUUID()
  quimico_id?: string;

  @IsOptional()
  @IsISO8601()
  fecha_desde?: string;

  @IsOptional()
  @IsISO8601()
  fecha_hasta?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
