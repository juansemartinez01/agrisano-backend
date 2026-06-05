import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { HistorialTipoEvento } from '../entities/historial-mesa.entity';

export class CreateHistorialDto {
  @IsUUID()
  mesa_id!: string;

  @IsEnum(HistorialTipoEvento)
  tipo_evento!: HistorialTipoEvento;

  @IsOptional()
  @IsObject()
  detalle?: Record<string, unknown>;

  @IsUUID()
  usuario_id!: string;

  @IsUUID()
  tenant_id!: string;
}
