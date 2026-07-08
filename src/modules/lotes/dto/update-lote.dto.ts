import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// tipo is intentionally absent — immutability enforced by omission.
// The PATCH controller checks req.body for a 'tipo' key and rejects it explicitly.
export class UpdateLoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numero_lote?: string;

  @IsOptional()
  @IsUUID()
  establecimiento_id?: string;

  @IsOptional()
  @IsUUID()
  proveedor_id?: string;

  @IsOptional()
  @IsUUID()
  marca_id?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Semilla-only fields — all optional on update (tipo is immutable)
  @IsOptional()
  @IsUUID()
  producto_id?: string;

  @IsOptional()
  @IsUUID()
  variedad_id?: string;

  @IsOptional()
  @IsUUID()
  proveedor_semilla_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batch?: string;
}
