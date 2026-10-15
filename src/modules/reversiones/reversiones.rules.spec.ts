import {
  contarDesplazadas,
  diferencias,
  isUuid,
  parseCosechaDetalle,
  parseEstadoPrevio,
  parseTrasplanteDetalle,
  posicionesTrasQuitar,
  posicionesTrasReinsertar,
  resolverEstadoPrevio,
  ultimaPosicion,
} from './reversiones.rules';

const T1 = '11111111-1111-4111-8111-111111111111';
const B1 = '22222222-2222-4222-8222-222222222222';
const B2 = '33333333-3333-4333-8333-333333333333';
const C1 = '44444444-4444-4444-8444-444444444444';

describe('reversiones.rules', () => {
  describe('isUuid', () => {
    it('acepta uuids y rechaza todo lo demas', () => {
      expect(isUuid(T1)).toBe(true);
      expect(isUuid('no-es-uuid')).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(42)).toBe(false);
    });
  });

  describe('parseEstadoPrevio', () => {
    const base = {
      estado: 'en_cosecha',
      tunel_id: T1,
      posicion_actual: null,
      fecha_ultimo_trasplante: '2026-09-01 10:00:00.123456+00',
    };

    it('parsea un estado valido conservando la fecha como texto', () => {
      expect(parseEstadoPrevio(base)).toEqual({
        estado: 'en_cosecha',
        tunel_id: T1,
        fecha_ultimo_trasplante: '2026-09-01 10:00:00.123456+00',
      });
    });

    it('acepta fecha ausente o null', () => {
      expect(
        parseEstadoPrevio({ ...base, fecha_ultimo_trasplante: null })
          ?.fecha_ultimo_trasplante,
      ).toBeNull();
      expect(
        parseEstadoPrevio({ ...base, fecha_ultimo_trasplante: undefined })
          ?.fecha_ultimo_trasplante,
      ).toBeNull();
    });

    it.each([
      ['no es objeto', 'x'],
      ['null', null],
      ['array', []],
      ['estado desconocido', { ...base, estado: 'baja' }],
      ['estado null', { ...base, estado: null }],
      ['tunel invalido', { ...base, tunel_id: 'abc' }],
      ['tenia posicion', { ...base, posicion_actual: 3 }],
      ['fecha no textual', { ...base, fecha_ultimo_trasplante: 123 }],
    ])('rechaza: %s', (_n, v) => {
      expect(parseEstadoPrevio(v)).toBeNull();
    });
  });

  describe('parseTrasplanteDetalle', () => {
    it('lee un detalle completo', () => {
      const d = parseTrasplanteDetalle({
        tunel_id: T1,
        posicion_actual: 5,
        bandeja_ids: [B1, B2],
        estado_previo: {
          estado: 'activa',
          tunel_id: T1,
          posicion_actual: null,
          fecha_ultimo_trasplante: null,
        },
      });
      expect(d.tunel_id).toBe(T1);
      expect(d.posicion_actual).toBe(5);
      expect(d.bandeja_ids).toEqual([B1, B2]);
      expect(d.estado_previo?.estado).toBe('activa');
    });

    it('detalle legacy: sin estado_previo', () => {
      const d = parseTrasplanteDetalle({
        tunel_id: T1,
        posicion_actual: 5,
        bandeja_ids: [B1],
      });
      expect(d.estado_previo).toBeNull();
      expect(d.bandeja_ids).toEqual([B1]);
    });

    it('ante un bandeja_ids corrupto no devuelve nada a medias', () => {
      expect(
        parseTrasplanteDetalle({ bandeja_ids: [B1, 'roto'] }).bandeja_ids,
      ).toEqual([]);
      expect(parseTrasplanteDetalle({ bandeja_ids: 'x' }).bandeja_ids).toEqual(
        [],
      );
    });

    it('tolera basura', () => {
      for (const v of [null, undefined, 'x', 7, []]) {
        expect(parseTrasplanteDetalle(v)).toEqual({
          tunel_id: null,
          posicion_actual: null,
          bandeja_ids: [],
          estado_previo: null,
        });
      }
    });
  });

  describe('parseCosechaDetalle', () => {
    it('extrae el id de cosecha', () => {
      expect(parseCosechaDetalle({ cosecha_id: C1, peso_kg: 3 })).toEqual({
        cosecha_id: C1,
      });
    });
    it('devuelve null si falta o no es uuid', () => {
      expect(parseCosechaDetalle({ cosecha_id: 'x' }).cosecha_id).toBeNull();
      expect(parseCosechaDetalle(null).cosecha_id).toBeNull();
    });
  });

  describe('resolverEstadoPrevio', () => {
    const registrado = {
      estado: 'activa' as const,
      tunel_id: T1,
      fecha_ultimo_trasplante: null,
    };

    it('prefiere el estado registrado', () => {
      const r = resolverEstadoPrevio({
        registrado,
        eventoPrevioTipo: null,
        cosechaPreviaTunelId: null,
        fechaCicloAnterior: null,
      });
      expect(r).toEqual({ ok: true, estado: registrado, origen: 'registrado' });
    });

    it('legacy: infiere en_cosecha cuando el evento previo es una cosecha', () => {
      const r = resolverEstadoPrevio({
        registrado: null,
        eventoPrevioTipo: 'cosecha',
        cosechaPreviaTunelId: T1,
        fechaCicloAnterior: '2026-08-01 00:00:00+00',
      });
      expect(r).toEqual({
        ok: true,
        origen: 'inferido',
        estado: {
          estado: 'en_cosecha',
          tunel_id: T1,
          fecha_ultimo_trasplante: '2026-08-01 00:00:00+00',
        },
      });
    });

    it.each([
      ['no hay evento previo', null, T1, 'x'],
      ['el evento previo no es cosecha', 'trasplante', T1, 'x'],
      ['no se ubica la cosecha previa', 'cosecha', null, 'x'],
      ['no hay fecha del ciclo anterior', 'cosecha', T1, null],
    ])('legacy: rechaza si %s', (_n, tipo, tunel, fecha) => {
      const r = resolverEstadoPrevio({
        registrado: null,
        eventoPrevioTipo: tipo,
        cosechaPreviaTunelId: tunel,
        fechaCicloAnterior: fecha,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo.length).toBeGreaterThan(10);
    });
  });

  describe('posiciones', () => {
    const fila = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);

    it('ultimaPosicion: 0 si esta vacio', () => {
      expect(ultimaPosicion(new Map())).toBe(0);
      expect(ultimaPosicion(fila)).toBe(4);
    });

    it('posicionesTrasQuitar solo saca la mesa', () => {
      const r = posicionesTrasQuitar(fila, 'd');
      expect([...r]).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      expect(fila.size).toBe(4); // no muta el original
    });

    it('posicionesTrasReinsertar corre las de atras y es inversa de la cosecha', () => {
      // cosecha de "a" (pos 1): las demas bajan 1
      const trasCosecha = new Map([
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]);
      expect(posicionesTrasReinsertar(trasCosecha, 'a', 1)).toEqual(fila);
    });

    it('reinsertar en el medio', () => {
      const r = posicionesTrasReinsertar(
        new Map([
          ['a', 1],
          ['c', 2],
        ]),
        'b',
        2,
      );
      expect(r).toEqual(
        new Map([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]),
      );
    });

    it('diferencias detecta cambios, altas y bajas', () => {
      expect(diferencias(fila, fila)).toEqual([]);
      expect(
        diferencias(
          new Map([
            ['a', 1],
            ['b', 2],
          ]),
          new Map([
            ['a', 1],
            ['b', 3],
            ['z', 1],
          ]),
        ).sort(),
      ).toEqual(['b', 'z']);
      expect(diferencias(new Map([['a', 1]]), new Map())).toEqual(['a']);
    });

    it('contarDesplazadas ignora a la mesa revertida', () => {
      const antes = new Map([
        ['b', 1],
        ['c', 2],
      ]);
      const despues = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      expect(contarDesplazadas(antes, despues, 'a')).toBe(2);
      expect(contarDesplazadas(fila, fila, 'a')).toBe(0);
    });
  });
});
