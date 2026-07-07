import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { QuimicoUnidadMedida, QuimicoRateUnidad } from '../entities/quimico.entity';

export class CreateQuimicoDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsEnum(QuimicoUnidadMedida)
  unidad_medida!: QuimicoUnidadMedida;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  principios_activos?: string[];

  @IsEnum(QuimicoRateUnidad)
  rate_unidad!: QuimicoRateUnidad;

  @IsOptional()
  @IsInt()
  @Min(0)
  withholding_period_dias?: number;
}
