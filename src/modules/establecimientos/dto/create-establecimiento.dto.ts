import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateEstablecimientoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ubicacion?: string;
}
