import {
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaPackingEnum } from '../entities/lote-packing.entity';

export class CreatePackingCategoriaDto {
  @IsEnum(CategoriaPackingEnum)
  categoria!: CategoriaPackingEnum;

  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  peso_kg!: number;

  @IsInt()
  @Min(1)
  cantidad_cajas!: number;

  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  peso_neto_por_caja!: number;
}

export class CreatePackingDto {
  @IsUUID()
  cosecha_id!: string;

  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  peso_bruto_kg!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CreatePackingCategoriaDto)
  categorias!: CreatePackingCategoriaDto[];
}
