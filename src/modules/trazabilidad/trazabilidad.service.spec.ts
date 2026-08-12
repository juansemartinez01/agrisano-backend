import { TrazabilidadService } from './trazabilidad.service';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const COSECHA_ID = '11111111-1111-1111-1111-111111111111';
const MESA_ID = '22222222-2222-2222-2222-222222222222';
const BANDEJA_ID = '33333333-3333-3333-3333-333333333333';
const SIEMBRA_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';
const LOTE_SEMILLA_ID = '66666666-6666-6666-6666-666666666666';
const LOTE_SUSTRATO_ID = '77777777-7777-7777-7777-777777777777';
const LOTE_VERMICULITA_ID = '88888888-8888-8888-8888-888888888888';

const CYCLE_DATE = '2026-01-10';

/** Fila cruda de mesa_bandeja tal como la devuelve el SELECT del ciclo. */
function rawBandeja(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    bandeja_id: BANDEJA_ID,
    fecha_trasplante: CYCLE_DATE,
    siembra_id: SIEMBRA_ID,
    lote_semilla_id: LOTE_SEMILLA_ID,
    lote_sustrato_id: LOTE_SUSTRATO_ID,
    lote_vermiculita_id: null,
    estado: 'trasplantada',
    carencia_hasta: null,
    s_id: SIEMBRA_ID,
    s_fecha: '2026-01-01',
    s_obs: null,
    s_usuario_id: USER_ID,
    su_email: 'op@innoview.local',
    su_nombre: 'Op',
    su_apellido: 'Uno',
    lote_semilla_numero: 'LS-001',
    lote_semilla_tipo: 'semilla',
    lote_sustrato_numero: 'LSU-001',
    lote_sustrato_tipo: 'sustrato',
    lote_vermiculita_numero: null,
    lote_vermiculita_tipo: null,
    lote_vermiculita_grado: null,
    ...overrides,
  };
}

describe('TrazabilidadService — lote de vermiculita en el ciclo', () => {
  let service: TrazabilidadService;
  let query: jest.Mock;
  let bandejaRows: Record<string, unknown>[];

  beforeEach(() => {
    bandejaRows = [rawBandeja()];

    // El servicio dispara varias queries crudas en paralelo; despachamos por el
    // texto del SQL para devolverle a cada una su forma esperada.
    query = jest.fn((sql: string) => {
      // El orden importa: la query de cycle_date también sale de mesa_bandeja.
      if (sql.includes('MAX(mb.fecha_trasplante)'))
        return Promise.resolve([{ cycle_date: CYCLE_DATE }]);
      if (sql.includes('SELECT mb.bandeja_id'))
        return Promise.resolve(bandejaRows);
      return Promise.resolve([]);
    });

    const dataSource = { query } as unknown as ConstructorParameters<
      typeof TrazabilidadService
    >[0];
    const tenancy = {
      requireTenantId: jest.fn().mockReturnValue(TENANT_ID),
    } as unknown as ConstructorParameters<typeof TrazabilidadService>[1];
    const cosechaService = {
      getCosechaById: jest.fn().mockResolvedValue({
        id: COSECHA_ID,
        mesa_id: MESA_ID,
        fecha_hora: '2026-02-01T10:00:00.000Z',
        producto_id: null,
        variedad_id: null,
        usuario: null,
      }),
    } as unknown as ConstructorParameters<typeof TrazabilidadService>[2];
    const mesasService = {} as unknown as ConstructorParameters<
      typeof TrazabilidadService
    >[3];

    service = new TrazabilidadService(
      dataSource,
      tenancy,
      cosechaService,
      mesasService,
    );
  });

  it('mapea lote_vermiculita con su grado cuando la bandeja lo tiene', async () => {
    bandejaRows = [
      rawBandeja({
        lote_vermiculita_id: LOTE_VERMICULITA_ID,
        lote_vermiculita_numero: 'LV-001',
        lote_vermiculita_tipo: 'vermiculita',
        lote_vermiculita_grado: 2,
      }),
    ];

    const res = await service.getTrazabilidadByCosecha(COSECHA_ID);

    expect(res.bandejas_ciclo[0].siembra?.lote_vermiculita).toEqual({
      id: LOTE_VERMICULITA_ID,
      numero_lote: 'LV-001',
      tipo: 'vermiculita',
      grado: 2,
    });
  });

  it('deja lote_vermiculita en null cuando la bandeja no lo tiene', async () => {
    const res = await service.getTrazabilidadByCosecha(COSECHA_ID);

    expect(res.bandejas_ciclo[0].siembra?.lote_vermiculita).toBeNull();
  });

  // SC-007: las bandejas anteriores a la feature tienen lote_vermiculita_id NULL
  // y tienen que seguir apareciendo enteras, sin numero_lote undefined colado
  // por copiar el non-null assertion de semilla/sustrato.
  it('no rompe las bandejas previas a la feature', async () => {
    const res = await service.getTrazabilidadByCosecha(COSECHA_ID);

    expect(res.bandejas_ciclo).toHaveLength(1);
    const siembra = res.bandejas_ciclo[0].siembra;
    expect(siembra?.lote_semilla).toEqual({
      id: LOTE_SEMILLA_ID,
      numero_lote: 'LS-001',
      tipo: 'semilla',
    });
    expect(siembra?.lote_sustrato).toEqual({
      id: LOTE_SUSTRATO_ID,
      numero_lote: 'LSU-001',
      tipo: 'sustrato',
    });
  });

  it('expone lote_vermiculita_id en la fila de la bandeja', async () => {
    bandejaRows = [
      rawBandeja({
        lote_vermiculita_id: LOTE_VERMICULITA_ID,
        lote_vermiculita_numero: 'LV-001',
        lote_vermiculita_tipo: 'vermiculita',
        lote_vermiculita_grado: 3,
      }),
    ];

    const res = await service.getTrazabilidadByCosecha(COSECHA_ID);

    expect(res.bandejas_ciclo[0].lote_vermiculita_id).toBe(LOTE_VERMICULITA_ID);
  });

  it('hace LEFT JOIN a lotes por lote_vermiculita_id y trae el grado', async () => {
    await service.getTrazabilidadByCosecha(COSECHA_ID);

    const calls = query.mock.calls as [string, unknown[]][];
    const cicloSql = calls.find(([sql]) =>
      sql.includes('SELECT mb.bandeja_id'),
    );
    expect(cicloSql).toBeDefined();
    expect(cicloSql![0]).toContain('lv.id = b.lote_vermiculita_id');
    expect(cicloSql![0]).toContain('lv.grado AS lote_vermiculita_grado');
  });
});
