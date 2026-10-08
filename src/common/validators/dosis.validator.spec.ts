import { DOSIS_MAX, esDosisValida } from './dosis.validator';

// El algoritmo (redondeo a la escala + comparación) se prueba a fondo en
// cantidad-stock.validator.spec.ts; acá se fija el contrato propio de dosis.
describe('esDosisValida', () => {
  it.each([
    0.5,
    1,
    0.001, // mínimo histórico (3 decimales): compatibilidad
    0.00025, // 0.25 mL/L expresado en L/L: antes se guardaba como 0.000
    0.000273,
    0.000001, // mínimo representable
    DOSIS_MAX,
  ])('acepta %p', (value) => {
    expect(esDosisValida(value)).toBe(true);
  });

  it.each<[unknown, string]>([
    [0, 'cero'],
    [-0.5, 'negativo'],
    [0.0000005, '7 decimales (exponencial 5e-7)'],
    [1e-7, 'exponencial 1e-7'],
    [1.0000001, '7 decimales'],
    [0.1 + 0.2, 'ruido de float'],
    [DOSIS_MAX + 1, 'fuera del rango de la columna'],
    [NaN, 'NaN'],
    ['0.5', 'string'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('rechaza %p (%s)', (value) => {
    expect(esDosisValida(value)).toBe(false);
  });
});
