import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { MesaEstado } from '../entities/mesa.entity';

export class QueryMesasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsUUID()
  tunel_id?: string;

  @IsOptional()
  @IsEnum(MesaEstado)
  estado?: MesaEstado;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo?: boolean;

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
