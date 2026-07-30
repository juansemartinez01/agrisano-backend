import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConsumirLoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones_consumo?: string;
}
