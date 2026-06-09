import { IsUUID, IsNumber, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCosechaDto {
  @IsUUID()
  mesa_id!: string;

  @IsNumber()
  @Min(0.001)
  @Max(9999999.999)
  peso_kg!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
}
