import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';
import { QuimicoUnidadStock, QuimicoRateUnidad } from '../entities/quimico.entity';

export class CreateQuimicoDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unidad_medida!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  principios_activos?: string[];

  @IsOptional()
  @IsBoolean()
  nombre_lista?: boolean;

  @IsEnum(QuimicoUnidadStock)
  unidad_stock!: QuimicoUnidadStock;

  @IsEnum(QuimicoRateUnidad)
  rate_unidad!: QuimicoRateUnidad;

  @IsOptional()
  @IsInt()
  @Min(0)
  withholding_period_dias?: number;

  @IsOptional()
  @IsDateString()
  manufacture_date?: string;

  @IsOptional()
  @IsDateString()
  dom?: string;

  @IsUUID()
  proveedor_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batch?: string;
}
