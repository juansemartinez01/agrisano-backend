import { IsUUID, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateVariedadDto {
  @IsUUID()
  producto_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;
}
