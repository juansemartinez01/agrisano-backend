import {
  IsUUID,
  IsArray,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';

export class CreateTrasplanteDto {
  @IsUUID()
  mesa_id!: string;

  @IsUUID()
  tunel_id!: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  bandeja_ids!: string[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
