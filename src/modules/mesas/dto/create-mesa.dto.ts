import { IsUUID } from 'class-validator';

export class CreateMesaDto {
  @IsUUID()
  establecimiento_id!: string;

  @IsUUID()
  tunel_id!: string;
}
