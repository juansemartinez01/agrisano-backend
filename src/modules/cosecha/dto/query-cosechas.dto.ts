import { IsOptional, IsUUID, IsISO8601, IsString, IsIn } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryCosechasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  mesa_id?: string;

  @IsOptional()
  @IsUUID()
  tunel_id?: string;

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
