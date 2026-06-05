import { IsUUID, IsEnum, IsOptional, IsString, IsIn, IsDateString } from 'class-validator';
import { PageQueryDto } from 'src/common/query/page-query.dto';
import { MovimientoTipo } from '../entities/movimiento-stock.entity';

export class QueryMovimientosDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  quimico_id?: string;

  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsEnum(MovimientoTipo)
  tipo?: MovimientoTipo;

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
