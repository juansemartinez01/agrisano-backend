import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AplicacionContexto } from '../entities/aplicacion-quimica.entity';
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';

export class DetalleItemDto {
  @IsUUID()
  quimico_id!: string;

  @IsNumber()
  @IsPositive()
  cantidad!: number;
}

export class CreateAplicacionDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsEnum(AplicacionContexto)
  contexto!: AplicacionContexto;

  @IsUUID()
  quimico_id!: string;

  @IsNumber()
  @IsPositive()
  dosis!: number;

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  dosis_unidad?: QuimicoRateUnidad;

  @IsOptional()
  @IsUUID()
  receta_id?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  detalles?: DetalleItemDto[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  bandeja_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  mesa_ids?: string[];
}
