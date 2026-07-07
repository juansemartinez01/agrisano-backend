import { IsNumber, Min, IsOptional, IsString } from 'class-validator';

export class AjusteLoteQuimicoDto {
  @IsNumber()
  @Min(0.001)
  cantidad!: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
