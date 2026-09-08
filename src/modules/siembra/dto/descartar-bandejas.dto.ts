import {
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { BandejaDescarteMotivo } from '../entities/bandeja-descarte.entity';

export class DescartarBandejasDto {
  // Los repetidos se deduplican en el service, no son error: mandar dos veces
  // la misma bandeja es un descuido del cliente, no un conflicto de negocio.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  bandeja_ids!: string[];

  @IsEnum(BandejaDescarteMotivo)
  motivo!: BandejaDescarteMotivo;

  // Obligatorio cuando el motivo es 'otro'. Esa regla condicional vive en el
  // service y no acá: class-validator devolvería un 400 genérico, y el contrato
  // pide un 422 con código propio que el front pueda distinguir de un uuid mal
  // formado.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  // Día calendario, sin hora: se admite registrar una pérdida de ayer. @Matches
  // en lugar de @IsDateString porque este último aceptaría timestamps completos
  // ("2026-09-05T10:00:00Z") y el contrato es sólo el día. La validez calendaria
  // (2026-02-31) se valida en el service. Mismo criterio que IngresarNurseryDto.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha_descarte debe tener formato YYYY-MM-DD (solo día, sin hora)',
  })
  fecha_descarte?: string;
}
