import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;
}
