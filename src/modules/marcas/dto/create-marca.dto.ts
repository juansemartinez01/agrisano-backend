import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateMarcaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;
}
