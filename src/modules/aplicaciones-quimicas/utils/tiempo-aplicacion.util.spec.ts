import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  duracionSegundos,
  resolverTiempoAplicacion,
} from './tiempo-aplicacion.util';

const AHORA = new Date('2026-10-28T12:00:00Z');
const min = (n: number) => new Date(AHORA.getTime() + n * 60_000);

function codigoDe(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'NO_APP_ERROR';
  }
  return undefined;
}

describe('resolverTiempoAplicacion — alta', () => {
  it('usa inicio y fin enviados', () => {
    const r = resolverTiempoAplicacion({
      inicio: min(-45).toISOString(),
      fin: AHORA.toISOString(),
      ahora: AHORA,
    });
    expect(r.inicio).toEqual(min(-45));
    expect(r.fin).toEqual(AHORA);
  });

  it('sin fin, el fin es ahora', () => {
    const r = resolverTiempoAplicacion({
      inicio: min(-10).toISOString(),
      ahora: AHORA,
    });
    expect(r.fin).toEqual(AHORA);
  });

  it('sin inicio rechaza', () => {
    expect(codigoDe(() => resolverTiempoAplicacion({ ahora: AHORA }))).toBe(
      ErrorCodes.APLICACION_HORARIO_INVALIDO,
    );
  });

  it('inicio == fin se acepta', () => {
    const r = resolverTiempoAplicacion({
      inicio: min(-5),
      fin: min(-5),
      ahora: AHORA,
    });
    expect(duracionSegundos(r.inicio, r.fin)).toBe(0);
  });

  it('fin anterior al inicio rechaza', () => {
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({
          inicio: min(-5),
          fin: min(-10),
          ahora: AHORA,
        }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('fin +3 min se acepta (tolerancia) y +10 min rechaza', () => {
    expect(() =>
      resolverTiempoAplicacion({ inicio: min(-60), fin: min(3), ahora: AHORA }),
    ).not.toThrow();
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({
          inicio: min(-60),
          fin: min(10),
          ahora: AHORA,
        }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('exactamente 24 h se acepta; 24 h + 1 s rechaza', () => {
    const fin = min(-1);
    expect(() =>
      resolverTiempoAplicacion({
        inicio: new Date(fin.getTime() - 24 * 3600_000),
        fin,
        ahora: AHORA,
      }),
    ).not.toThrow();
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({
          inicio: new Date(fin.getTime() - 24 * 3600_000 - 1000),
          fin,
          ahora: AHORA,
        }),
      ),
    ).toBe(ErrorCodes.APLICACION_DURACION_EXCESIVA);
  });
});

describe('resolverTiempoAplicacion — corrección', () => {
  const actual = { inicio: min(-120), fin: min(-60) };

  it('solo fin: valida contra el inicio guardado', () => {
    const r = resolverTiempoAplicacion({ fin: min(-30), ahora: AHORA, actual });
    expect(r.inicio).toEqual(actual.inicio);
    expect(r.fin).toEqual(min(-30));
  });

  it('solo fin anterior al inicio guardado rechaza', () => {
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({ fin: min(-130), ahora: AHORA, actual }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('solo inicio: valida contra el fin guardado', () => {
    const r = resolverTiempoAplicacion({
      inicio: min(-90),
      ahora: AHORA,
      actual,
    });
    expect(r.inicio).toEqual(min(-90));
    expect(r.fin).toEqual(actual.fin);
  });

  it('solo inicio posterior al fin guardado rechaza', () => {
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({ inicio: min(-30), ahora: AHORA, actual }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('solo inicio no revalida un fin guardado "futuro"', () => {
    const futuro = { inicio: min(-10), fin: min(30) };
    expect(() =>
      resolverTiempoAplicacion({
        inicio: min(-20),
        ahora: AHORA,
        actual: futuro,
      }),
    ).not.toThrow();
  });

  it('fin enviado en el futuro rechaza', () => {
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({ fin: min(20), ahora: AHORA, actual }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('duración > 24 h al corregir rechaza', () => {
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({
          inicio: min(-60 * 30),
          ahora: AHORA,
          actual,
        }),
      ),
    ).toBe(ErrorCodes.APLICACION_DURACION_EXCESIVA);
  });

  it('fila vieja con un solo extremo rechaza', () => {
    const vieja = { inicio: null, fin: null };
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({ fin: min(-1), ahora: AHORA, actual: vieja }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
    expect(
      codigoDe(() =>
        resolverTiempoAplicacion({
          inicio: min(-30),
          ahora: AHORA,
          actual: null,
        }),
      ),
    ).toBe(ErrorCodes.APLICACION_HORARIO_INVALIDO);
  });

  it('fila vieja con ambos extremos se completa', () => {
    const r = resolverTiempoAplicacion({
      inicio: min(-30),
      fin: min(-5),
      ahora: AHORA,
      actual: { inicio: null, fin: null },
    });
    expect(duracionSegundos(r.inicio, r.fin)).toBe(25 * 60);
  });
});

describe('duracionSegundos', () => {
  it('diferencia en segundos', () => {
    expect(duracionSegundos(min(-45), AHORA)).toBe(2700);
  });

  it('acepta strings ISO', () => {
    expect(
      duracionSegundos('2026-10-28T08:00:00Z', '2026-10-28T08:00:30.400Z'),
    ).toBe(30);
  });

  it.each([
    [null, AHORA],
    [AHORA, null],
    [null, null],
    [undefined, undefined],
  ])('null si falta un extremo (%p, %p)', (a, b) => {
    expect(duracionSegundos(a, b)).toBeNull();
  });
});
