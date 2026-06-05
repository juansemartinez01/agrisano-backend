import { IsOptional, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryEstablecimientosDto extends PageQueryDto {
  @IsOptional()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
