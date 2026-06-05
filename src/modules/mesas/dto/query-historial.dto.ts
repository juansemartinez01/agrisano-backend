import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryHistorialDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
