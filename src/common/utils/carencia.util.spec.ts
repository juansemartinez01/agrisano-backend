import { calcularCarenciaHasta } from './carencia.util';

describe('calcularCarenciaHasta', () => {
  it('suma los días al día UTC del fin', () => {
    expect(calcularCarenciaHasta(new Date('2026-10-10T08:00:00Z'), 3)).toBe(
      '2026-10-13',
    );
  });

  it('usa el día UTC aunque el fin sea tarde en UTC', () => {
    expect(calcularCarenciaHasta(new Date('2026-10-10T23:30:00Z'), 3)).toBe(
      '2026-10-13',
    );
  });

  it('una aplicación a las 22:00 en UTC-3 cae en el día UTC siguiente', () => {
    expect(
      calcularCarenciaHasta(new Date('2026-10-10T22:00:00-03:00'), 3),
    ).toBe('2026-10-14');
  });

  it('cruza fin de mes y de año', () => {
    expect(calcularCarenciaHasta(new Date('2026-12-30T12:00:00Z'), 5)).toBe(
      '2027-01-04',
    );
  });

  it('0 días devuelve el mismo día', () => {
    expect(calcularCarenciaHasta(new Date('2026-10-10T12:00:00Z'), 0)).toBe(
      '2026-10-10',
    );
  });

  it('no muta la fecha recibida', () => {
    const fin = new Date('2026-10-10T12:00:00Z');
    calcularCarenciaHasta(fin, 7);
    expect(fin.toISOString()).toBe('2026-10-10T12:00:00.000Z');
  });
});
