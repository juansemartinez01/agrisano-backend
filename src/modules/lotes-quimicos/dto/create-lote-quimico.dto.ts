import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  Min,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateLoteQuimicoDto {
  @IsUUID()
  quimico_id!: string;

  @IsUUID()
  proveedor_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote!: string;

  @IsNumber()
  @Min(0.001)
  cantidad_inicial!: number;

  @IsOptional()
  @IsDateString()
  dom?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;
}
