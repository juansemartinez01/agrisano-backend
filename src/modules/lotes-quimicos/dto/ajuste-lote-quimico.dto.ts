import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCantidadStock } from 'src/common/validators/cantidad-stock.validator';

export class AjusteLoteQuimicoDto {
  @IsCantidadStock()
  cantidad!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
