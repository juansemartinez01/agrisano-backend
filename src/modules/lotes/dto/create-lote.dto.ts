import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsUUID,
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
  @IsUUID()
  establecimiento_id?: string;

  @IsUUID()
  proveedor_id!: string;

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

  @ValidateIf((o: CreateLoteDto) => o.tipo === LoteTipo.SEMILLA)
  @IsNotEmpty()
  @IsUUID()
  proveedor_semilla_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batch?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
