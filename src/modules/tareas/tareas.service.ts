import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { AuditService } from 'src/modules/audit/audit.service';
import { auditLogPayload } from 'src/common/audit/audit.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { clampPagination } from 'src/common/query/query-utils';
import {
  buildUsuariosMap,
  type UsuarioResumen,
} from 'src/common/utils/usuario-resumen.util';
import { Tarea, TareaAmbito, TareaEstado } from './entities/tarea.entity';
import { CreateTareaDto } from './dto/create-tarea.dto';
import { UpdateTareaDto } from './dto/update-tarea.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ReordenarTareasDto } from './dto/reordenar-tareas.dto';
import { QueryTareasDto } from './dto/query-tareas.dto';

export const AUDIT = {
  CREATED: 'tarea_created',
  UPDATED: 'tarea_updated',
  ESTADO_CHANGED: 'tarea_estado_changed',
  REORDENADA: 'tarea_reordenada',
  DELETED: 'tarea_deleted',
} as const;

const ENTITY = 'tarea';

/**
 * Matriz de transiciones, unica fuente de verdad. Toda celda ausente responde
 * 422, incluida la diagonal: pedir el estado que la tarea ya tiene es un error,
 * no un no-op, porque casi siempre viene de un doble click o un reintento.
 * Sumar un estado nuevo en el futuro es agregar una fila aca, no un endpoint.
 */
const TRANSICIONES: Record<TareaEstado, TareaEstado[]> = {
  [TareaEstado.PENDIENTE]: [
    TareaEstado.EN_PROGRESO,
    TareaEstado.COMPLETADA,
    TareaEstado.CANCELADA,
  ],
  [TareaEstado.EN_PROGRESO]: [
    TareaEstado.PENDIENTE,
    TareaEstado.COMPLETADA,
    TareaEstado.CANCELADA,
  ],
  [TareaEstado.COMPLETADA]: [TareaEstado.PENDIENTE],
  [TareaEstado.CANCELADA]: [TareaEstado.PENDIENTE],
};

/** Solo las activas participan del tablero y del reordenamiento. */
const ESTADOS_ACTIVOS: TareaEstado[] = [
  TareaEstado.PENDIENTE,
  TareaEstado.EN_PROGRESO,
];

const ROLES_REAPERTURA = ['supervisor', 'admin_global'];

const AMBITO_LABELS: Record<TareaAmbito, string> = {
  [TareaAmbito.NURSERY]: 'Nursery',
  [TareaAmbito.GREENHOUSE]: 'Greenhouse',
};

const SORT_ALLOWED = ['orden', 'created_at', 'titulo', 'estado'];

export interface AmbitoOption {
  value: TareaAmbito;
  label: string;
}

/** Forma de lectura: los tres ids de usuario ya resueltos, nunca la fila cruda. */
export interface TareaView {
  id: string;
  establecimiento_id: string;
  ambito: TareaAmbito;
  estado: TareaEstado;
  titulo: string;
  descripcion: string | null;
  orden: number;
  asignado_a: UsuarioResumen | null;
  creada_por: UsuarioResumen | null;
  completada_at: Date | null;
  completada_por: UsuarioResumen | null;
  created_at: Date;
  updated_at: Date;
}

interface AuditReq {
  requestId: string;
  method: string;
  url: string;
  email?: string;
  userId: string;
}

@Injectable()
export class TareasService extends BaseCrudTenantService<Tarea> {
  constructor(
    @InjectRepository(Tarea)
    private readonly tareaRepo: Repository<Tarea>,
    private readonly dataSource: DataSource,
    private readonly estService: EstablecimientosService,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    super(tareaRepo);
  }

  listAmbitos(): AmbitoOption[] {
    return Object.values(TareaAmbito).map((value) => ({
      value,
      label: AMBITO_LABELS[value],
    }));
  }

  async createTarea(dto: CreateTareaDto, req: AuditReq): Promise<TareaView> {
    const tenantId = this.tenancy.requireTenantId();

    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });
    if (dto.asignado_a_usuario_id) {
      await this.validarAsignado(dto.asignado_a_usuario_id, tenantId);
    }

    // MAX(orden)+1 e INSERT en la misma transaccion: si dos usuarios crean a la
    // vez en el mismo tablero, no pueden leer el mismo maximo y guardar ambos.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let saved: Tarea;
    try {
      const result = (await qr.query(
        `SELECT MAX(orden) AS max FROM tareas WHERE tenant_id = $1 AND establecimiento_id = $2 AND ambito = $3 AND deleted_at IS NULL`,
        [tenantId, dto.establecimiento_id, dto.ambito],
      )) as Array<{ max: string | null }>;
      const orden: number = (Number(result[0]?.max) || 0) + 1;

      const tarea = qr.manager.create(Tarea, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        ambito: dto.ambito,
        estado: TareaEstado.PENDIENTE,
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        asignado_a_usuario_id: dto.asignado_a_usuario_id ?? null,
        orden,
        creada_por_usuario_id: req.userId,
        completada_at: null,
        completada_por_usuario_id: null,
      });
      saved = await qr.manager.save(Tarea, tarea);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    await this.writeAudit(AUDIT.CREATED, saved.id, req, tenantId, 201, {
      establecimiento_id: saved.establecimiento_id,
      ambito: saved.ambito,
    });
    return this.toView(saved, tenantId);
  }

  async listTareas(
    q: QueryTareasDto,
    userId: string,
  ): Promise<{ items: TareaView[]; total: number }> {
    const tenantId = this.tenancy.requireTenantId();
    const { skip, limit } = clampPagination(q.page, q.limit, 200);

    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '')
      ? (q.sortBy as string)
      : 'orden';
    const sortOrder = q.sortOrder ?? 'ASC';

    const qb = this.tareaRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.deleted_at IS NULL');

    if (q.establecimiento_id !== undefined)
      qb.andWhere('t.establecimiento_id = :eid', { eid: q.establecimiento_id });
    if (q.ambito !== undefined)
      qb.andWhere('t.ambito = :ambito', { ambito: q.ambito });
    if (q.estado !== undefined)
      qb.andWhere('t.estado = :estado', { estado: q.estado });
    if (q.asignado_a !== undefined) {
      const asignado = q.asignado_a === 'me' ? userId : q.asignado_a;
      qb.andWhere('t.asignado_a_usuario_id = :asignado', { asignado });
    }
    if (q.q) {
      const search = `%${q.q}%`;
      qb.andWhere('(t.titulo ILIKE :search OR t.descripcion ILIKE :search)', {
        search,
      });
    }

    // Desempate por id: ninguna columna ordenable es unica (orden se repite
    // entre tableros, y entre activas y cerradas del mismo tablero), asi que
    // sin este criterio el OFFSET puede devolver la misma fila en dos paginas
    // y saltear otra.
    qb.orderBy(`t.${sortBy}`, sortOrder)
      .addOrderBy('t.id', 'ASC')
      .skip(skip)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items: await this.toViews(items, tenantId), total };
  }

  async getTareaById(id: string): Promise<TareaView> {
    const tenantId = this.tenancy.requireTenantId();
    const tarea = await this.mustFindTarea(id, tenantId);
    return this.toView(tarea, tenantId);
  }

  async updateTarea(
    id: string,
    dto: UpdateTareaDto,
    req: AuditReq,
  ): Promise<TareaView> {
    const tenantId = this.tenancy.requireTenantId();
    const tarea = await this.mustFindTarea(id, tenantId);

    if (dto.asignado_a_usuario_id) {
      await this.validarAsignado(dto.asignado_a_usuario_id, tenantId);
    }

    // null explicito limpia el campo; undefined lo deja como estaba.
    const cambios: Record<string, unknown> = {};
    if (dto.titulo !== undefined) {
      tarea.titulo = dto.titulo;
      cambios['titulo'] = tarea.titulo;
    }
    if (dto.descripcion !== undefined) {
      tarea.descripcion = dto.descripcion ?? null;
      cambios['descripcion'] = tarea.descripcion;
    }
    if (dto.asignado_a_usuario_id !== undefined) {
      tarea.asignado_a_usuario_id = dto.asignado_a_usuario_id ?? null;
      cambios['asignado_a_usuario_id'] = tarea.asignado_a_usuario_id;
    }

    const saved = await this.tareaRepo.save(tarea);
    await this.writeAudit(AUDIT.UPDATED, id, req, tenantId, 200, cambios);
    return this.toView(saved, tenantId);
  }

  async cambiarEstado(
    id: string,
    dto: CambiarEstadoDto,
    req: AuditReq,
    roles: string[],
  ): Promise<TareaView> {
    const tenantId = this.tenancy.requireTenantId();
    const tarea = await this.mustFindTarea(id, tenantId);

    const from = tarea.estado;
    const to = dto.estado;

    if (!TRANSICIONES[from].includes(to)) {
      throw new AppError({
        code: ErrorCodes.TAREA_TRANSICION_INVALIDA,
        message: `No se puede pasar de ${from} a ${to}`,
        status: 422,
        details: { from, to },
      });
    }

    // La reapertura depende del estado de origen, no solo del rol, asi que no
    // se puede expresar con @Roles en el controller y se valida aca.
    const esReapertura =
      from === TareaEstado.COMPLETADA || from === TareaEstado.CANCELADA;
    if (esReapertura && !roles.some((r) => ROLES_REAPERTURA.includes(r))) {
      throw new AppError({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Solo supervisor o admin_global pueden reabrir una tarea',
        status: 403,
        details: { from, to },
      });
    }

    tarea.estado = to;
    if (to === TareaEstado.COMPLETADA) {
      tarea.completada_at = new Date();
      tarea.completada_por_usuario_id = req.userId;
    } else if (from === TareaEstado.COMPLETADA) {
      tarea.completada_at = null;
      tarea.completada_por_usuario_id = null;
    }

    const saved = await this.tareaRepo.save(tarea);
    await this.writeAudit(AUDIT.ESTADO_CHANGED, id, req, tenantId, 200, {
      from,
      to,
    });
    return this.toView(saved, tenantId);
  }

  async reordenar(
    dto: ReordenarTareasDto,
    req: AuditReq,
  ): Promise<TareaView[]> {
    const tenantId = this.tenancy.requireTenantId();
    await this.estService.mustFindById(dto.establecimiento_id, {
      strictTenant: true,
    });

    const recibidas = dto.tarea_ids;
    const unicas = new Set(recibidas);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // FOR UPDATE: dos reordenamientos simultaneos del mismo tablero se
      // serializan en vez de intercalar sus UPDATE y dejar ordenes repetidos.
      const activas = await qr.manager
        .createQueryBuilder(Tarea, 't')
        .setLock('pessimistic_write')
        .where('t.tenant_id = :tenantId', { tenantId })
        .andWhere('t.establecimiento_id = :eid', {
          eid: dto.establecimiento_id,
        })
        .andWhere('t.ambito = :ambito', { ambito: dto.ambito })
        .andWhere('t.estado IN (:...estados)', { estados: ESTADOS_ACTIVOS })
        .andWhere('t.deleted_at IS NULL')
        .orderBy('t.orden', 'ASC')
        .addOrderBy('t.id', 'ASC')
        .getMany();

      const esperadas = activas.map((t) => t.id);

      // El request tiene que traer exactamente las activas del tablero: ni
      // repetidas, ni de mas, ni de menos. Si alguien creo, cerro o borro una
      // mientras el otro arrastraba, es preferible fallar visible a guardar un
      // orden parcial que nadie pidio.
      const coincide =
        unicas.size === recibidas.length &&
        esperadas.length === recibidas.length &&
        esperadas.every((id) => unicas.has(id));
      if (!coincide) {
        throw new AppError({
          code: ErrorCodes.TAREA_REORDEN_INVALIDO,
          message:
            'El conjunto enviado no coincide con las tareas activas del tablero',
          status: 422,
          details: { esperadas, recibidas },
        });
      }

      for (let i = 0; i < recibidas.length; i++) {
        await qr.manager.update(
          Tarea,
          { id: recibidas[i], tenant_id: tenantId },
          { orden: i + 1 },
        );
      }
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    await this.writeAudit(
      AUDIT.REORDENADA,
      dto.establecimiento_id,
      req,
      tenantId,
      200,
      {
        establecimiento_id: dto.establecimiento_id,
        ambito: dto.ambito,
        cantidad: recibidas.length,
      },
    );

    const tablero = await this.tareaRepo.find({
      where: {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        ambito: dto.ambito,
        deleted_at: IsNull(),
      },
      order: { orden: 'ASC', id: 'ASC' },
    });
    return this.toViews(tablero, tenantId);
  }

  async deleteTarea(id: string, req: AuditReq): Promise<void> {
    const tenantId = this.tenancy.requireTenantId();
    await this.mustFindTarea(id, tenantId);

    await this.tareaRepo.softDelete({ id, tenant_id: tenantId });
    await this.writeAudit(AUDIT.DELETED, id, req, tenantId, 200, { id });
  }

  // ────────────────────────────────────────────────────────────────────────

  private async mustFindTarea(id: string, tenantId: string): Promise<Tarea> {
    const tarea = await this.tareaRepo.findOne({
      where: { id, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!tarea) {
      // Mismo 404 para "no existe", "es de otro tenant" y "esta borrada": no
      // hay que revelar la existencia de tareas ajenas.
      throw new AppError({
        code: ErrorCodes.TAREA_NOT_FOUND,
        message: 'Tarea no encontrada',
        status: 404,
        details: { id },
      });
    }
    return tarea;
  }

  /**
   * El asignado tiene que ser un usuario del tenant (o global) y no estar
   * borrado. Consulta directa a users a proposito: importar UsersModule ataria
   * este modulo a otro modulo de feature.
   */
  private async validarAsignado(
    usuarioId: string,
    tenantId: string,
  ): Promise<void> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .from('users', 'u')
      .where('u.id = :usuarioId', { usuarioId })
      .andWhere('(u.tenant_id = :tenantId OR u.tenant_id IS NULL)', {
        tenantId,
      })
      .andWhere('u.deleted_at IS NULL')
      .getRawOne<{ id: string }>();

    if (!row) {
      throw new AppError({
        code: ErrorCodes.TAREA_ASIGNADO_INVALIDO,
        message: 'El usuario asignado no pertenece al tenant',
        status: 422,
        details: { asignado_a_usuario_id: usuarioId },
      });
    }
  }

  private async toView(tarea: Tarea, tenantId: string): Promise<TareaView> {
    const [view] = await this.toViews([tarea], tenantId);
    return view;
  }

  /** Una sola consulta batch para los tres ids de usuario de toda la pagina. */
  private async toViews(
    tareas: Tarea[],
    tenantId: string,
  ): Promise<TareaView[]> {
    const userIds: string[] = [];
    for (const t of tareas) {
      userIds.push(t.creada_por_usuario_id);
      if (t.asignado_a_usuario_id) userIds.push(t.asignado_a_usuario_id);
      if (t.completada_por_usuario_id)
        userIds.push(t.completada_por_usuario_id);
    }
    const usuarios = await buildUsuariosMap(this.dataSource, userIds, tenantId);

    return tareas.map((t) => ({
      id: t.id,
      establecimiento_id: t.establecimiento_id,
      ambito: t.ambito,
      estado: t.estado,
      titulo: t.titulo,
      descripcion: t.descripcion,
      orden: t.orden,
      asignado_a: t.asignado_a_usuario_id
        ? (usuarios.get(t.asignado_a_usuario_id) ?? null)
        : null,
      creada_por: usuarios.get(t.creada_por_usuario_id) ?? null,
      completada_at: t.completada_at,
      completada_por: t.completada_por_usuario_id
        ? (usuarios.get(t.completada_por_usuario_id) ?? null)
        : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
  }

  private async writeAudit(
    action: string,
    entityId: string,
    req: AuditReq,
    tenantId: string,
    statusCode: number,
    extra: Record<string, unknown>,
  ): Promise<void> {
    const payload = auditLogPayload({
      requestId: req.requestId,
      actorUserId: req.userId,
      actorEmail: req.email,
      action,
      entity: ENTITY,
      extra: { tareaId: entityId, ...extra },
    });
    this.logger.info(payload, 'admin_audit');
    await this.audit.write('admin', {
      request_id: req.requestId,
      method: req.method,
      path: req.url,
      status_code: statusCode,
      actor_user_id: req.userId,
      actor_email: req.email ?? null,
      action,
      entity: ENTITY,
      tenant_id: tenantId,
      payload,
    });
  }
}
