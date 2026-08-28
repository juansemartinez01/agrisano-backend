import { TareasService } from './tareas.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { Tarea, TareaAmbito, TareaEstado } from './entities/tarea.entity';
import * as usuarioResumenUtil from '../../common/utils/usuario-resumen.util';

jest.mock('../../common/utils/usuario-resumen.util');

const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const EST_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const OTRO_USER_ID = '33333333-3333-3333-3333-333333333333';
const TAREA_A = '44444444-4444-4444-4444-444444444444';
const TAREA_B = '55555555-5555-5555-5555-555555555555';
const TAREA_C = '66666666-6666-6666-6666-666666666666';

const REQ = {
  requestId: 'req-1',
  method: 'POST',
  url: '/tareas',
  email: 'admin@agrisano.com',
  userId: USER_ID,
};

function baseTarea(overrides: Partial<Tarea> = {}): Tarea {
  return {
    id: TAREA_A,
    tenant_id: TENANT_ID,
    establecimiento_id: EST_ID,
    ambito: TareaAmbito.NURSERY,
    estado: TareaEstado.PENDIENTE,
    titulo: 'Revisar bandejas del sector 3',
    descripcion: null,
    asignado_a_usuario_id: null,
    orden: 1,
    creada_por_usuario_id: USER_ID,
    completada_at: null,
    completada_por_usuario_id: null,
    created_at: new Date('2026-08-28T13:00:00.000Z'),
    updated_at: new Date('2026-08-28T13:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  } as Tarea;
}

describe('TareasService', () => {
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    softDelete: jest.Mock;
  };
  let listQb: Record<string, jest.Mock>;
  let lockQb: Record<string, jest.Mock>;
  let usersQb: Record<string, jest.Mock>;
  let qr: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
    manager: {
      create: jest.Mock;
      save: jest.Mock;
      update: jest.Mock;
      createQueryBuilder: jest.Mock;
    };
  };
  let dataSource: {
    createQueryRunner: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let estService: { mustFindById: jest.Mock };
  let tenancy: { requireTenantId: jest.Mock };
  let audit: { write: jest.Mock };
  let logger: { info: jest.Mock };
  let svc: TareasService;

  beforeEach(() => {
    jest.clearAllMocks();

    listQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    lockQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    usersQb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ id: OTRO_USER_ID }),
    };

    repo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => listQb),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    qr = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ max: null }]),
      manager: {
        create: jest.fn((_entity: unknown, data: unknown) => data),
        save: jest.fn((_entity: unknown, row: Record<string, unknown>) =>
          Promise.resolve({ id: TAREA_A, ...row }),
        ),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: jest.fn(() => lockQb),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn(() => qr),
      createQueryBuilder: jest.fn(() => usersQb),
    };
    estService = { mustFindById: jest.fn().mockResolvedValue({ id: EST_ID }) };
    tenancy = { requireTenantId: jest.fn().mockReturnValue(TENANT_ID) };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    logger = { info: jest.fn() };

    (usuarioResumenUtil.buildUsuariosMap as jest.Mock).mockResolvedValue(
      new Map(),
    );

    svc = new TareasService(
      repo as never,
      dataSource as never,
      estService as never,
      tenancy as never,
      audit as never,
      logger as never,
    );
  });

  describe('listAmbitos', () => {
    it('expone los ambitos del enum para que el frontend no los hardcodee', () => {
      expect(svc.listAmbitos()).toEqual([
        { value: TareaAmbito.NURSERY, label: 'Nursery' },
        { value: TareaAmbito.GREENHOUSE, label: 'Greenhouse' },
      ]);
    });
  });

  describe('createTarea', () => {
    const dto = {
      establecimiento_id: EST_ID,
      ambito: TareaAmbito.NURSERY,
      titulo: 'Revisar bandejas del sector 3',
    };

    it('nace en pendiente con orden MAX+1 del tablero y creada_por del token', async () => {
      qr.query.mockResolvedValue([{ max: '4' }]);

      const view = await svc.createTarea(dto as never, REQ);

      expect(qr.manager.create).toHaveBeenCalledWith(
        Tarea,
        expect.objectContaining({
          tenant_id: TENANT_ID,
          estado: TareaEstado.PENDIENTE,
          orden: 5,
          creada_por_usuario_id: USER_ID,
          completada_at: null,
          completada_por_usuario_id: null,
        }),
      );
      expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
      expect(qr.release).toHaveBeenCalledTimes(1);
      expect(view.orden).toBe(5);
      expect(view.estado).toBe(TareaEstado.PENDIENTE);
    });

    it('arranca en orden 1 cuando el tablero esta vacio', async () => {
      qr.query.mockResolvedValue([{ max: null }]);

      const view = await svc.createTarea(dto as never, REQ);

      expect(view.orden).toBe(1);
    });

    it('rechaza 422 TAREA_ASIGNADO_INVALIDO si el asignado no es del tenant', async () => {
      usersQb.getRawOne.mockResolvedValue(undefined);

      await expect(
        svc.createTarea(
          { ...dto, asignado_a_usuario_id: OTRO_USER_ID } as never,
          REQ,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_ASIGNADO_INVALIDO,
        status: 422,
      });

      // Falla antes de abrir la transaccion: no se crea nada.
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('hace rollback si falla el insert', async () => {
      qr.manager.save.mockRejectedValue(new Error('boom'));

      await expect(svc.createTarea(dto as never, REQ)).rejects.toThrow('boom');

      expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(qr.commitTransaction).not.toHaveBeenCalled();
      expect(qr.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTareas', () => {
    it('ordena por orden ASC y desempata siempre por id', async () => {
      await svc.listTareas({} as never, USER_ID);

      expect(listQb.orderBy).toHaveBeenCalledWith('t.orden', 'ASC');
      expect(listQb.addOrderBy).toHaveBeenCalledWith('t.id', 'ASC');
    });

    it('ignora un sortBy fuera de la whitelist y cae al orden por defecto', async () => {
      await svc.listTareas({ sortBy: 'password' } as never, USER_ID);

      expect(listQb.orderBy).toHaveBeenCalledWith('t.orden', 'ASC');
    });

    it('resuelve asignado_a=me contra el usuario del token', async () => {
      await svc.listTareas({ asignado_a: 'me' } as never, USER_ID);

      expect(listQb.andWhere).toHaveBeenCalledWith(
        't.asignado_a_usuario_id = :asignado',
        { asignado: USER_ID },
      );
    });
  });

  describe('getTareaById', () => {
    it('responde 404 TAREA_NOT_FOUND si no existe en el tenant', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(svc.getTareaById(TAREA_A)).rejects.toMatchObject({
        code: ErrorCodes.TAREA_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('cambiarEstado', () => {
    const OPERARIO = ['operario'];
    const SUPERVISOR = ['supervisor'];

    it('permite pendiente -> en_progreso a un operario', async () => {
      repo.findOne.mockResolvedValue(baseTarea());

      const view = await svc.cambiarEstado(
        TAREA_A,
        { estado: TareaEstado.EN_PROGRESO },
        REQ,
        OPERARIO,
      );

      expect(view.estado).toBe(TareaEstado.EN_PROGRESO);
      expect(view.completada_at).toBeNull();
    });

    it('sella completada_at y completada_por al completar', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({ estado: TareaEstado.EN_PROGRESO }),
      );

      const view = await svc.cambiarEstado(
        TAREA_A,
        { estado: TareaEstado.COMPLETADA },
        REQ,
        OPERARIO,
      );

      expect(view.estado).toBe(TareaEstado.COMPLETADA);
      expect(view.completada_at).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ completada_por_usuario_id: USER_ID }),
      );
    });

    it('limpia los campos de cierre al reabrir una completada', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({
          estado: TareaEstado.COMPLETADA,
          completada_at: new Date('2026-08-28T14:00:00.000Z'),
          completada_por_usuario_id: OTRO_USER_ID,
        }),
      );

      const view = await svc.cambiarEstado(
        TAREA_A,
        { estado: TareaEstado.PENDIENTE },
        REQ,
        SUPERVISOR,
      );

      expect(view.estado).toBe(TareaEstado.PENDIENTE);
      expect(view.completada_at).toBeNull();
      expect(view.completada_por).toBeNull();
    });

    it('no toca los campos de cierre al reabrir una cancelada', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({ estado: TareaEstado.CANCELADA }),
      );

      const view = await svc.cambiarEstado(
        TAREA_A,
        { estado: TareaEstado.PENDIENTE },
        REQ,
        SUPERVISOR,
      );

      expect(view.estado).toBe(TareaEstado.PENDIENTE);
      expect(view.completada_at).toBeNull();
    });

    it('rechaza 403 si un operario intenta reabrir', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({ estado: TareaEstado.COMPLETADA }),
      );

      await expect(
        svc.cambiarEstado(
          TAREA_A,
          { estado: TareaEstado.PENDIENTE },
          REQ,
          OPERARIO,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.AUTH_FORBIDDEN,
        status: 403,
      });

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza 422 la transicion a si mismo', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({ estado: TareaEstado.COMPLETADA }),
      );

      await expect(
        svc.cambiarEstado(
          TAREA_A,
          { estado: TareaEstado.COMPLETADA },
          REQ,
          SUPERVISOR,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_TRANSICION_INVALIDA,
        status: 422,
        details: { from: TareaEstado.COMPLETADA, to: TareaEstado.COMPLETADA },
      });
    });

    it('rechaza 422 completada -> en_progreso, que no esta en la matriz', async () => {
      repo.findOne.mockResolvedValue(
        baseTarea({ estado: TareaEstado.COMPLETADA }),
      );

      await expect(
        svc.cambiarEstado(
          TAREA_A,
          { estado: TareaEstado.EN_PROGRESO },
          REQ,
          SUPERVISOR,
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_TRANSICION_INVALIDA,
        status: 422,
      });

      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('reordenar', () => {
    const dto = {
      establecimiento_id: EST_ID,
      ambito: TareaAmbito.NURSERY,
      tarea_ids: [TAREA_C, TAREA_A, TAREA_B],
    };

    function activas() {
      return [
        baseTarea({ id: TAREA_A, orden: 1 }),
        baseTarea({ id: TAREA_B, orden: 2 }),
        baseTarea({
          id: TAREA_C,
          orden: 3,
          estado: TareaEstado.EN_PROGRESO,
        }),
      ];
    }

    it('reasigna orden 1..N siguiendo el orden del array', async () => {
      lockQb.getMany.mockResolvedValue(activas());

      await svc.reordenar(dto as never, REQ);

      expect(qr.manager.update).toHaveBeenNthCalledWith(
        1,
        Tarea,
        { id: TAREA_C, tenant_id: TENANT_ID },
        { orden: 1 },
      );
      expect(qr.manager.update).toHaveBeenNthCalledWith(
        2,
        Tarea,
        { id: TAREA_A, tenant_id: TENANT_ID },
        { orden: 2 },
      );
      expect(qr.manager.update).toHaveBeenNthCalledWith(
        3,
        Tarea,
        { id: TAREA_B, tenant_id: TENANT_ID },
        { orden: 3 },
      );
      expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('bloquea las filas del tablero para serializar reordenamientos simultaneos', async () => {
      lockQb.getMany.mockResolvedValue(activas());

      await svc.reordenar(dto as never, REQ);

      expect(lockQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    });

    it('rechaza 422 si falta un id del tablero y no escribe nada', async () => {
      lockQb.getMany.mockResolvedValue(activas());

      await expect(
        svc.reordenar({ ...dto, tarea_ids: [TAREA_A, TAREA_B] } as never, REQ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_REORDEN_INVALIDO,
        status: 422,
      });

      expect(qr.manager.update).not.toHaveBeenCalled();
      expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(qr.commitTransaction).not.toHaveBeenCalled();
    });

    it('rechaza 422 si viene un id ajeno al tablero', async () => {
      lockQb.getMany.mockResolvedValue([
        baseTarea({ id: TAREA_A, orden: 1 }),
        baseTarea({ id: TAREA_B, orden: 2 }),
      ]);

      await expect(
        svc.reordenar({ ...dto, tarea_ids: [TAREA_A, TAREA_C] } as never, REQ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_REORDEN_INVALIDO,
        status: 422,
      });

      expect(qr.manager.update).not.toHaveBeenCalled();
    });

    it('rechaza 422 si el array trae ids repetidos', async () => {
      lockQb.getMany.mockResolvedValue([
        baseTarea({ id: TAREA_A, orden: 1 }),
        baseTarea({ id: TAREA_B, orden: 2 }),
      ]);

      await expect(
        svc.reordenar({ ...dto, tarea_ids: [TAREA_A, TAREA_A] } as never, REQ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TAREA_REORDEN_INVALIDO,
        status: 422,
      });

      expect(qr.manager.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteTarea', () => {
    it('borra logico y audita', async () => {
      repo.findOne.mockResolvedValue(baseTarea());

      await svc.deleteTarea(TAREA_A, REQ);

      expect(repo.softDelete).toHaveBeenCalledWith({
        id: TAREA_A,
        tenant_id: TENANT_ID,
      });
      expect(audit.write).toHaveBeenCalledWith(
        'admin',
        expect.objectContaining({ action: 'tarea_deleted' }),
      );
    });

    it('responde 404 sin borrar si la tarea es de otro tenant', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(svc.deleteTarea(TAREA_A, REQ)).rejects.toMatchObject({
        code: ErrorCodes.TAREA_NOT_FOUND,
        status: 404,
      });

      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });
});
