import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { ok } from 'src/common/http/api-response';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { RevertirDto } from './dto/revertir.dto';
import { ReversionesService, type ReversionTipo } from './reversiones.service';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  method: string;
  url: string;
};

// Operaciones correctivas y destructivas: solo admin_global, a nivel de clase
// para que una ruta nueva no quede abierta por olvido.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin_global')
@Controller('mesas')
export class ReversionesController {
  constructor(private readonly svc: ReversionesService) {}

  @Post(':mesa_id/revertir-trasplante')
  @HttpCode(200)
  revertirTrasplante(
    @Param('mesa_id', new ParseUUIDPipe()) mesaId: string,
    @Body() dto: RevertirDto,
    @Req() req: AuthRequest,
  ) {
    return this.ejecutar('trasplante', mesaId, dto, req);
  }

  @Post(':mesa_id/revertir-cosecha')
  @HttpCode(200)
  revertirCosecha(
    @Param('mesa_id', new ParseUUIDPipe()) mesaId: string,
    @Body() dto: RevertirDto,
    @Req() req: AuthRequest,
  ) {
    return this.ejecutar('cosecha', mesaId, dto, req);
  }

  @Post(':mesa_id/revertir-cosecha-y-trasplante')
  @HttpCode(200)
  revertirCosechaYTrasplante(
    @Param('mesa_id', new ParseUUIDPipe()) mesaId: string,
    @Body() dto: RevertirDto,
    @Req() req: AuthRequest,
  ) {
    return this.ejecutar('cosecha_y_trasplante', mesaId, dto, req);
  }

  private async ejecutar(
    tipo: ReversionTipo,
    mesaId: string,
    dto: RevertirDto,
    req: AuthRequest,
  ) {
    const result = await this.svc.revertir(tipo, mesaId, dto, {
      requestId: req.id,
      method: req.method,
      url: req.url,
      email: req.user?.email,
      userId: req.user?.sub,
    });
    return ok(result);
  }
}
