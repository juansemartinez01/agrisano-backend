import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { ReversionesController } from './reversiones.controller';

// Estas rutas son destructivas: el unico rol permitido es admin_global, y eso
// tiene que seguir valiendo para cualquier ruta que se agregue al controlador.
describe('ReversionesController (roles)', () => {
  const guard = new RolesGuard(new Reflector());
  const proto = ReversionesController.prototype;

  const handlers = Object.getOwnPropertyNames(proto).filter(
    (n) =>
      n !== 'constructor' &&
      Reflect.getMetadata('path', proto[n as keyof typeof proto]) !== undefined,
  );

  function ctx(handlerName: string, roles: string[]): ExecutionContext {
    return {
      getHandler: () => proto[handlerName as keyof typeof proto],
      getClass: () => ReversionesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as unknown as ExecutionContext;
  }

  it('expone las tres rutas esperadas', () => {
    expect(handlers.sort()).toEqual([
      'revertirCosecha',
      'revertirCosechaYTrasplante',
      'revertirTrasplante',
    ]);
  });

  it.each([
    'revertirTrasplante',
    'revertirCosecha',
    'revertirCosechaYTrasplante',
  ])('%s: solo admin_global', (h) => {
    expect(guard.canActivate(ctx(h, ['admin_global']))).toBe(true);
    for (const rol of ['admin', 'supervisor', 'operario', 'cliente']) {
      expect(guard.canActivate(ctx(h, [rol]))).toBe(false);
    }
    expect(guard.canActivate(ctx(h, []))).toBe(false);
  });
});
