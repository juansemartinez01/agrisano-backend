import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateMesaDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsUUID()
  tunel_id!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  plantas_estimadas?: number;
}
