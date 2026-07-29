import { IsOptional, Matches } from 'class-validator';

export class IngresarNurseryDto {
  // Día calendario, sin hora. Se usa @Matches en lugar de @IsDateString porque
  // este último aceptaría timestamps completos ("2026-07-20T10:00:00Z") y el
  // contrato es solo el día. La validez calendaria (2026-02-31) se valida en el service.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha_entrada debe tener formato YYYY-MM-DD (solo día, sin hora)',
  })
  fecha_entrada?: string;
}
