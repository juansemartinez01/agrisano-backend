import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdatePrincipioActivoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;
}
