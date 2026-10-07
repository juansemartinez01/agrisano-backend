import {
  CANTIDAD_STOCK_MAX,
  esCantidadStockValida,
} from './cantidad-stock.validator';

describe('esCantidadStockValida', () => {
  it.each([
    0.001, // mínimo histórico (3 decimales): compatibilidad
    0.125,
    1.5,
    0.003,
    0.000273,
    0.000282,
    0.000001, // mínimo representable
    9_999_999.999999, // máximo de numeric(13,6)
  ])('acepta %p', (value) => {
    expect(esCantidadStockValida(value)).toBe(true);
  });

  it.each([
    [0, 'cero'],
    [-1, 'negativo'],
    [0.0000005, '7 decimales (exponencial 5e-7)'],
    [1e-7, 'exponencial 1e-7 (class-validator lanzaría TypeError)'],
    [1.5e-7, 'exponencial con decimal (class-validator lo dejaría pasar)'],
    [0.1 + 0.2, 'ruido de float 0.30000000000000004'],
    [1.0000001, '7 decimales'],
    [CANTIDAD_STOCK_MAX + 1, 'fuera del rango de la columna'],
    [Infinity, 'Infinity'],
    [NaN, 'NaN'],
  ])('rechaza %p (%s)', (value) => {
    expect(esCantidadStockValida(value)).toBe(false);
  });

  it.each(['0.5', null, undefined, {}, true])(
    'rechaza lo que no es number: %p',
    (value) => {
      expect(esCantidadStockValida(value)).toBe(false);
    },
  );

  it('no tiene falsos rechazos sobre valores de 6 decimales de todo el rango', () => {
    // Todo lo que el front puede escribir con hasta 6 decimales llega por JSON
    // como el double más cercano: ninguno debe ser rechazado.
    for (let i = 0; i < 200_000; i++) {
      const magnitud = [1e1, 1e3, 1e5, 1e7][i % 4];
      const micro = Math.floor(Math.random() * magnitud * 1e6) + 1;
      const literal = (micro / 1e6).toFixed(6);
      expect([literal, esCantidadStockValida(parseFloat(literal))]).toEqual([
        literal,
        true,
      ]);
    }
  });
});
