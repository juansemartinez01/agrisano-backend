import { IsUUID, IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateRecetaDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
