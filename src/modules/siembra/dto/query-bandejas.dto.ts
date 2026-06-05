import { IsOptional, IsUUID, IsString, IsIn, IsEnum } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { BandejaEstado } from '../entities/bandeja.entity';

export class QueryBandejasDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsUUID()
  siembra_id?: string;

  @IsOptional()
  @IsUUID()
  lote_semilla_id?: string;

  @IsOptional()
  @IsEnum(BandejaEstado)
  estado?: BandejaEstado;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
