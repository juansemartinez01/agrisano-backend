import { SiembraService } from './siembra.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { Lote, LoteEstado, LoteTipo } from '../lotes/entities/lote.entity';
import { BandejaGroupDto, CreateSiembraDto } from './dto/create-siembra.dto';
import * as usuarioResumenUtil from '../../common/utils/usuario-resumen.util';

jest.mock('../../common/utils/usuario-resumen.util');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ESTABLECIMIENTO_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SIEMBRA_ID = '66666666-6666-6666-6666-666666666666';
const LOTE_SEMILLA_ID = '44444444-4444-4444-4444-444444444444';
const LOTE_SUSTRATO_ID = '55555555-5555-5555-5555-555555555555';
const LOTE_VERMICULITA_ID = '77777777-7777-7777-7777-777777777777';

const CONNECT_MARKER = new Error('__reached_transaction__');

function baseLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: LOTE_SEMILLA_ID,
    tenant_id: TENANT_ID,
    tipo: LoteTipo.SEMILLA,
    numero_lote: 'L-001',
    establecimiento_id: null,
    proveedor_id: null,
    marca_id: null,
    observaciones: null,
    activo: true,
    estado: LoteEstado.HABILITADO,
    fecha_consumido: null,
    usuario_consumido_id: null,
    usuario_consumido_email_snapshot: null,
    usuario_consumido_nombre_snapshot: null,
    usuario_consumido_apellido_snapshot: null,
    observaciones_consumo: null,
    producto_id: null,
    variedad_id: null,
    batch: null,
    proveedor_semilla_id: null,
    grado: null,
    ...overrides,
  } as Lote;
}

function makeDto(
  groupOverrides: Partial<BandejaGroupDto> = {},
): CreateSiembraDto {
  return {
    establecimiento_id: ESTABLECIMIENTO_ID,
    bandejas: [
      {
        lote_semilla_id: LOTE_SEMILLA_ID,
        lote_sustrato_id: LOTE_SUSTRATO_ID,
        cantidad: 2,
        ...groupOverrides,
      },
    ],
  };
}

/**
 * Query runner que sí atraviesa la transacción, para poder inspeccionar con qué
 * datos se crea cada bandeja. El resto de los tests del archivo usan el runner
 * que rechaza en connect() y solo verifican las guardas previas.
 */
function mockWorkingQueryRunner() {
  const created: Record<string, unknown>[] = [];
  const qr = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => {
        created.push(data);
        return data;
      }),
      save: jest.fn((_entity: unknown, row: Record<string, unknown>) =>
        Promise.resolve({ id: SIEMBRA_ID, ...row }),
      ),
    },
  };
  return { qr, created };
}

/** Solo las filas de bandeja de lo que pasó por manager.create. */
function bandejasCreadas(
  created: Record<string, unknown>[],
): Record<string, unknown>[] {
  return created.filter((row) => 'codigo' in row);
}

describe('SiembraService.createSiembra — guards de disponibilidad de lotes', () => {
  let dataSource: { createQueryRunner: jest.Mock };
  let siembraRepo: { findOne: jest.Mock };
  let bandejaRepo: { createQueryBuilder: jest.Mock };
  let lotesService: { mustFindById: jest.Mock };
  let estService: { mustFindById: jest.Mock };
  let tenancy: { requireTenantId: jest.Mock };
  let svc: SiembraService;

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource = {
      createQueryRunner: jest.fn(() => ({
        connect: jest.fn().mockRejectedValue(CONNECT_MARKER),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {},
      })),
    };
    // Necesarios solo para el getSiembraWithBandejas del final de createSiembra
    siembraRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: SIEMBRA_ID,
        tenant_id: TENANT_ID,
        usuario_id: USER_ID,
      }),
    };
    bandejaRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndMapOne: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    lotesService = { mustFindById: jest.fn() };
    estService = {
      mustFindById: jest.fn().mockResolvedValue({ id: ESTABLECIMIENTO_ID }),
    };
    tenancy = { requireTenantId: jest.fn().mockReturnValue(TENANT_ID) };

    (usuarioResumenUtil.fetchUsuarioSnapshot as jest.Mock).mockResolvedValue({
      usuario_email_snapshot: null,
      usuario_nombre_snapshot: null,
      usuario_apellido_snapshot: null,
    });
    (usuarioResumenUtil.buildUsuariosMap as jest.Mock).mockResolvedValue(
      new Map(),
    );
    (usuarioResumenUtil.resolveUsuarioResumen as jest.Mock).mockReturnValue(
      null,
    );

    svc = new SiembraService(
      dataSource as any,
      siembraRepo as any,
      bandejaRepo as any,
      lotesService as any,
      estService as any,
      tenancy as any,
    );
  });

  /** Los tres lotes disponibles, salvo lo que se pise por parámetro. */
  function mockLotes(
    overrides: {
      semilla?: Partial<Lote>;
      sustrato?: Partial<Lote>;
      vermiculita?: Partial<Lote>;
    } = {},
  ) {
    lotesService.mustFindById.mockImplementation((id: string) => {
      if (id === LOTE_SEMILLA_ID) {
        return Promise.resolve(
          baseLote({ id, tipo: LoteTipo.SEMILLA, ...overrides.semilla }),
        );
      }
      if (id === LOTE_SUSTRATO_ID) {
        return Promise.resolve(
          baseLote({ id, tipo: LoteTipo.SUSTRATO, ...overrides.sustrato }),
        );
      }
      return Promise.resolve(
        baseLote({
          id,
          tipo: LoteTipo.VERMICULITA,
          grado: 2,
          ...overrides.vermiculita,
        }),
      );
    });
  }

  it('rechaza con 422 LOTE_CONSUMIDO si el lote de semilla está consumido', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({
              id,
              tipo: LoteTipo.SEMILLA,
              estado: LoteEstado.CONSUMIDO,
            })
          : baseLote({ id, tipo: LoteTipo.SUSTRATO }),
      ),
    );

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toMatchObject({
      code: ErrorCodes.LOTE_CONSUMIDO,
      status: 422,
      message: expect.stringContaining(LOTE_SEMILLA_ID),
    });
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rechaza con 422 LOTE_CONSUMIDO si el lote de sustrato está consumido', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({ id, tipo: LoteTipo.SEMILLA })
          : baseLote({
              id,
              tipo: LoteTipo.SUSTRATO,
              estado: LoteEstado.CONSUMIDO,
            }),
      ),
    );

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toMatchObject({
      code: ErrorCodes.LOTE_CONSUMIDO,
      status: 422,
      message: expect.stringContaining(LOTE_SUSTRATO_ID),
    });
  });

  it('rechaza con 422 LOTE_INACTIVO si el lote de semilla está dado de baja (sin estar consumido)', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({ id, tipo: LoteTipo.SEMILLA, activo: false })
          : baseLote({ id, tipo: LoteTipo.SUSTRATO }),
      ),
    );

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toMatchObject({
      code: ErrorCodes.LOTE_INACTIVO,
      status: 422,
      message: expect.stringContaining(LOTE_SEMILLA_ID),
    });
  });

  it('caso mixto: semilla disponible + sustrato no disponible identifica el sustrato', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({
              id,
              tipo: LoteTipo.SEMILLA,
              activo: true,
              estado: LoteEstado.HABILITADO,
            })
          : baseLote({ id, tipo: LoteTipo.SUSTRATO, activo: false }),
      ),
    );

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toMatchObject({
      code: ErrorCodes.LOTE_INACTIVO,
      status: 422,
      message: expect.stringContaining(LOTE_SUSTRATO_ID),
    });
  });

  it('caso feliz: ambos lotes habilitados y activos siguen el flujo normal (no lanza error de guard)', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({ id, tipo: LoteTipo.SEMILLA })
          : baseLote({ id, tipo: LoteTipo.SUSTRATO }),
      ),
    );

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toBe(
      CONNECT_MARKER,
    );
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });

  describe('lote de vermiculita', () => {
    it('asigna el lote de vermiculita a todas las bandejas del grupo', async () => {
      mockLotes();
      const { qr, created } = mockWorkingQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(qr);

      await svc.createSiembra(
        makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
        USER_ID,
      );

      const bandejas = bandejasCreadas(created);
      expect(bandejas).toHaveLength(2);
      for (const bandeja of bandejas) {
        expect(bandeja.lote_vermiculita_id).toBe(LOTE_VERMICULITA_ID);
      }
    });

    it('acepta la siembra sin vermiculita y deja las bandejas en null', async () => {
      mockLotes();
      const { qr, created } = mockWorkingQueryRunner();
      dataSource.createQueryRunner.mockReturnValue(qr);

      await svc.createSiembra(makeDto(), USER_ID);

      const bandejas = bandejasCreadas(created);
      expect(bandejas).toHaveLength(2);
      for (const bandeja of bandejas) {
        expect(bandeja.lote_vermiculita_id).toBeNull();
      }
      // No se leyó un tercer lote que nadie pidió
      expect(lotesService.mustFindById).toHaveBeenCalledTimes(2);
    });

    it('rechaza con 422 LOTE_TIPO_INCORRECTO si el lote informado no es de vermiculita', async () => {
      mockLotes({ vermiculita: { tipo: LoteTipo.SEMILLA } });

      await expect(
        svc.createSiembra(
          makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_TIPO_INCORRECTO,
        status: 422,
        message: expect.stringContaining(LOTE_VERMICULITA_ID),
      });
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('rechaza con 422 LOTE_CONSUMIDO identificando el lote de vermiculita', async () => {
      mockLotes({ vermiculita: { estado: LoteEstado.CONSUMIDO } });

      await expect(
        svc.createSiembra(
          makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_CONSUMIDO,
        status: 422,
        message: expect.stringContaining(LOTE_VERMICULITA_ID),
      });
    });

    it('rechaza con 422 LOTE_INACTIVO identificando el lote de vermiculita', async () => {
      mockLotes({ vermiculita: { activo: false } });

      await expect(
        svc.createSiembra(
          makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_INACTIVO,
        status: 422,
        message: expect.stringContaining(LOTE_VERMICULITA_ID),
      });
    });

    it('rechaza con 422 LOTE_ESTABLECIMIENTO_MISMATCH identificando el lote de vermiculita', async () => {
      mockLotes({
        vermiculita: {
          establecimiento_id: '99999999-9999-9999-9999-999999999999',
        },
      });

      await expect(
        svc.createSiembra(
          makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_ESTABLECIMIENTO_MISMATCH,
        status: 422,
        message: expect.stringContaining(LOTE_VERMICULITA_ID),
      });
    });

    // La vermiculita se valida al final del grupo, así que no cambia qué error
    // reportan las siembras que ya fallaban antes de esta feature.
    it('con semilla y vermiculita invalidas reporta la semilla', async () => {
      mockLotes({
        semilla: { estado: LoteEstado.CONSUMIDO },
        vermiculita: { estado: LoteEstado.CONSUMIDO },
      });

      await expect(
        svc.createSiembra(
          makeDto({ lote_vermiculita_id: LOTE_VERMICULITA_ID }),
          USER_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_CONSUMIDO,
        status: 422,
        message: expect.stringContaining(LOTE_SEMILLA_ID),
      });
    });
  });
});
