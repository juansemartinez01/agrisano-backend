import { IsUUID, IsEnum, IsNumber, Min, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { MovimientoTipo } from '../entities/movimiento-stock.entity';
import { QuimicoUnidadStock } from 'src/modules/quimicos/entities/quimico.entity';

export class CreateMovimientoDto {
  @IsUUID()
  quimico_id!: string;

  @IsEnum(MovimientoTipo)
  tipo!: MovimientoTipo;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numero_remito?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsEnum(QuimicoUnidadStock)
  unidad_ingreso?: QuimicoUnidadStock;
}
