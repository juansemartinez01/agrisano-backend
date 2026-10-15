import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RevertirDto {
  /**
   * Si es true ejecuta toda la reversion dentro de una transaccion y la deshace
   * al final: devuelve exactamente lo que pasaria, sin cambiar nada.
   */
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  /** Queda en la auditoria. Obligatorio salvo en la simulacion. */
  @ValidateIf((o: RevertirDto) => o.dry_run !== true)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  motivo?: string;
}
