import { IsOptional, IsUUID, IsString, IsIn } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryPackingDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  cosecha_id?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
