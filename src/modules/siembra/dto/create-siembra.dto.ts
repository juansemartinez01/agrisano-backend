import { Type } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class BandejaGroupDto {
  @IsUUID()
  lote_semilla_id!: string;

  @IsUUID()
  lote_sustrato_id!: string;

  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class CreateSiembraDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BandejaGroupDto)
  bandejas!: BandejaGroupDto[];
}
