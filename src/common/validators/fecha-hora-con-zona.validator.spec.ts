import { esFechaHoraConZona } from './fecha-hora-con-zona.validator';

describe('esFechaHoraConZona', () => {
  it.each([
    '2026-10-28T08:00:00Z',
    '2026-10-28T08:00:00.123Z',
    '2026-10-28T08:00:00-03:00',
    '2026-10-28T08:00:00+0530',
    '2026-10-28T08:00Z',
    '2024-02-29T23:59:59Z', // bisiesto
  ])('acepta %p', (value) => {
    expect(esFechaHoraConZona(value)).toBe(true);
  });

  it.each<[unknown, string]>([
    ['2026-10-28', 'fecha sola'],
    ['2026-10-28T08:00:00', 'hora sin zona'],
    ['2026-10-28 08:00:00Z', 'separador espacio'],
    ['2026-02-30T08:00:00Z', 'día inexistente'],
    ['2026-13-01T08:00:00Z', 'mes inexistente'],
    ['2026-10-28T24:00:00Z', 'hora 24'],
    ['2026-10-28T08:60:00Z', 'minuto 60'],
    ['ayer', 'texto'],
    [1730102400000, 'número'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('rechaza %p (%s)', (value) => {
    expect(esFechaHoraConZona(value)).toBe(false);
  });
});
