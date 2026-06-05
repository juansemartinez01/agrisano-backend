import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength, IsInt, Min } from 'class-validator';

export class UpdateTunelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidad_maxima?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
