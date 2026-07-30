import { IsBoolean, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { LoteEstado, LoteTipo } from '../entities/lote.entity';

export class QueryLotesDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(LoteTipo)
  tipo?: LoteTipo;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsEnum(LoteEstado)
  estado?: LoteEstado;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  disponible?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
