import {
  IsUUID,
  IsArray,
  IsOptional,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class CreateTrasplanteDto {
  @IsUUID()
  mesa_id!: string;

  @IsUUID()
  tunel_id!: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  bandeja_ids!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
