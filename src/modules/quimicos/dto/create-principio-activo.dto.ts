import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreatePrincipioActivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;
}
