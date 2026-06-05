import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEstablecimientoDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ubicacion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
