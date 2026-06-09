import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { LoteProducto } from '../entities/lote.entity';

// tipo is intentionally absent — immutability enforced by omission.
// The PATCH controller checks req.body for a 'tipo' key and rejects it explicitly.
export class UpdateLoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  proveedor?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Semilla-only fields — all optional on update (tipo is immutable)
  @IsOptional()
  @IsEnum(LoteProducto)
  producto?: LoteProducto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
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
