import { IsOptional, IsString } from 'class-validator';

export class UpdateSiembraDto {
  @IsOptional()
  @IsString()
  observaciones?: string;
}
