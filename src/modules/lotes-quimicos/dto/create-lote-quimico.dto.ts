import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { IsCantidadStock } from 'src/common/validators/cantidad-stock.validator';

export class CreateLoteQuimicoDto {
  @IsUUID()
  quimico_id!: string;

  @IsUUID()
  proveedor_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote!: string;

  @IsCantidadStock()
  cantidad_inicial!: number;

  @IsOptional()
  @IsDateString()
  dom?: string;

  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;
}
