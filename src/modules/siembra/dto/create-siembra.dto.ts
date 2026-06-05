import { Type } from 'class-transformer';
import {
  IsUUID,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsInt,
  Min,
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
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BandejaGroupDto)
  bandejas!: BandejaGroupDto[];
}
