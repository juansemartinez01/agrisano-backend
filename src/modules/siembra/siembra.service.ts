import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppError } from 'src/common/errors/app-error';
import { ErrorCodes } from 'src/common/errors/error-codes';
import { clampPagination } from 'src/common/query/query-utils';
import {
  buildUsuariosMap,
  fetchUsuarioSnapshot,
  resolveUsuarioResumen,
  UsuarioResumen,
} from 'src/common/utils/usuario-resumen.util';
import {
  esFechaDiaValida,
  hoyISO,
  resolveFechaDia,
} from 'src/common/utils/fecha-dia.util';
import { TenancyService } from 'src/modules/tenancy/tenancy.service';
import { LotesService } from 'src/modules/lotes/lotes.service';
import { LoteEstado, LoteTipo } from 'src/modules/lotes/entities/lote.entity';
import { EstablecimientosService } from 'src/modules/establecimientos/establecimientos.service';
import { Siembra } from './entities/siembra.entity';
import { Bandeja, BandejaEstado } from './entities/bandeja.entity';
import { CreateSiembraDto } from './dto/create-siembra.dto';
import { UpdateSiembraDto } from './dto/update-siembra.dto';
import { QuerySiembrasDto } from './dto/query-siembras.dto';
import { IngresarNurseryDto } from './dto/ingresar-nursery.dto';

export const AUDIT = {
  CREATED: 'siembra_created',
  UPDATED: 'siembra_updated',
  DELETED: 'siembra_deleted',
  INGRESO_NURSERY: 'siembra_ingreso_nursery',
} as const;

interface LoteRef {
  id: string;
  numero_lote: string;
  tipo: string;
}

// El grado solo existe en los lotes de vermiculita, así que no se sube a
// LoteRef: semilla y sustrato lo tienen siempre en null.
interface LoteVermiculitaRef extends LoteRef {
  grado: number;
}

type BandejaWithRefs = Bandeja & {
  lote_semilla?: LoteRef;
  lote_sustrato?: LoteRef;
  lote_vermiculita?: LoteVermiculitaRef;
};

export interface SiembraWithBandejas extends Siembra {
  usuario: UsuarioResumen | null;
  bandejas: BandejaWithRefs[];
}

@Injectable()
export class SiembraService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Siembra)
    private readonly siembraRepo: Repository<Siembra>,
    @InjectRepository(Bandeja)
    private readonly bandejaRepo: Repository<Bandeja>,
    private readonly lotesService: LotesService,
    private readonly estService: EstablecimientosService,
    private readonly tenancy: TenancyService,
  ) {}

  async listSiembras(
    q: QuerySiembrasDto,
  ): Promise<{
    items: (Siembra & { usuario: UsuarioResumen | null })[];
    total: number;
  }> {
    const tenantId = this.tenancy.requireTenantId();
    const { page, limit, skip } = clampPagination(q.page, q.limit, 200);
    const SORT_ALLOWED = ['fecha', 'created_at'];
    const sortBy = SORT_ALLOWED.includes(q.sortBy ?? '') ? (q.sortBy as string) : 'created_at';
    const sortOrder = q.sortOrder ?? 'DESC';

    const qb = this.siembraRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId });

    if (q.establecimiento_id) {
      qb.andWhere('s.establecimiento_id = :estId', { estId: q.establecimiento_id });
    }
    if (q.fecha_desde) {
      qb.andWhere('s.fecha >= :desde', { desde: q.fecha_desde });
    }
    if (q.fecha_hasta) {
      qb.andWhere('s.fecha <= :hasta', { hasta: q.fecha_hasta });
    }

    qb.orderBy(`s.${sortBy}`, sortOrder).skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const userIds = items.map((s) => s.usuario_id);
    const usuarios = await buildUsuariosMap(this.dataSource, userIds, tenantId);
    const enriched = items.map((s) => ({
      ...s,
      usuario: resolveUsuarioResumen(s.usuario_id, s, usuarios.get(s.usuario_id)),
    }));
    return { items: enriched, total };
  }

  async getSiembraWithBandejas(id: string): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    const usuarios = await buildUsuariosMap(this.dataSource, [siembra.usuario_id], tenantId);
    const usuario = resolveUsuarioResumen(siembra.usuario_id, siembra, usuarios.get(siembra.usuario_id));

    const bandejas = await this.bandejaRepo
      .createQueryBuilder('b')
      .leftJoinAndMapOne('b.lote_semilla', 'lotes', 'ls', 'ls.id = b.lote_semilla_id')
      .leftJoinAndMapOne('b.lote_sustrato', 'lotes', 'lsu', 'lsu.id = b.lote_sustrato_id')
      .leftJoinAndMapOne(
        'b.lote_vermiculita',
        'lotes',
        'lv',
        'lv.id = b.lote_vermiculita_id',
      )
      .where('b.siembra_id = :id', { id })
      .andWhere('b.tenant_id = :tenantId', { tenantId })
      .select([
        'b.id',
        'b.siembra_id',
        'b.lote_semilla_id',
        'b.lote_sustrato_id',
        'b.lote_vermiculita_id',
        'b.estado',
        'b.fecha_entrada_nursery',
        'b.fecha_trasplante',
        'b.mesa_id',
        'b.codigo',
        'b.establecimiento_id',
        'b.carencia_hasta',
        'b.created_at',
        'b.updated_at',
        'ls.id',
        'ls.numero_lote',
        'ls.tipo',
        'lsu.id',
        'lsu.numero_lote',
        'lsu.tipo',
        'lv.id',
        'lv.numero_lote',
        'lv.tipo',
        'lv.grado',
      ])
      .getMany() as BandejaWithRefs[];

    return { ...siembra, usuario, bandejas };
  }

  async createSiembra(
    dto: CreateSiembraDto,
    userId: string,
  ): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    await this.estService.mustFindById(dto.establecimiento_id, { strictTenant: true });

    for (const group of dto.bandejas) {
      const semilla = await this.lotesService.mustFindById(
        group.lote_semilla_id,
        { strictTenant: true },
      );
      if (semilla.tipo !== LoteTipo.SEMILLA) {
        throw new AppError({
          code: ErrorCodes.LOTE_TIPO_INCORRECTO,
          message: `lote_semilla_id '${group.lote_semilla_id}' debe ser tipo semilla`,
          status: 422,
        });
      }
      if (
        semilla.establecimiento_id !== null &&
        semilla.establecimiento_id !== dto.establecimiento_id
      ) {
        throw new AppError({
          code: ErrorCodes.LOTE_ESTABLECIMIENTO_MISMATCH,
          message: `lote_semilla_id '${group.lote_semilla_id}' no pertenece al establecimiento de la siembra`,
          status: 422,
        });
      }
      if (semilla.estado === LoteEstado.CONSUMIDO) {
        throw new AppError({
          code: ErrorCodes.LOTE_CONSUMIDO,
          message: `lote_semilla_id '${group.lote_semilla_id}' está consumido y no puede usarse en una siembra`,
          status: 422,
        });
      }
      if (!semilla.activo) {
        throw new AppError({
          code: ErrorCodes.LOTE_INACTIVO,
          message: `lote_semilla_id '${group.lote_semilla_id}' está dado de baja y no puede usarse en una siembra`,
          status: 422,
        });
      }
      const sustrato = await this.lotesService.mustFindById(
        group.lote_sustrato_id,
        { strictTenant: true },
      );
      if (sustrato.tipo !== LoteTipo.SUSTRATO) {
        throw new AppError({
          code: ErrorCodes.LOTE_TIPO_INCORRECTO,
          message: `lote_sustrato_id '${group.lote_sustrato_id}' debe ser tipo sustrato`,
          status: 422,
        });
      }
      if (
        sustrato.establecimiento_id !== null &&
        sustrato.establecimiento_id !== dto.establecimiento_id
      ) {
        throw new AppError({
          code: ErrorCodes.LOTE_ESTABLECIMIENTO_MISMATCH,
          message: `lote_sustrato_id '${group.lote_sustrato_id}' no pertenece al establecimiento de la siembra`,
          status: 422,
        });
      }
      if (sustrato.estado === LoteEstado.CONSUMIDO) {
        throw new AppError({
          code: ErrorCodes.LOTE_CONSUMIDO,
          message: `lote_sustrato_id '${group.lote_sustrato_id}' está consumido y no puede usarse en una siembra`,
          status: 422,
        });
      }
      if (!sustrato.activo) {
        throw new AppError({
          code: ErrorCodes.LOTE_INACTIVO,
          message: `lote_sustrato_id '${group.lote_sustrato_id}' está dado de baja y no puede usarse en una siembra`,
          status: 422,
        });
      }

      // Opcional: se valida al final del grupo para no cambiar qué error se
      // reporta primero en las siembras que ya existían antes de la feature.
      if (group.lote_vermiculita_id) {
        const vermiculita = await this.lotesService.mustFindById(
          group.lote_vermiculita_id,
          { strictTenant: true },
        );
        if (vermiculita.tipo !== LoteTipo.VERMICULITA) {
          throw new AppError({
            code: ErrorCodes.LOTE_TIPO_INCORRECTO,
            message: `lote_vermiculita_id '${group.lote_vermiculita_id}' debe ser tipo vermiculita`,
            status: 422,
          });
        }
        if (
          vermiculita.establecimiento_id !== null &&
          vermiculita.establecimiento_id !== dto.establecimiento_id
        ) {
          throw new AppError({
            code: ErrorCodes.LOTE_ESTABLECIMIENTO_MISMATCH,
            message: `lote_vermiculita_id '${group.lote_vermiculita_id}' no pertenece al establecimiento de la siembra`,
            status: 422,
          });
        }
        if (vermiculita.estado === LoteEstado.CONSUMIDO) {
          throw new AppError({
            code: ErrorCodes.LOTE_CONSUMIDO,
            message: `lote_vermiculita_id '${group.lote_vermiculita_id}' está consumido y no puede usarse en una siembra`,
            status: 422,
          });
        }
        if (!vermiculita.activo) {
          throw new AppError({
            code: ErrorCodes.LOTE_INACTIVO,
            message: `lote_vermiculita_id '${group.lote_vermiculita_id}' está dado de baja y no puede usarse en una siembra`,
            status: 422,
          });
        }
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const usuarioSnapshot = await fetchUsuarioSnapshot(qr.manager, userId, tenantId);
      const siembra = qr.manager.create(Siembra, {
        tenant_id: tenantId,
        establecimiento_id: dto.establecimiento_id,
        fecha: dto.fecha ?? hoyISO(),
        observaciones: dto.observaciones ?? null,
        usuario_id: userId,
        ...usuarioSnapshot,
      });
      const savedSiembra = await qr.manager.save(Siembra, siembra);

      for (const group of dto.bandejas) {
        for (let i = 0; i < group.cantidad; i++) {
          const bandeja = qr.manager.create(Bandeja, {
            tenant_id: tenantId,
            siembra_id: savedSiembra.id,
            lote_semilla_id: group.lote_semilla_id,
            lote_sustrato_id: group.lote_sustrato_id,
            lote_vermiculita_id: group.lote_vermiculita_id ?? null,
            estado: BandejaEstado.COOLING_PERIOD,
            fecha_entrada_nursery: null,
            establecimiento_id: dto.establecimiento_id,
            codigo: randomUUID(),
          });
          await qr.manager.save(Bandeja, bandeja);
        }
      }

      await qr.commitTransaction();
      return this.getSiembraWithBandejas(savedSiembra.id);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /**
   * Valida la fecha de entrada a nursery informada por el usuario.
   *
   * Las comparaciones son entre strings 'YYYY-MM-DD': en ISO 8601 el orden
   * lexicográfico coincide con el cronológico, así que se compara día calendario
   * contra día calendario sin construir objetos Date ni arriesgar corrimientos.
   */
  private assertFechaEntradaValida(fecha: string, fechaSiembra: string): void {
    if (!esFechaDiaValida(fecha)) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_FECHA_ENTRADA_INVALIDA,
        message: `La fecha de entrada ${fecha} no existe en el calendario`,
        status: 422,
      });
    }

    const hoy = hoyISO();
    if (fecha > hoy) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_FECHA_ENTRADA_INVALIDA,
        message: `La fecha de entrada no puede ser posterior a hoy (${hoy})`,
        status: 422,
      });
    }

    if (fecha < fechaSiembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_FECHA_ENTRADA_INVALIDA,
        message: `La fecha de entrada no puede ser anterior a la fecha de siembra (${fechaSiembra})`,
        status: 422,
      });
    }
  }

  /**
   * Resuelve el valor a persistir en bandejas.fecha_entrada_nursery.
   *
   * - Sin fecha informada o fecha == hoy: now() de la base (comportamiento histórico).
   *   Usar el ancla de mediodía para "hoy" guardaría un instante futuro si el registro
   *   ocurre antes de las 12:00 UTC.
   * - Fecha pasada: mediodía UTC de ese día, que preserva el día calendario en cualquier
   *   huso entre UTC-11 y UTC+11 (el proyecto no maneja zonas horarias).
   */
  private resolveFechaEntradaNursery(
    fecha: string | undefined,
  ): Date | (() => string) {
    // El util devuelve null para "usar now()"; acá eso se expresa como la
    // función que TypeORM interpreta como SQL crudo dentro de un save().
    return resolveFechaDia(fecha) ?? (() => 'now()');
  }

  async ingresarNursery(
    id: string,
    dto?: IngresarNurseryDto,
  ): Promise<SiembraWithBandejas> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    // Antes de abrir la transacción: un rechazo no debe tocar la base.
    if (dto?.fecha_entrada) {
      this.assertFechaEntradaValida(dto.fecha_entrada, siembra.fecha);
    }

    const fechaEntrada = this.resolveFechaEntradaNursery(dto?.fecha_entrada);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await qr.manager
        .createQueryBuilder()
        .update(Bandeja)
        .set({
          estado: BandejaEstado.EN_NURSERY,
          fecha_entrada_nursery: fechaEntrada,
        })
        .where('siembra_id = :id', { id })
        .andWhere('estado = :estado', { estado: BandejaEstado.COOLING_PERIOD })
        .andWhere('tenant_id = :tenantId', { tenantId })
        .andWhere('deleted_at IS NULL')
        .execute();

      if (!result.affected) {
        throw new AppError({
          code: ErrorCodes.SIEMBRA_SIN_BANDEJAS_EN_COOLING,
          message: 'La siembra no tiene bandejas en cooling_period para ingresar a nursery',
          status: 422,
        });
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    return this.getSiembraWithBandejas(id);
  }

  async updateSiembra(id: string, dto: UpdateSiembraDto): Promise<Siembra> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    siembra.observaciones = dto.observaciones ?? null;
    return this.siembraRepo.save(siembra);
  }

  async deleteSiembra(id: string): Promise<void> {
    const tenantId = this.tenancy.requireTenantId();

    const siembra = await this.siembraRepo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!siembra) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_NOT_FOUND,
        message: 'Siembra no encontrada',
        status: 404,
      });
    }

    // El filtro por tenant es defensa en profundidad: la siembra ya se valido
    // contra el tenant arriba, asi que sus bandejas no pueden ser de otro. Va
    // igual porque un count que decide si se borra o no no deberia depender de
    // esa cadena de razonamiento (Principio II).
    const [trasplantadaCount, descartadaCount] = await Promise.all([
      this.bandejaRepo.count({
        where: {
          siembra_id: id,
          tenant_id: tenantId,
          estado: BandejaEstado.TRASPLANTADA,
        },
      }),
      this.bandejaRepo.count({
        where: {
          siembra_id: id,
          tenant_id: tenantId,
          estado: BandejaEstado.DESCARTADA,
        },
      }),
    ]);
    if (trasplantadaCount > 0) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_HAS_TRASPLANTADAS,
        message: 'No se puede eliminar una siembra con bandejas trasplantadas',
        status: 409,
      });
    }
    // Borrar la siembra le pondria deleted_at a sus bandejas y dejaria las
    // constancias de descarte apuntando a filas borradas. Una perdida es un
    // hecho registrado: no se va de la base junto con la siembra.
    if (descartadaCount > 0) {
      throw new AppError({
        code: ErrorCodes.SIEMBRA_HAS_DESCARTADAS,
        message: 'No se puede eliminar una siembra con bandejas descartadas',
        status: 409,
      });
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.manager.query(
        `UPDATE bandejas SET deleted_at = now() WHERE siembra_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [id, tenantId],
      );
      await qr.manager.softDelete(Siembra, id);
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
