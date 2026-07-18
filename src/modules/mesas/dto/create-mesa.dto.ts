import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMesaDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsUUID()
  tunel_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;
}
