import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsNumber,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AplicacionContexto } from '../entities/aplicacion-quimica.entity';
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';

export class DetalleItemDto {
  @IsUUID()
  lote_quimico_id!: string;

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
  lote_quimico_id!: string;

  @IsNumber()
  @IsPositive()
  dosis!: number;

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  dosis_unidad?: QuimicoRateUnidad;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  detalles?: DetalleItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  bandeja_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  mesa_ids?: string[];
}
