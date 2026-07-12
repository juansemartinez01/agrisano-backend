import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSiembraDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
