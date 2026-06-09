import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
  IsArray,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';
import { QuimicoUnidadStock, QuimicoRateUnidad } from '../entities/quimico.entity';

export class UpdateQuimicoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unidad_medida?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  principios_activos?: string[];

  @IsOptional()
  @IsBoolean()
  nombre_lista?: boolean;

  @IsOptional()
  @IsEnum(QuimicoUnidadStock)
  unidad_stock?: QuimicoUnidadStock;

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  rate_unidad?: QuimicoRateUnidad;

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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batch?: string;
}
