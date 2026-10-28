/**
 * Día (YYYY-MM-DD, UTC) hasta el cual rige la carencia: el instante de fin de
 * la aplicación más los días de carencia del químico.
 *
 * Todo en UTC a propósito: no depende de la zona horaria del proceso, así el
 * registro de aplicaciones y la trazabilidad calculan siempre el mismo día.
 */
export function calcularCarenciaHasta(fin: Date, dias: number): string {
  const d = new Date(fin.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
}
