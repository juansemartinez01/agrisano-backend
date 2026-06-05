import { IsUUID, IsString, IsNotEmpty, MaxLength, IsInt, Min } from 'class-validator';

export class CreateTunelDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsInt()
  @Min(1)
  capacidad_maxima!: number;
}
