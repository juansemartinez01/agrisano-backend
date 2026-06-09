import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { StockMovimientosService, AUDIT } from './stock-movimientos.service';
import { MovimientoTipo } from './entities/movimiento-stock.entity';
import { CreateMovimientoDto } from './dto/create-movimiento.dto';
import { QueryMovimientosDto } from './dto/query-movimientos.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class StockMovimientosController {
  constructor(
    private readonly svc: StockMovimientosService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {}

  @Roles('supervisor', 'admin_global')
  @Post('stock-movimientos')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMovimientoDto, @Req() req: AuthRequest) {
    const userId = req.user?.sub;
    const result = await this.svc.createMovimiento(dto, userId);

    const action =
      dto.tipo === MovimientoTipo.INGRESO ? AUDIT.INGRESO : AUDIT.EGRESO_MANUAL;
    const payload = auditLogPayload({
      requestId: req.id,
      actorUserId: req.user?.sub,
      actorEmail: req.user?.email,
      action,
      entity: 'movimiento_stock',
      extra: {
        movimientoId: result.movimiento.id,
        quimicoId: dto.quimico_id,
        tipo: dto.tipo,
        cantidad: dto.cantidad,
      },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.id,
      method: req.method,
      path: req.url,
      status_code: 201,
      actor_user_id: req.user?.sub ?? null,
      actor_email: req.user?.email ?? null,
      action,
      entity: 'movimiento_stock',
      tenant_id: req.tenantId ?? null,
      payload,
    });

    return ok({
      movimiento: result.movimiento,
      quimico_stock_actual: result.quimico_stock_actual,
      quimico_unidad_stock: result.quimico_unidad_stock,
      ...(result.warning !== undefined && { warning: result.warning }),
    });
  }

  @Get('stock-movimientos')
  async list(@Query() q: QueryMovimientosDto) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listMovimientos(q);
    return page(r.items, p, limit, r.total);
  }

  @Get('stock-movimientos/:id')
  async getOne(@Param('id') id: string) {
    const m = await this.svc.getMovimiento(id);
    return ok(m);
  }

  @Get('quimicos/:quimicoId/movimientos')
  async listByQuimico(
    @Param('quimicoId') quimicoId: string,
    @Query() q: QueryMovimientosDto,
  ) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listByQuimico(quimicoId, q);
    return page(r.items, p, limit, r.total);
  }
}
