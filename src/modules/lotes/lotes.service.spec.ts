import { LotesService } from './lotes.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { tenantContext } from '../tenancy/tenant-context';
import { Lote, LoteEstado, LoteTipo } from './entities/lote.entity';
import * as usuarioResumenUtil from '../../common/utils/usuario-resumen.util';

jest.mock('../../common/utils/usuario-resumen.util');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LOTE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

function withTenant<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: TENANT_ID, tenantKey: null }, fn);
}

function baseLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: LOTE_ID,
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

describe('LotesService', () => {
  let repo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { query: jest.Mock; connection?: unknown };
  };
  let svc: LotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { query: jest.fn() },
    };
    svc = new LotesService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('consumirLote', () => {
    it('marca el lote como consumido y remapea el snapshot del usuario', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repo.createQueryBuilder.mockReturnValue(updateQb);
      (usuarioResumenUtil.fetchUsuarioSnapshot as jest.Mock).mockResolvedValue({
        usuario_email_snapshot: 'juan@agrisano.com',
        usuario_nombre_snapshot: 'Juan',
        usuario_apellido_snapshot: 'Perez',
      });

      const consumido = baseLote({
        estado: LoteEstado.CONSUMIDO,
        fecha_consumido: new Date(),
        usuario_consumido_id: USER_ID,
        usuario_consumido_email_snapshot: 'juan@agrisano.com',
        usuario_consumido_nombre_snapshot: 'Juan',
        usuario_consumido_apellido_snapshot: 'Perez',
        observaciones_consumo: 'fin de ciclo',
      });
      repo.findOne
        .mockResolvedValueOnce(baseLote()) // mustFindById previo
        .mockResolvedValueOnce(consumido); // mustFindById final

      const result = await withTenant(() =>
        svc.consumirLote(LOTE_ID, USER_ID, {
          observaciones_consumo: 'fin de ciclo',
        }),
      );

      expect(result.estado).toBe(LoteEstado.CONSUMIDO);
      expect(result.usuario_consumido_email_snapshot).toBe('juan@agrisano.com');
      expect(result.usuario_consumido_nombre_snapshot).toBe('Juan');
      expect(result.usuario_consumido_apellido_snapshot).toBe('Perez');
      expect(result.observaciones_consumo).toBe('fin de ciclo');

      expect(updateQb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: LoteEstado.CONSUMIDO,
          usuario_consumido_id: USER_ID,
          usuario_consumido_email_snapshot: 'juan@agrisano.com',
          usuario_consumido_nombre_snapshot: 'Juan',
          usuario_consumido_apellido_snapshot: 'Perez',
          observaciones_consumo: 'fin de ciclo',
        }),
      );
    });

    it('responde 409 LOTE_YA_CONSUMIDO sin alterar el lote si ya estaba consumido', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repo.createQueryBuilder.mockReturnValue(updateQb);
      (usuarioResumenUtil.fetchUsuarioSnapshot as jest.Mock).mockResolvedValue({
        usuario_email_snapshot: null,
        usuario_nombre_snapshot: null,
        usuario_apellido_snapshot: null,
      });
      repo.findOne.mockResolvedValueOnce(
        baseLote({ estado: LoteEstado.CONSUMIDO }),
      );

      await expect(
        withTenant(() => svc.consumirLote(LOTE_ID, USER_ID, {})),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_YA_CONSUMIDO,
        status: 409,
      } as Partial<AppError> & { status: number });

      // Solo el mustFindById previo — no hubo segunda lectura ni reescritura
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('responde 404 NOT_FOUND si el lote no existe o no es del tenant', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(
        withTenant(() => svc.consumirLote(LOTE_ID, USER_ID, {})),
      ).rejects.toMatchObject({
        code: ErrorCodes.NOT_FOUND,
        status: 404,
      });

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('rehabilitarLote', () => {
    it('vuelve el lote a habilitado y limpia los metadatos de consumo', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repo.createQueryBuilder.mockReturnValue(updateQb);

      const habilitado = baseLote({ estado: LoteEstado.HABILITADO });
      repo.findOne
        .mockResolvedValueOnce(baseLote({ estado: LoteEstado.CONSUMIDO }))
        .mockResolvedValueOnce(habilitado);

      const result = await withTenant(() => svc.rehabilitarLote(LOTE_ID));

      expect(result.estado).toBe(LoteEstado.HABILITADO);
      expect(updateQb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: LoteEstado.HABILITADO,
          fecha_consumido: null,
          usuario_consumido_id: null,
          usuario_consumido_email_snapshot: null,
          usuario_consumido_nombre_snapshot: null,
          usuario_consumido_apellido_snapshot: null,
          observaciones_consumo: null,
        }),
      );
    });

    it('responde 409 LOTE_NO_CONSUMIDO si el lote no estaba consumido', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repo.createQueryBuilder.mockReturnValue(updateQb);
      repo.findOne.mockResolvedValueOnce(
        baseLote({ estado: LoteEstado.HABILITADO }),
      );

      await expect(
        withTenant(() => svc.rehabilitarLote(LOTE_ID)),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_NO_CONSUMIDO,
        status: 409,
      });
    });
  });

  describe('listLotes', () => {
    function mockListQb() {
      const qb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[baseLote()], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('permite filtrar por estado', async () => {
      const qb = mockListQb();

      await withTenant(() => svc.listLotes({ estado: LoteEstado.CONSUMIDO }));

      expect(qb.andWhere).toHaveBeenCalledWith('t.estado = :estado', {
        estado: LoteEstado.CONSUMIDO,
      });
    });

    it('con disponible=true agrega estado=habilitado AND activo=true', async () => {
      const qb = mockListQb();

      await withTenant(() => svc.listLotes({ disponible: true }));

      expect(qb.andWhere).toHaveBeenCalledWith(
        't.estado = :estadoDisponible AND t.activo = true',
        { estadoDisponible: LoteEstado.HABILITADO },
      );
    });

    it('sin filtros no altera el comportamiento por defecto', async () => {
      const qb = mockListQb();

      await withTenant(() => svc.listLotes({}));

      const calledWithEstado = qb.andWhere.mock.calls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('estado'),
      );
      expect(calledWithEstado).toBe(false);
    });
  });
});
