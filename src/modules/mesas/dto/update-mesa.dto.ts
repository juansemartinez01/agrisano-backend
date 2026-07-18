import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateMesaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  plantas_estimadas?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
