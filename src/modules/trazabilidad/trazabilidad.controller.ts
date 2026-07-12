import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { ok } from 'src/common/http/api-response';
import { TrazabilidadService, TrazabilidadCosechaResult, TrazabilidadMesaResult } from './trazabilidad.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TrazabilidadController {
  constructor(private readonly svc: TrazabilidadService) {}

  @Roles('operario', 'supervisor', 'admin_global')
  @Get('trazabilidad/cosecha/:cosecha_id')
  async getTrazabilidadByCosecha(
    @Param('cosecha_id') cosechaId: string,
  ): Promise<ReturnType<typeof ok<TrazabilidadCosechaResult>>> {
    const result = await this.svc.getTrazabilidadByCosecha(cosechaId);
    return ok(result);
  }

  @Roles('operario', 'supervisor', 'admin_global')
  @Get('trazabilidad/mesa/:mesa_id')
  async getTrazabilidadByMesa(
    @Param('mesa_id') mesaId: string,
  ): Promise<ReturnType<typeof ok<TrazabilidadMesaResult>>> {
    const result = await this.svc.getTrazabilidadByMesa(mesaId);
    return ok(result);
  }
}
