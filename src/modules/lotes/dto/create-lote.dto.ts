import {
  IsEnum,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { LoteTipo } from '../entities/lote.entity';

export class CreateLoteDto {
  @IsEnum(LoteTipo)
  tipo!: LoteTipo;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  proveedor?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
