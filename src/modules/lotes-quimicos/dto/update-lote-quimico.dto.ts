import { IsOptional, IsString, IsNotEmpty, MaxLength, IsUUID, IsDateString } from 'class-validator';

export class UpdateLoteQuimicoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote?: string;

  @IsOptional()
  @IsUUID()
  proveedor_id?: string;

  @IsOptional()
  @IsDateString()
  dom?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;
}
