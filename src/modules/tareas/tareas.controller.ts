import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { ok, page } from 'src/common/http/api-response';
import { clampPagination } from 'src/common/query/query-utils';
import type { JwtPayload } from 'src/modules/auth/types/jwt-payload.type';
import { TareasService } from './tareas.service';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ReordenarTareasDto } from './dto/reordenar-tareas.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';

type AuthRequest = Request & {
  user: JwtPayload;
  id: string;
  tenantId?: string | null;
  method: string;
  url: string;
  body: Record<string, unknown>;
};

function auditReq(req: AuthRequest) {
  return {
    requestId: req.id,
    method: req.method,
    url: req.url,
    email: req.user?.email,
    userId: req.user?.sub,
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TareasController {
  constructor(private readonly svc: TareasService) {}

  // ──────────────────────────────────────────────────────────────────────
  // GET tareas — list (sin role guard: cualquier autenticado)
  // ──────────────────────────────────────────────────────────────────────
  @Get('tareas')
  async list(@Query() q: QueryTareasDto, @Req() req: AuthRequest) {
    const { page: p, limit } = clampPagination(q.page, q.limit, 200);
    const r = await this.svc.listTareas(q, req.user?.sub);
    return page(r.items, p, limit, r.total);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET tareas/ambitos — MUST be declared BEFORE tareas/:id
  // ──────────────────────────────────────────────────────────────────────
  @Get('tareas/ambitos')
  ambitos() {
    return ok(this.svc.listAmbitos());
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET tareas/:id
  // ──────────────────────────────────────────────────────────────────────
  @Get('tareas/:id')
  async getOne(@Param('id') id: string) {
    const tarea = await this.svc.getTareaById(id);
    return ok(tarea);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST tareas — create
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Post('tareas')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTareaDto, @Req() req: AuthRequest) {
    const tarea = await this.svc.createTarea(dto, auditReq(req));
    return ok(tarea);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST tareas/reordenar — declarado antes de las rutas con :id
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Post('tareas/reordenar')
  @HttpCode(HttpStatus.OK)
  async reordenar(@Body() dto: ReordenarTareasDto, @Req() req: AuthRequest) {
    const tablero = await this.svc.reordenar(dto, auditReq(req));
    return ok(tablero);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH tareas/:id — update (strict immutability guard)
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Patch('tareas/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTareaDto,
    @Req() req: AuthRequest,
  ) {
    const ALLOWED = new Set(['titulo', 'descripcion', 'asignado_a_usuario_id']);
    const body = req.body as Record<string, unknown>;
    if (Object.keys(body ?? {}).some((k) => !ALLOWED.has(k))) {
      throw new AppError({
        code: ErrorCodes.TAREA_FIELD_IMMUTABLE,
        message:
          'Solo se pueden modificar titulo, descripcion y asignado_a_usuario_id',
        status: 400,
      });
    }

    const tarea = await this.svc.updateTarea(id, dto, auditReq(req));
    return ok(tarea);
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST tareas/:id/estado — la reapertura se valida en el service
  // ──────────────────────────────────────────────────────────────────────
  @Roles('operario', 'supervisor', 'admin_global')
  @Post('tareas/:id/estado')
  @HttpCode(HttpStatus.OK)
  async cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoDto,
    @Req() req: AuthRequest,
  ) {
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    const tarea = await this.svc.cambiarEstado(id, dto, auditReq(req), roles);
    return ok(tarea);
  }

  // ──────────────────────────────────────────────────────────────────────
  // DELETE tareas/:id — soft delete
  // ──────────────────────────────────────────────────────────────────────
  @Roles('supervisor', 'admin_global')
  @Delete('tareas/:id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.svc.deleteTarea(id, auditReq(req));
    return ok({ deleted: true });
  }
}
