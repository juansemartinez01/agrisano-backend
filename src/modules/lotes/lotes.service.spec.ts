import { LotesService } from './lotes.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { tenantContext } from '../tenancy/tenant-context';
import { Lote, LoteEstado, LoteTipo } from './entities/lote.entity';
import { CreateLoteDto } from './dto/create-lote.dto';
import * as usuarioResumenUtil from '../../common/utils/usuario-resumen.util';

jest.mock('../../common/utils/usuario-resumen.util');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LOTE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const PROVEEDOR_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCTO_ID = '44444444-4444-4444-4444-444444444444';
const VARIEDAD_ID = '55555555-5555-5555-5555-555555555555';
const PROVEEDOR_SEMILLA_INEXISTENTE_ID = '66666666-6666-6666-6666-666666666666';

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
    grado: null,
    ...overrides,
  } as Lote;
}

function baseCreateDto(overrides: Partial<CreateLoteDto> = {}): CreateLoteDto {
  return {
    tipo: LoteTipo.SUSTRATO,
    numero_lote: 'L-001',
    proveedor_id: PROVEEDOR_ID,
    ...overrides,
  } as CreateLoteDto;
}

describe('LotesService', () => {
  let repo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softDelete: jest.Mock;
    manager: { query: jest.Mock; connection?: unknown };
  };
  let proveedoresService: { mustFindById: jest.Mock };
  let productosService: { mustFindById: jest.Mock };
  let variedadesService: { mustFindById: jest.Mock };
  let marcasService: { mustFindById: jest.Mock };
  let svc: LotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn((data: unknown) => data),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: { query: jest.fn() },
    };
    proveedoresService = {
      mustFindById: jest.fn().mockResolvedValue({ id: PROVEEDOR_ID }),
    };
    productosService = {
      mustFindById: jest.fn().mockResolvedValue({ id: PRODUCTO_ID }),
    };
    variedadesService = {
      mustFindById: jest
        .fn()
        .mockResolvedValue({ id: VARIEDAD_ID, producto_id: PRODUCTO_ID }),
    };
    marcasService = { mustFindById: jest.fn() };
    svc = new LotesService(
      repo as any,
      proveedoresService as any,
      productosService as any,
      variedadesService as any,
      marcasService as any,
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

    it('permite filtrar por tipo vermiculita', async () => {
      const qb = mockListQb();

      await withTenant(() => svc.listLotes({ tipo: LoteTipo.VERMICULITA }));

      expect(qb.andWhere).toHaveBeenCalledWith('t.tipo = :tipo', {
        tipo: LoteTipo.VERMICULITA,
      });
    });

    it('permite filtrar por grado', async () => {
      const qb = mockListQb();

      await withTenant(() => svc.listLotes({ grado: 2 }));

      expect(qb.andWhere).toHaveBeenCalledWith('t.grado = :grado', {
        grado: 2,
      });
    });
  });

  describe('createLote', () => {
    it('crea un lote de vermiculita con su grado', async () => {
      repo.findOne.mockResolvedValueOnce(null); // sin conflicto de numero_lote

      const result = await withTenant(() =>
        svc.createLote(
          baseCreateDto({
            tipo: LoteTipo.VERMICULITA,
            numero_lote: 'V-001',
            grado: 2,
          }),
        ),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: LoteTipo.VERMICULITA,
          numero_lote: 'V-001',
          grado: 2,
          tenant_id: TENANT_ID,
        }),
      );
      expect(result).toMatchObject({ tipo: LoteTipo.VERMICULITA, grado: 2 });
    });

    it('crea un lote de semilla sin proveedor_semilla_id', async () => {
      repo.findOne.mockResolvedValueOnce(null); // sin conflicto de numero_lote

      const result = await withTenant(() =>
        svc.createLote(
          baseCreateDto({
            tipo: LoteTipo.SEMILLA,
            numero_lote: 'S-001',
            producto_id: PRODUCTO_ID,
            variedad_id: VARIEDAD_ID,
          }),
        ),
      );

      // Solo se valida el proveedor del lote, no el de la semilla
      expect(proveedoresService.mustFindById).toHaveBeenCalledTimes(1);
      expect(proveedoresService.mustFindById).toHaveBeenCalledWith(
        PROVEEDOR_ID,
        { strictTenant: true },
      );
      expect(result).toMatchObject({ tipo: LoteTipo.SEMILLA });
    });

    it('sigue validando el proveedor de semilla cuando si se manda', async () => {
      repo.findOne.mockResolvedValueOnce(null); // sin conflicto de numero_lote
      proveedoresService.mustFindById
        .mockResolvedValueOnce({ id: PROVEEDOR_ID })
        .mockRejectedValueOnce(
          new AppError({
            code: ErrorCodes.PROVEEDOR_NOT_FOUND,
            message: 'Proveedor no encontrado',
            status: 404,
          }),
        );

      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.SEMILLA,
              numero_lote: 'S-002',
              producto_id: PRODUCTO_ID,
              variedad_id: VARIEDAD_ID,
              proveedor_semilla_id: PROVEEDOR_SEMILLA_INEXISTENTE_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.PROVEEDOR_NOT_FOUND });

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_GRADO_NO_PERMITIDO si se manda grado en un lote de sustrato', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(baseCreateDto({ tipo: LoteTipo.SUSTRATO, grado: 1 })),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
        status: 422,
      });

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_GRADO_NO_PERMITIDO si se manda grado en un lote de semilla', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.SEMILLA,
              grado: 3,
              producto_id: PRODUCTO_ID,
              variedad_id: VARIEDAD_ID,
              proveedor_semilla_id: PROVEEDOR_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
        status: 422,
      });

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO si se manda proveedor_semilla_id en vermiculita', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.VERMICULITA,
              grado: 1,
              proveedor_semilla_id: PROVEEDOR_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO,
        status: 422,
      });

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_PRODUCTO_NO_PERMITIDO si se manda producto_id en vermiculita', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.VERMICULITA,
              grado: 1,
              producto_id: PRODUCTO_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
        status: 422,
      });
    });

    it('rechaza 422 LOTE_PRODUCTO_NO_PERMITIDO si se manda variedad_id en vermiculita', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.VERMICULITA,
              grado: 1,
              variedad_id: VARIEDAD_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
        status: 422,
      });
    });

    // Regresión: los dos tipos preexistentes deben seguir dando exactamente los
    // mismos códigos que antes de invertir la guarda.
    it('sigue rechazando proveedor_semilla_id y producto_id en sustrato con los mismos codigos', async () => {
      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.SUSTRATO,
              proveedor_semilla_id: PROVEEDOR_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO,
        status: 422,
      });

      await expect(
        withTenant(() =>
          svc.createLote(
            baseCreateDto({
              tipo: LoteTipo.SUSTRATO,
              producto_id: PRODUCTO_ID,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
        status: 422,
      });
    });

    it('sigue aceptando un lote de semilla completo', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await withTenant(() =>
        svc.createLote(
          baseCreateDto({
            tipo: LoteTipo.SEMILLA,
            numero_lote: 'S-001',
            producto_id: PRODUCTO_ID,
            variedad_id: VARIEDAD_ID,
            proveedor_semilla_id: PROVEEDOR_ID,
          }),
        ),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: LoteTipo.SEMILLA,
          numero_lote: 'S-001',
        }),
      );
    });

    it('sigue aceptando un lote de sustrato sin campos exclusivos', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await withTenant(() =>
        svc.createLote(baseCreateDto({ tipo: LoteTipo.SUSTRATO })),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: LoteTipo.SUSTRATO }),
      );
    });
  });

  describe('updateLote', () => {
    it('permite editar el grado de un lote de vermiculita', async () => {
      const current = baseLote({ tipo: LoteTipo.VERMICULITA, grado: 1 });
      repo.findOne
        .mockResolvedValueOnce(current) // validación previa
        .mockResolvedValueOnce({ ...current }); // update()

      const result = await withTenant(() =>
        svc.updateLote(LOTE_ID, { grado: 3 }),
      );

      expect(result).toMatchObject({ grado: 3 });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ grado: 3 }),
      );
    });

    // Si `grado` no entra en la condición externa, `current` no se carga y este
    // PATCH pasa derecho hasta el CHECK de la base (500 en vez de 422).
    it('rechaza 422 LOTE_GRADO_NO_PERMITIDO al mandar solo grado en un lote de sustrato', async () => {
      repo.findOne.mockResolvedValueOnce(baseLote({ tipo: LoteTipo.SUSTRATO }));

      await expect(
        withTenant(() => svc.updateLote(LOTE_ID, { grado: 2 })),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
        status: 422,
      });

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_GRADO_NO_PERMITIDO al mandar solo grado en un lote de semilla', async () => {
      repo.findOne.mockResolvedValueOnce(baseLote({ tipo: LoteTipo.SEMILLA }));

      await expect(
        withTenant(() => svc.updateLote(LOTE_ID, { grado: 2 })),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
        status: 422,
      });

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza 422 LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO en un lote de vermiculita', async () => {
      repo.findOne.mockResolvedValueOnce(
        baseLote({ tipo: LoteTipo.VERMICULITA, grado: 1 }),
      );

      await expect(
        withTenant(() =>
          svc.updateLote(LOTE_ID, { proveedor_semilla_id: PROVEEDOR_ID }),
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO,
        status: 422,
      });
    });

    it('rechaza 422 LOTE_PRODUCTO_NO_PERMITIDO en un lote de vermiculita', async () => {
      repo.findOne.mockResolvedValueOnce(
        baseLote({ tipo: LoteTipo.VERMICULITA, grado: 1 }),
      );

      await expect(
        withTenant(() => svc.updateLote(LOTE_ID, { producto_id: PRODUCTO_ID })),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_PRODUCTO_NO_PERMITIDO,
        status: 422,
      });
    });
  });

  describe('deleteLote', () => {
    it('cuenta tambien las bandejas que referencian el lote como vermiculita', async () => {
      repo.findOne.mockResolvedValueOnce(
        baseLote({ tipo: LoteTipo.VERMICULITA, grado: 2 }),
      );
      repo.manager.query.mockResolvedValueOnce([{ cnt: 1 }]);

      await expect(
        withTenant(() => svc.deleteLote(LOTE_ID)),
      ).rejects.toMatchObject({
        code: ErrorCodes.LOTE_REFERENCED_BY_BANDEJA,
        status: 409,
      });

      const queryCalls = repo.manager.query.mock.calls as [string, unknown[]][];
      expect(queryCalls[0][0]).toContain('lote_vermiculita_id = $1');
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('borra el lote de vermiculita cuando ninguna bandeja lo referencia', async () => {
      repo.findOne
        .mockResolvedValueOnce(
          baseLote({ tipo: LoteTipo.VERMICULITA, grado: 2 }),
        )
        .mockResolvedValueOnce(
          baseLote({ tipo: LoteTipo.VERMICULITA, grado: 2 }),
        );
      repo.manager.query.mockResolvedValueOnce([{ cnt: 0 }]);

      await withTenant(() => svc.deleteLote(LOTE_ID));

      expect(repo.softDelete).toHaveBeenCalledWith(LOTE_ID);
    });
  });
});
