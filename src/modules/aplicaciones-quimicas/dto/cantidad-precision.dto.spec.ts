import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateAplicacionDto } from './create-aplicacion.dto';
import { UpdateAplicacionDto } from './update-aplicacion.dto';
import { UpdateOperationGroupDto } from './update-operation-group.dto';
import { AjusteLoteQuimicoDto } from 'src/modules/lotes-quimicos/dto/ajuste-lote-quimico.dto';
import { CreateLoteQuimicoDto } from 'src/modules/lotes-quimicos/dto/create-lote-quimico.dto';

// Misma config que main.ts: lo que importa acá es el comportamiento real de
// la request (incluida la conversión implícita), no el del DTO aislado.
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
  mesa_ids: [UUID_2],
};

const linea = (cantidad: unknown) => ({
  lote_quimico_id: UUID,
  dosis: 0.5,
  cantidad,
});

describe('precisión de cantidad (6 decimales)', () => {
  describe('POST /aplicaciones-quimicas', () => {
    it.each([0.001, 0.125, 1.5, 0.000273, 0.000001])(
      'acepta cantidad %p',
      async (cantidad) => {
        await expect(
          validar(CreateAplicacionDto, { ...createBase, cantidad }),
        ).resolves.toMatchObject({ cantidad });
      },
    );

    it.each([0.0000005, 1e-7, 1.0000001, 0.1 + 0.2, 0, -1])(
      'rechaza con 400 cantidad %p',
      async (cantidad) => {
        const msgs = await mensajes(CreateAplicacionDto, {
          ...createBase,
          cantidad,
        });
        expect(msgs).toEqual([expect.stringContaining('cantidad')]);
      },
    );

    it('acepta 6 decimales en detalles[].cantidad y rechaza 7', async () => {
      await expect(
        validar(CreateAplicacionDto, {
          ...createBase,
          cantidad: 0.000273,
          detalles: [linea(0.000124)],
        }),
      ).resolves.toBeDefined();

      const msgs = await mensajes(CreateAplicacionDto, {
        ...createBase,
        cantidad: 0.000273,
        detalles: [linea(0.0000001)],
      });
      expect(msgs).toEqual([expect.stringContaining('detalles.0.cantidad')]);
    });

    it('convierte un string numérico (conversión implícita) y valida igual', async () => {
      await expect(
        validar(CreateAplicacionDto, { ...createBase, cantidad: '0.000273' }),
      ).resolves.toMatchObject({ cantidad: 0.000273 });
      expect(
        await mensajes(CreateAplicacionDto, {
          ...createBase,
          cantidad: '0.0000001',
        }),
      ).not.toBeNull();
    });
  });

  describe('PATCH /aplicaciones-quimicas/:id', () => {
    it('acepta 6 decimales en chemical_lines[].cantidad', async () => {
      await expect(
        validar(UpdateAplicacionDto, { chemical_lines: [linea(0.000273)] }),
      ).resolves.toBeDefined();
    });

    it('rechaza 7 decimales en chemical_lines[].cantidad', async () => {
      const msgs = await mensajes(UpdateAplicacionDto, {
        chemical_lines: [linea(0.0000005)],
      });
      expect(msgs).toEqual([
        expect.stringContaining('chemical_lines.0.cantidad'),
      ]);
    });
  });

  describe('PATCH /aplicaciones-quimicas/operation-group/:id', () => {
    it('acepta 6 decimales en items[].chemical_lines[].cantidad', async () => {
      await expect(
        validar(UpdateOperationGroupDto, {
          items: [
            { op: 'update', id: UUID, chemical_lines: [linea(0.000273)] },
            {
              op: 'create',
              chemical_lines: [linea(0.00027)],
              mesa_ids: [UUID_2],
            },
          ],
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza 7 decimales en items[].chemical_lines[].cantidad', async () => {
      const msgs = await mensajes(UpdateOperationGroupDto, {
        items: [{ op: 'update', id: UUID, chemical_lines: [linea(1e-7)] }],
      });
      expect(msgs).toEqual([
        expect.stringContaining('items.0.chemical_lines.0.cantidad'),
      ]);
    });
  });

  describe('lotes químicos', () => {
    it('ajuste: acepta 0.000001 y rechaza 7 decimales', async () => {
      await expect(
        validar(AjusteLoteQuimicoDto, { cantidad: 0.000001 }),
      ).resolves.toBeDefined();
      expect(
        await mensajes(AjusteLoteQuimicoDto, { cantidad: 0.0000005 }),
      ).not.toBeNull();
    });

    it('creación: cantidad_inicial acepta 6 decimales y rechaza 7', async () => {
      const base = { quimico_id: UUID, proveedor_id: UUID, numero_lote: 'L1' };
      await expect(
        validar(CreateLoteQuimicoDto, { ...base, cantidad_inicial: 0.999727 }),
      ).resolves.toBeDefined();
      expect(
        await mensajes(CreateLoteQuimicoDto, {
          ...base,
          cantidad_inicial: 0.9997271,
        }),
      ).not.toBeNull();
    });
  });
});
