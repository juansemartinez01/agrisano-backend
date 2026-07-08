import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryMarcasDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
