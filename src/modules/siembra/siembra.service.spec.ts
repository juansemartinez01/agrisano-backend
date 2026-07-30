import { SiembraService } from './siembra.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { Lote, LoteEstado, LoteTipo } from '../lotes/entities/lote.entity';
import { CreateSiembraDto } from './dto/create-siembra.dto';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ESTABLECIMIENTO_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const LOTE_SEMILLA_ID = '44444444-4444-4444-4444-444444444444';
const LOTE_SUSTRATO_ID = '55555555-5555-5555-5555-555555555555';

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
    ...overrides,
  } as Lote;
}

function makeDto(): CreateSiembraDto {
  return {
    establecimiento_id: ESTABLECIMIENTO_ID,
    bandejas: [
      { lote_semilla_id: LOTE_SEMILLA_ID, lote_sustrato_id: LOTE_SUSTRATO_ID, cantidad: 2 },
    ],
  };
}

describe('SiembraService.createSiembra — guards de disponibilidad de lotes', () => {
  let dataSource: { createQueryRunner: jest.Mock };
  let lotesService: { mustFindById: jest.Mock };
  let estService: { mustFindById: jest.Mock };
  let tenancy: { requireTenantId: jest.Mock };
  let svc: SiembraService;

  beforeEach(() => {
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
    lotesService = { mustFindById: jest.fn() };
    estService = { mustFindById: jest.fn().mockResolvedValue({ id: ESTABLECIMIENTO_ID }) };
    tenancy = { requireTenantId: jest.fn().mockReturnValue(TENANT_ID) };

    svc = new SiembraService(
      dataSource as any,
      {} as any,
      {} as any,
      lotesService as any,
      estService as any,
      tenancy as any,
    );
  });

  it('rechaza con 422 LOTE_CONSUMIDO si el lote de semilla está consumido', async () => {
    lotesService.mustFindById.mockImplementation((id: string) =>
      Promise.resolve(
        id === LOTE_SEMILLA_ID
          ? baseLote({ id, tipo: LoteTipo.SEMILLA, estado: LoteEstado.CONSUMIDO })
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
          : baseLote({ id, tipo: LoteTipo.SUSTRATO, estado: LoteEstado.CONSUMIDO }),
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
          ? baseLote({ id, tipo: LoteTipo.SEMILLA, activo: true, estado: LoteEstado.HABILITADO })
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

    await expect(svc.createSiembra(makeDto(), USER_ID)).rejects.toBe(CONNECT_MARKER);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });
});
