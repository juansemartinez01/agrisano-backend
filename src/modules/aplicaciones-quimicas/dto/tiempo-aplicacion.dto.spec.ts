import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateAplicacionDto } from './create-aplicacion.dto';
import { UpdateAplicacionDto } from './update-aplicacion.dto';
import { UpdateOperationGroupDto } from './update-operation-group.dto';

// Misma config que main.ts: se valida el comportamiento real de la request.
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

async function validar(
  metatype: new () => object,
  body: unknown,
): Promise<unknown> {
  const result: unknown = await pipe.transform(body, {
    type: 'body',
    metatype,
  });
  return result;
}

async function mensajes(metatype: new () => object, body: unknown) {
  try {
    await validar(metatype, body);
  } catch (e) {
    if (e instanceof BadRequestException) {
      const res = e.getResponse() as { message: string[] };
      return res.message;
    }
    throw e;
  }
  return null;
}

const createBase = {
  establecimiento_id: UUID,
  contexto: 'greenhouse',
  lote_quimico_id: UUID,
  dosis: 0.5,
  cantidad: 0.5,
  mesa_ids: [UUID_2],
};

const INICIO = '2026-10-28T10:00:00-03:00';
const FIN = '2026-10-28T10:45:00-03:00';

describe('horarios de aplicación — POST /aplicaciones-quimicas', () => {
  it('acepta inicio y fin con zona horaria', async () => {
    await expect(
      validar(CreateAplicacionDto, {
        ...createBase,
        fecha_hora_inicio: INICIO,
        fecha_hora_fin: FIN,
      }),
    ).resolves.toMatchObject({
      fecha_hora_inicio: INICIO,
      fecha_hora_fin: FIN,
    });
  });

  it('acepta solo inicio (fin opcional)', async () => {
    await expect(
      validar(CreateAplicacionDto, {
        ...createBase,
        fecha_hora_inicio: '2026-10-28T13:00:00Z',
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza la falta de inicio con 400', async () => {
    const msgs = await mensajes(CreateAplicacionDto, createBase);
    expect(msgs).toEqual([expect.stringContaining('fecha_hora_inicio')]);
  });

  it.each([
    ['solo fecha', '2026-10-28'],
    ['sin zona horaria', '2026-10-28T10:00:00'],
    ['texto', 'ayer'],
    ['número', 1761656400000],
    ['vacío', ''],
  ])('rechaza inicio inválido (%s)', async (_nombre, valor) => {
    const msgs = await mensajes(CreateAplicacionDto, {
      ...createBase,
      fecha_hora_inicio: valor,
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora_inicio')]);
  });

  it('rechaza un fin con formato inválido', async () => {
    const msgs = await mensajes(CreateAplicacionDto, {
      ...createBase,
      fecha_hora_inicio: INICIO,
      fecha_hora_fin: '2026-10-28',
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora_fin')]);
  });

  it('ya no acepta fecha_hora', async () => {
    const msgs = await mensajes(CreateAplicacionDto, {
      ...createBase,
      fecha_hora_inicio: INICIO,
      fecha_hora: FIN,
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora')]);
  });
});

describe('horarios de aplicación — PATCH de fila', () => {
  it('acepta inicio y fin, juntos o por separado', async () => {
    await expect(
      validar(UpdateAplicacionDto, {
        fecha_hora_inicio: INICIO,
        fecha_hora_fin: FIN,
      }),
    ).resolves.toBeDefined();
    await expect(
      validar(UpdateAplicacionDto, { fecha_hora_fin: FIN }),
    ).resolves.toBeDefined();
    await expect(
      validar(UpdateAplicacionDto, { fecha_hora_inicio: INICIO }),
    ).resolves.toBeDefined();
  });

  it('rechaza fecha_hora (reemplazada por inicio/fin)', async () => {
    const msgs = await mensajes(UpdateAplicacionDto, { fecha_hora: FIN });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora')]);
  });

  it('rechaza una fecha sin hora', async () => {
    const msgs = await mensajes(UpdateAplicacionDto, {
      fecha_hora_inicio: '2026-10-28',
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora_inicio')]);
  });
});

describe('horarios de aplicación — PATCH de grupo', () => {
  const items = [{ op: 'delete', id: UUID }];

  it('acepta inicio y fin a nivel grupo', async () => {
    await expect(
      validar(UpdateOperationGroupDto, {
        fecha_hora_inicio: INICIO,
        fecha_hora_fin: FIN,
        items,
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza fecha_hora a nivel grupo', async () => {
    const msgs = await mensajes(UpdateOperationGroupDto, {
      fecha_hora: FIN,
      items,
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora')]);
  });

  it('rechaza formato inválido', async () => {
    const msgs = await mensajes(UpdateOperationGroupDto, {
      fecha_hora_fin: '2026-10-28T10:00:00',
      items,
    });
    expect(msgs).toEqual([expect.stringContaining('fecha_hora_fin')]);
  });
});
