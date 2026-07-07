import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, IsString, IsBoolean, IsIn } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';

export class QueryLotesQuimicosDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  quimico_id?: string;

  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  con_stock?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
