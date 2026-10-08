import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsCantidadStock } from 'src/common/validators/cantidad-stock.validator';
import { IsDosis } from 'src/common/validators/dosis.validator';
import { AplicacionContexto } from '../entities/aplicacion-quimica.entity';
import { QuimicoRateUnidad } from 'src/modules/quimicos/entities/quimico.entity';

export class DetalleItemDto {
  @IsUUID()
  lote_quimico_id!: string;

  // Hasta 6 decimales (numeric(13,6)); más se rechaza con 400.
  @IsDosis()
  dosis!: number;

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  dosis_unidad?: QuimicoRateUnidad;

  @IsCantidadStock()
  cantidad!: number;
}

export class CreateAplicacionDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsEnum(AplicacionContexto)
  contexto!: AplicacionContexto;

  @IsUUID()
  lote_quimico_id!: string;

  // Hasta 6 decimales (numeric(13,6)): más se rechaza con 400 en vez de
  // redondearse al persistir. La dosis es informativa, no descuenta stock.
  @IsDosis()
  dosis!: number;

  @IsOptional()
  @IsEnum(QuimicoRateUnidad)
  dosis_unidad?: QuimicoRateUnidad;

  // Descuento literal del lote primario — el backend no calcula dosis ×
  // targets ni valida coherencia; con operation_group_id el valor es por chunk.
  // Hasta 6 decimales (numeric(13,6)): más se rechaza con 400 en vez de
  // redondearse al persistir.
  @IsCantidadStock()
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DetalleItemDto)
  detalles?: DetalleItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  bandeja_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  mesa_ids?: string[];

  // Correlaciona varias filas independientes creadas por el mismo trigger
  // lógico del usuario (ej: un pedido de >200 targets trocado en varios POST
  // secuenciales por el frontend). Si se omite, el backend genera uno nuevo
  // — pero eso solo agrupa dentro de ESTA request, no entre chunks separados.
  @IsOptional()
  @IsUUID()
  operation_group_id?: string;
}
