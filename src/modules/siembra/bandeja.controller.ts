import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { BandejaService, AUDIT } from './bandeja.service';
import { QueryBandejasDto } from './dto/query-bandejas.dto';
import { QueryDescartesDto } from './dto/query-descartes.dto';
import { DescartarBandejasDto } from './dto/descartar-bandejas.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bandejas')
export class BandejaController {
  constructor(
    private readonly svc: BandejaService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  async list(@Query() q: QueryBandejasDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listBandejas(q);
    return page(r.items, p, limit, r.total);
  }

  // Reporte de mermas. Sin @Roles, como los otros dos GET: lo lee cualquiera
  // que ya pueda leer bandejas.
  //
  // Declarado antes de @Get(':id') por lo mismo que 'descartar'.
  @Get('descartes')
  async listDescartes(@Query() q: QueryDescartesDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listDescartes(q);
    return page(r.items, p, limit, r.total);
  }

  // Declarado antes de @Get(':id'): Nest resuelve las rutas en orden de
  // declaracion, asi que una parametrica puesta antes se quedaria con
  // 'descartar' y este endpoint nunca se alcanzaria.
  //
  // Sin @HttpCode: el 201 por defecto de @Post es el que pide el contrato.
  @Roles('operario', 'supervisor', 'admin_global')
  @Post('descartar')
  async descartar(@Body() dto: DescartarBandejasDto, @Req() req: AuthRequest) {
    const result = await this.svc.descartarBandejas(dto, req.user.sub);

    // La auditoria se escribe con el req real y despues de que la transaccion
    // cerro: solo se audita lo que efectivamente quedo registrado.
    const detalle = {
      bandejaIds: result.bandejas.map((b) => b.bandeja_id),
      motivo: result.motivo,
      totalDescartadas: result.descartadas,
    };
    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action: AUDIT.DESCARTE,
      entity: 'bandeja',
      extra: detalle,
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action: AUDIT.DESCARTE,
      entity: 'bandeja',
      tenant_id: req.tenantId ?? null,
      // El 'extra' repetido no es redundante: auditLogPayload() desparrama sus
      // claves en la raiz, pero redactPayload() del modulo de audit conserva
      // unicamente un 'extra' anidado y descarta el resto. Sin esta linea los
      // ids y el motivo no llegan a audit_logs. Bug preexistente del util
      // compartido, ver la nota de T024 en tasks.md.
      payload: { ...payload, extra: detalle },
    });

    return ok(result);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const bandeja = await this.svc.getBandeja(id);
    return ok(bandeja);
  }
}
