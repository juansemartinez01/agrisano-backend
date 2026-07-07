import { IsUUID, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateProveedorDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;
}
