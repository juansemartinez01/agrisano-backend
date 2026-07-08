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
  Min,
} from 'class-validator';
import { QuimicoUnidadMedida, QuimicoRateUnidad } from '../entities/quimico.entity';

export class UpdateQuimicoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsEnum(QuimicoUnidadMedida)
  unidad_medida?: QuimicoUnidadMedida;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  principios_activos?: string[];

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  rate_unidad?: QuimicoRateUnidad;

  @IsOptional()
  @IsInt()
  @Min(0)
  withholding_period_dias?: number;

  @IsOptional()
  @IsUUID()
  marca_id?: string;
}
