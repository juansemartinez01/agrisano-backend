import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BaseCrudTenantService } from 'src/common/crud/base-crud.service';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import {
  esFechaDiaValida,
  hoyISO,
  resolveFechaDia,
} from 'src/common/utils/fecha-dia.util';
import { clampPagination } from 'src/common/query/query-utils';
import {
  buildUsuariosMap,
  fetchUsuarioSnapshot,
  resolveUsuarioResumen,
  UsuarioResumen,
  UsuarioSnapshotFields,
} from 'src/common/utils/usuario-resumen.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { Bandeja, BandejaEstado } from './entities/bandeja.entity';
import {
  BandejaDescarte,
  BandejaDescarteMotivo,
} from './entities/bandeja-descarte.entity';
import { QueryBandejasDto } from './dto/query-bandejas.dto';
import { QueryDescartesDto } from './dto/query-descartes.dto';
import { DescartarBandejasDto } from './dto/descartar-bandejas.dto';

export const AUDIT = {
  DESCARTE: 'bandeja_descartada',
} as const;

// Fila de bandejas ya bloqueada dentro de la transaccion, con los dos dias
// calendario que hacen falta para validar una fecha retroactiva.
interface BandejaBloqueada {
  id: string;
  estado: BandejaEstado;
  siembra_id: string;
  mesa_id: string | null;
  establecimiento_id: string;
  fecha_hecho: string | null;
  fecha_siembra: string;
}

export interface BandejaDescartada {
  bandeja_id: string;
  estado_anterior: BandejaEstado;
  siembra_id: string;
  mesa_id: string | null;
  establecimiento_id: string;
}

/** Lo que se muestra en un listado: alcanza para marcar la baja y su causa. */
export interface DescarteResumen {
  motivo: BandejaDescarteMotivo;
  fecha_descarte: Date;
  estado_anterior: BandejaEstado;
}

/** Lo que se muestra al abrir la bandeja: suma el texto libre y el responsable. */
export interface DescarteDetalle extends DescarteResumen {
  observaciones: string | null;
  usuario: UsuarioResumen | null;
}

export type BandejaConDescarte = Bandeja & { descarte: DescarteResumen | null };
export type BandejaConDescarteDetalle = Bandeja & {
  descarte: DescarteDetalle | null;
};

/** Fila del reporte de mermas: la constancia, mas de donde salio la bandeja. */
export interface DescarteListItem {
  bandeja_id: string;
  estado_anterior: BandejaEstado;
  motivo: BandejaDescarteMotivo;
  observaciones: string | null;
  fecha_descarte: Date;
  created_at: Date;
  usuario: UsuarioResumen | null;
  bandeja: {
    siembra_id: string;
    mesa_id: string | null;
    establecimiento_id: string;
    lote_semilla_id: string;
  };
}

interface DescarteRawRow extends UsuarioSnapshotFields {
  bandeja_id: string;
  estado_anterior: BandejaEstado;
  motivo: BandejaDescarteMotivo;
  observaciones: string | null;
  fecha_descarte: Date;
  created_at: Date;
  usuario_id: string;
  siembra_id: string;
  mesa_id: string | null;
  establecimiento_id: string;
  lote_semilla_id: string;
}

export interface DescartarBandejasResult {
  descartadas: number;
  motivo: BandejaDescarteMotivo;
  fecha_descarte: Date;
  bandejas: BandejaDescartada[];
  usuario: UsuarioResumen | null;
}

@Injectable()
export class BandejaService extends BaseCrudTenantService<Bandeja> {
  constructor(
    @InjectRepository(Bandeja)
    private readonly bandejaRepo: Repository<Bandeja>,
    @InjectRepository(BandejaDescarte)
    private readonly descarteRepo: Repository<BandejaDescarte>,
    private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
  ) {
    super(bandejaRepo);
  }

  /**
   * El filtro `estado` es opcional de verdad: sin filtro se devuelve todo
   * menos `descartada`, y `estado=descartada` es la via explicita para ver
   * las perdidas. La asimetria es deliberada — ocultar un estado terminal por
   * default es la misma convencion que `deleted_at IS NULL`.
   */
  async listBandejas(
    q: QueryBandejasDto,
  ): Promise<{ items: BandejaConDescarte[]; total: number }> {
    const filters: Record<string, unknown> = {};
    if (q.estado) filters['estado'] = q.estado;
    if (q.establecimiento_id) filters['establecimiento_id'] = q.establecimiento_id;
    if (q.siembra_id) filters['siembra_id'] = q.siembra_id;
    if (q.lote_semilla_id) filters['lote_semilla_id'] = q.lote_semilla_id;
    if (q.lote_vermiculita_id)
      filters['lote_vermiculita_id'] = q.lote_vermiculita_id;
    if (q.mesa_id) filters['mesa_id'] = q.mesa_id;

    const { items, total } = await this.list(
      { ...q, filters },
      {
        filterAllowed: [
          'estado',
          'establecimiento_id',
          'siembra_id',
          'lote_semilla_id',
          'lote_vermiculita_id',
          'mesa_id',
        ],
        sortAllowed: ['fecha_entrada_nursery', 'created_at'],
        sortFallback: { by: 'created_at', order: 'DESC' },
        // Las bandejas de una misma siembra se crean en el mismo INSERT y
        // comparten created_at al microsegundo, asi que sin desempate la
        // paginacion del caso mas comun es justamente la inestable.
        sortTiebreak: { by: 'id', order: 'ASC' },
        strictTenant: true,
        customizeQb: (qb, alias) => {
          if (!q.estado) {
            qb.andWhere(`${alias}.estado <> :estadoTerminal`, {
              estadoTerminal: BandejaEstado.DESCARTADA,
            });
          }
        },
      },
    );

    const descartes = await this.buildDescartesMap(items);
    return {
      total,
      items: items.map((b) => ({
        ...b,
        descarte: this.resumenDescarte(descartes.get(b.id)),
      })),
    };
  }

  /**
   * Constancias de descarte de un conjunto de bandejas, en una sola consulta.
   *
   * Se resuelve sobre la pagina ya materializada en vez de con un LEFT JOIN
   * dentro del listado porque `list()` del CRUD base cierra con
   * `getManyAndCount()`, que descarta las columnas crudas de un join a una
   * tabla sin relacion declarada. El costo es el mismo —una consulta por clave
   * primaria, acotada al tamano de pagina— y el listado compartido no se toca.
   *
   * Solo una bandeja `descartada` puede tener constancia, asi que se filtra
   * antes de preguntar: en el listado por default, que las excluye, no se
   * ejecuta ninguna consulta extra.
   */
  private async buildDescartesMap(
    bandejas: Bandeja[],
  ): Promise<Map<string, BandejaDescarte>> {
    const map = new Map<string, BandejaDescarte>();
    const ids = bandejas
      .filter((b) => b.estado === BandejaEstado.DESCARTADA)
      .map((b) => b.id);
    if (!ids.length) return map;

    const tenantId = this.tenancy.requireTenantId();
    const filas = await this.descarteRepo.find({
      where: { bandeja_id: In(ids), tenant_id: tenantId },
    });
    for (const f of filas) map.set(f.bandeja_id, f);
    return map;
  }

  private resumenDescarte(
    d: BandejaDescarte | undefined,
  ): DescarteResumen | null {
    if (!d) return null;
    return {
      motivo: d.motivo,
      fecha_descarte: d.fecha_descarte,
      estado_anterior: d.estado_anterior,
    };
  }

  async getBandeja(id: string): Promise<BandejaConDescarteDetalle> {
    const tenantId = this.tenancy.requireTenantId();
    const bandeja = await this.findById(id, { strictTenant: true });
    if (!bandeja) {
      throw new AppError({
        code: ErrorCodes.BANDEJA_NOT_FOUND,
        message: 'Bandeja no encontrada',
        status: 404,
      });
    }

    // carencia_hasta, mesa_id y las fechas del ciclo se devuelven tal cual: la
    // perdida agrega informacion, no reescribe la historia de la bandeja.
    if (bandeja.estado !== BandejaEstado.DESCARTADA) {
      return { ...bandeja, descarte: null };
    }

    const d = await this.descarteRepo.findOne({
      where: { bandeja_id: id, tenant_id: tenantId },
    });
    if (!d) return { ...bandeja, descarte: null };

    const usuarios = await buildUsuariosMap(
      this.dataSource,
      [d.usuario_id],
      tenantId,
    );
    return {
      ...bandeja,
      descarte: {
        motivo: d.motivo,
        fecha_descarte: d.fecha_descarte,
        estado_anterior: d.estado_anterior,
        observaciones: d.observaciones,
        usuario: resolveUsuarioResumen(
          d.usuario_id,
          d,
          usuarios.get(d.usuario_id),
        ),
      },
    };
  }

  /**
   * Reporte de mermas. Las columnas para agrupar —establecimiento y siembra—
   * viven en `bandejas`, no en la constancia, de ahi el join.
   *
   * El join no filtra `deleted_at`: una merma es un hecho ocurrido, y que la
   * bandeja se borre logicamente despues no la saca del reporte.
   */
  async listDescartes(
    q: QueryDescartesDto,
  ): Promise<{ items: DescarteListItem[]; total: number }> {
    const tenantId = this.tenancy.requireTenantId();
    const { limit, skip } = clampPagination(q.page, q.limit, 200);

    const qb = this.descarteRepo
      .createQueryBuilder('d')
      .innerJoin('bandejas', 'b', 'b.id = d.bandeja_id')
      .where('d.tenant_id = :tenantId', { tenantId });

    if (q.establecimiento_id) {
      qb.andWhere('b.establecimiento_id = :estId', {
        estId: q.establecimiento_id,
      });
    }
    if (q.siembra_id) {
      qb.andWhere('b.siembra_id = :siembraId', { siembraId: q.siembra_id });
    }
    if (q.motivo) qb.andWhere('d.motivo = :motivo', { motivo: q.motivo });
    if (q.estado_anterior) {
      qb.andWhere('d.estado_anterior = :estadoAnterior', {
        estadoAnterior: q.estado_anterior,
      });
    }

    // Mismo criterio que al validar la fecha de un descarte: se compara el dia
    // calendario como texto en UTC. Asi el rango no depende de la zona horaria
    // de la sesion ni de como el driver mapea timestamptz, y `fecha_hasta`
    // queda inclusivo hasta el final del dia sin aritmetica de intervalos.
    const DIA = "to_char(d.fecha_descarte AT TIME ZONE 'UTC', 'YYYY-MM-DD')";
    if (q.fecha_desde) {
      qb.andWhere(`${DIA} >= :desde`, { desde: q.fecha_desde });
    }
    if (q.fecha_hasta) {
      qb.andWhere(`${DIA} <= :hasta`, { hasta: q.fecha_hasta });
    }

    const total = await qb.getCount();

    // bandeja_id como desempate: varias bandejas de un mismo lote se descartan
    // en la misma llamada y comparten fecha_descarte al microsegundo.
    qb.orderBy(`d.${q.sortBy ?? 'fecha_descarte'}`, q.sortOrder ?? 'DESC')
      .addOrderBy('d.bandeja_id', 'ASC')
      .offset(skip)
      .limit(limit);

    const filas = await qb
      .select('d.bandeja_id', 'bandeja_id')
      .addSelect('d.estado_anterior', 'estado_anterior')
      .addSelect('d.motivo', 'motivo')
      .addSelect('d.observaciones', 'observaciones')
      .addSelect('d.fecha_descarte', 'fecha_descarte')
      .addSelect('d.created_at', 'created_at')
      .addSelect('d.usuario_id', 'usuario_id')
      .addSelect('d.usuario_email_snapshot', 'usuario_email_snapshot')
      .addSelect('d.usuario_nombre_snapshot', 'usuario_nombre_snapshot')
      .addSelect('d.usuario_apellido_snapshot', 'usuario_apellido_snapshot')
      .addSelect('b.siembra_id', 'siembra_id')
      .addSelect('b.mesa_id', 'mesa_id')
      .addSelect('b.establecimiento_id', 'establecimiento_id')
      .addSelect('b.lote_semilla_id', 'lote_semilla_id')
      .getRawMany<DescarteRawRow>();

    const usuarios = await buildUsuariosMap(
      this.dataSource,
      filas.map((f) => f.usuario_id),
      tenantId,
    );

    const items = filas.map((f) => ({
      bandeja_id: f.bandeja_id,
      estado_anterior: f.estado_anterior,
      motivo: f.motivo,
      observaciones: f.observaciones,
      fecha_descarte: f.fecha_descarte,
      created_at: f.created_at,
      usuario: resolveUsuarioResumen(f.usuario_id, f, usuarios.get(f.usuario_id)),
      bandeja: {
        siembra_id: f.siembra_id,
        mesa_id: f.mesa_id,
        establecimiento_id: f.establecimiento_id,
        lote_semilla_id: f.lote_semilla_id,
      },
    }));

    return { items, total };
  }

  /**
   * Registra la pérdida de una o varias bandejas. Todo o nada.
   *
   * Tres sentencias de costo independiente de la cantidad de bandejas: bloqueo
   * y elegibilidad, constancia, transición. Las guardas viven en el SQL, no en
   * un `if` previo a la transacción.
   */
  async descartarBandejas(
    dto: DescartarBandejasDto,
    userId: string,
  ): Promise<DescartarBandejasResult> {
    const tenantId = this.tenancy.requireTenantId();

    // Los repetidos se deduplican, no son error: mandar dos veces la misma
    // bandeja es un descuido del cliente, no un conflicto de negocio.
    const ids = [...new Set(dto.bandeja_ids)];

    if (dto.motivo === BandejaDescarteMotivo.OTRO && !dto.observaciones?.trim()) {
      throw new AppError({
        code: ErrorCodes.BANDEJA_DESCARTE_MOTIVO_REQUIERE_OBSERVACIONES,
        message: 'El motivo "otro" exige observaciones que expliquen la pérdida',
        status: 422,
      });
    }

    // Lo que se puede rechazar sin mirar las bandejas se rechaza antes de abrir
    // la transacción: no tiene sentido bloquear filas para terminar fallando.
    if (dto.fecha_descarte) {
      if (!esFechaDiaValida(dto.fecha_descarte)) {
        throw new AppError({
          code: ErrorCodes.BANDEJA_DESCARTE_FECHA_INVALIDA,
          message: `La fecha de descarte ${dto.fecha_descarte} no existe en el calendario`,
          status: 422,
        });
      }
      const hoy = hoyISO();
      if (dto.fecha_descarte > hoy) {
        throw new AppError({
          code: ErrorCodes.BANDEJA_DESCARTE_FECHA_INVALIDA,
          message: `La fecha de descarte no puede ser posterior a hoy (${hoy})`,
          status: 422,
        });
      }
    }

    // null significa "usar el now() de la base": sin fecha informada, o con la
    // fecha de hoy, que anclada al mediodía UTC sería un instante futuro.
    const fechaParam = resolveFechaDia(dto.fecha_descarte);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let filas: BandejaBloqueada[];
    let fechaPersistida: Date;
    let usuarioSnapshot: UsuarioSnapshotFields;

    try {
      usuarioSnapshot = await fetchUsuarioSnapshot(qr.manager, userId, tenantId);

      // 1) Bloqueo y elegibilidad, en una sola sentencia para cualquier
      //    cantidad de bandejas. FOR UPDATE OF b: el join a siembras es sólo
      //    para conocer su fecha, no hay por qué bloquear también la siembra.
      //
      //    Los días calendario salen con to_char() en vez de quedar como
      //    date/timestamptz: así se comparan como strings 'YYYY-MM-DD', sin
      //    depender de cómo el driver parsea cada tipo ni de la zona horaria
      //    del proceso.
      filas = (await qr.query(
        `SELECT b.id, b.estado, b.siembra_id, b.mesa_id, b.establecimiento_id,
                to_char(
                  COALESCE(b.fecha_trasplante, b.fecha_entrada_nursery) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD'
                ) AS fecha_hecho,
                to_char(s.fecha, 'YYYY-MM-DD') AS fecha_siembra
           FROM bandejas b
           JOIN siembras s ON s.id = b.siembra_id
          WHERE b.id = ANY($1::uuid[]) AND b.tenant_id = $2 AND b.deleted_at IS NULL
            FOR UPDATE OF b`,
        [ids, tenantId],
      )) as BandejaBloqueada[];

      // Inexistente, borrada lógicamente y de otro tenant colapsan en el mismo
      // 404 a propósito: no se filtra la existencia de datos de otro cliente.
      const encontradas = new Set(filas.map((f) => f.id));
      const faltantes = ids.filter((id) => !encontradas.has(id));
      if (faltantes.length) {
        throw new AppError({
          code: ErrorCodes.BANDEJA_NOT_FOUND,
          message: `No se encontraron ${faltantes.length} de las ${ids.length} bandejas indicadas`,
          status: 404,
          details: { ids: faltantes },
        });
      }

      // Todo o nada: una sola bandeja ya perdida aborta el lote entero. Un
      // éxito parcial dejaría al operario sin saber qué quedó registrado.
      const yaDescartadas = filas
        .filter((f) => f.estado === BandejaEstado.DESCARTADA)
        .map((f) => f.id);
      if (yaDescartadas.length) {
        throw new AppError({
          code: ErrorCodes.BANDEJA_YA_DESCARTADA,
          message: `${yaDescartadas.length} de las bandejas indicadas ya tienen una pérdida registrada`,
          status: 409,
          details: { ids: yaDescartadas },
        });
      }

      // Una bandeja trasplantada el 5 no pudo perderse el 3. El último hecho
      // conocido es el trasplante; si no lo hubo, la entrada a nursery; si
      // tampoco, la siembra. Comparación entre strings 'YYYY-MM-DD': en ISO
      // 8601 el orden lexicográfico coincide con el cronológico.
      if (dto.fecha_descarte) {
        const fecha = dto.fecha_descarte;
        const anteriores = filas
          .filter((f) => fecha < (f.fecha_hecho ?? f.fecha_siembra))
          .map((f) => f.id);
        if (anteriores.length) {
          throw new AppError({
            code: ErrorCodes.BANDEJA_DESCARTE_FECHA_INVALIDA,
            message: `La fecha de descarte ${fecha} es anterior al último hecho registrado de ${anteriores.length} de las bandejas`,
            status: 422,
            details: { ids: anteriores },
          });
        }
      }

      // 2) La constancia. estado_anterior sale de b.estado, o sea de la fila ya
      //    bloqueada, nunca del request: así no hay ventana entre leer el
      //    estado y guardarlo. El RETURNING es para conocer el instante real
      //    cuando lo resolvió now().
      const insertadas = (await qr.query(
        `INSERT INTO bandeja_descartes
           (bandeja_id, tenant_id, estado_anterior, motivo, observaciones,
            fecha_descarte, usuario_id,
            usuario_email_snapshot, usuario_nombre_snapshot, usuario_apellido_snapshot)
         SELECT b.id, b.tenant_id, b.estado,
                $3::bandeja_descarte_motivo, $4::text,
                COALESCE($5::timestamptz, now()),
                $6::uuid, $7::varchar, $8::varchar, $9::varchar
           FROM bandejas b
          WHERE b.id = ANY($1::uuid[]) AND b.tenant_id = $2
       RETURNING bandeja_id, fecha_descarte`,
        [
          ids,
          tenantId,
          dto.motivo,
          dto.observaciones ?? null,
          fechaParam,
          userId,
          usuarioSnapshot.usuario_email_snapshot,
          usuarioSnapshot.usuario_nombre_snapshot,
          usuarioSnapshot.usuario_apellido_snapshot,
        ],
      )) as Array<{ bandeja_id: string; fecha_descarte: Date }>;

      fechaPersistida = insertadas[0].fecha_descarte;

      // 3) El evento en el historial, sólo para las que estaban trasplantadas:
      //    el historial es de la mesa, y una bandeja en nursery todavía no
      //    pertenece a ninguna. Un solo INSERT para todas, vía unnest.
      //
      //    fecha_hora lleva la fecha del incidente y no now(): la línea de
      //    tiempo de la mesa tiene que mostrar cuándo se perdió la bandeja.
      //    Cuándo se cargó el registro queda en created_at.
      const trasplantadas = filas.filter(
        (f) => f.estado === BandejaEstado.TRASPLANTADA && f.mesa_id !== null,
      );
      if (trasplantadas.length) {
        await qr.query(
          `INSERT INTO historial_mesa
             (tenant_id, mesa_id, tipo_evento, fecha_hora, detalle, usuario_id,
              usuario_email_snapshot, usuario_nombre_snapshot, usuario_apellido_snapshot)
           SELECT $1::uuid, e.mesa_id, 'bandeja_descartada'::historial_tipo_evento,
                  $2::timestamptz, e.detalle, $3::uuid,
                  $4::varchar, $5::varchar, $6::varchar
             FROM unnest($7::uuid[], $8::jsonb[]) AS e(mesa_id, detalle)`,
          [
            tenantId,
            fechaPersistida,
            userId,
            usuarioSnapshot.usuario_email_snapshot,
            usuarioSnapshot.usuario_nombre_snapshot,
            usuarioSnapshot.usuario_apellido_snapshot,
            trasplantadas.map((f) => f.mesa_id),
            trasplantadas.map((f) =>
              JSON.stringify({
                bandeja_id: f.id,
                motivo: dto.motivo,
                observaciones: dto.observaciones ?? null,
                fecha_descarte: fechaPersistida,
              }),
            ),
          ],
        );
      }

      // 4) La transición, con la guarda en el WHERE. Las filas ya están
      //    bloqueadas desde el paso 1, así que acá la guarda es defensa en
      //    profundidad. Ojo con el resultado: en un UPDATE, qr.query() devuelve
      //    [filas, affected], no las filas.
      const [actualizadas] = (await qr.query(
        `UPDATE bandejas
            SET estado = 'descartada', updated_at = now()
          WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND estado <> 'descartada'
      RETURNING id`,
        [ids, tenantId],
      )) as [Array<{ id: string }>, number];

      if (actualizadas.length !== ids.length) {
        const tocadas = new Set(actualizadas.map((a) => a.id));
        throw new AppError({
          code: ErrorCodes.BANDEJA_YA_DESCARTADA,
          message: 'Alguna de las bandejas dejó de estar disponible para descartar',
          status: 409,
          details: { ids: ids.filter((id) => !tocadas.has(id)) },
        });
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return {
      descartadas: filas.length,
      motivo: dto.motivo,
      fecha_descarte: fechaPersistida,
      bandejas: filas.map((f) => ({
        bandeja_id: f.id,
        estado_anterior: f.estado,
        siembra_id: f.siembra_id,
        mesa_id: f.mesa_id,
        establecimiento_id: f.establecimiento_id,
      })),
      usuario: resolveUsuarioResumen(userId, usuarioSnapshot, null),
    };
  }
}
