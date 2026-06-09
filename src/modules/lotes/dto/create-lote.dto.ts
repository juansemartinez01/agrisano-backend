import {
  IsEnum,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { LoteTipo, LoteProducto } from '../entities/lote.entity';

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

  // Semilla-only fields — validated only when tipo === 'semilla'
  @ValidateIf((o: CreateLoteDto) => o.tipo === LoteTipo.SEMILLA)
  @IsNotEmpty()
  @IsEnum(LoteProducto)
  producto?: LoteProducto;

  @ValidateIf((o: CreateLoteDto) => o.tipo === LoteTipo.SEMILLA)
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  variedad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seed_company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
