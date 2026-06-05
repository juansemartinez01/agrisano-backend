import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMesaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  plantas_estimadas?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
