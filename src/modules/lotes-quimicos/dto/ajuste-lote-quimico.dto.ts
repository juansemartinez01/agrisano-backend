import { IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';

export class AjusteLoteQuimicoDto {
  @IsNumber()
  @Min(0.001)
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
