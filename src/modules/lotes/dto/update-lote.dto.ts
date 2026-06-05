import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
