import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ok } from 'src/common/http/api-response';
import { TrazabilidadService, TrazabilidadCosechaResult, TrazabilidadMesaResult } from './trazabilidad.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TrazabilidadController {
  constructor(private readonly svc: TrazabilidadService) {}

  @Get('trazabilidad/cosecha/:cosecha_id')
  async getTrazabilidadByCosecha(
    @Param('cosecha_id') cosechaId: string,
  ): Promise<ReturnType<typeof ok<TrazabilidadCosechaResult>>> {
    const result = await this.svc.getTrazabilidadByCosecha(cosechaId);
    return ok(result);
  }

  @Get('trazabilidad/mesa/:mesa_id')
  async getTrazabilidadByMesa(
    @Param('mesa_id') mesaId: string,
  ): Promise<ReturnType<typeof ok<TrazabilidadMesaResult>>> {
    const result = await this.svc.getTrazabilidadByMesa(mesaId);
    return ok(result);
  }
}
