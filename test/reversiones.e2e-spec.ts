import * as path from 'path';
import * as dotenv from 'dotenv';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { ErrorCodes } from 'src/common/errors/error-codes';
import type { ReversionResult } from 'src/modules/reversiones/reversiones.service';

// Este e2e ESCRIBE en la base: crea y borra sus propios datos (prefijo E2EREV-),
// pero igual se niega a correr si DATABASE_URL no es local. Se hace antes de
// levantar la app porque el arranque corre migraciones (migrationsRun: true).
process.env.LOG_LEVEL = process.env.E2E_LOG_LEVEL ?? 'silent';
process.env.THROTTLE_LIMIT = '100000';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
const DB_URL = process.env.DATABASE_URL ?? '';
const DB_ES_LOCAL = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);

const T1 = '00000000-0000-0000-0000-000000000001';
const T2 = '00000000-0000-0000-0000-000000000002';
const PREFIJO = 'E2EREV-';
const RUN = Date.now().toString(36);

interface Res {
  status: number;
  body: {
    ok: boolean;
    data?: ReversionResult;
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  };
}

// Lo que la reversion deja en audit_logs.payload.extra (solo lo que se verifica).
interface AuditExtra {
  motivo: string;
  evidencia: {
    trasplante: {
      historial: { tipo_evento: string };
      mesa_bandeja: unknown[];
    };
    cosecha: { cosecha: { id: string; posicion_al_momento: number } };
  };
}

interface Tunel {
  id: string;
  mesas: string[]; // en orden de posicion 1..n
}

const describeLocal = DB_ES_LOCAL ? describe : describe.skip;

describeLocal('Reversiones (e2e, base local)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tokenAdminGlobal: string;
  let seq = 0;
  const desde = new Date();

  let userId: string;
  let est: string;
  let siembra: string;
  let semilla: string;
  let sustrato: string;
  let producto: string;
  let variedad: string;

  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    await ds.query(sql, params);

  async function token(roles: string[], tenant = T1): Promise<string> {
    return app.get(JwtService, { strict: false }).signAsync(
      {
        sub: userId,
        email: 'e2e@reversiones.local',
        roles,
        tenant_id: tenant,
      },
      { secret: app.get(ConfigService).get<string>('JWT_ACCESS_SECRET') },
    );
  }

  function call(
    method: 'post' | 'get',
    url: string,
    body?: object,
    opts: { token?: string | null; tenant?: string } = {},
  ): Promise<Res> {
    const t = opts.token === undefined ? tokenAdminGlobal : opts.token;
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    let r = request(server)
      [method](url)
      .set('x-tenant-id', opts.tenant ?? T1);
    if (t) r = r.set('Authorization', `Bearer ${t}`);
    return r.send(body) as unknown as Promise<Res>;
  }

  const revertir = (
    tipo: 'trasplante' | 'cosecha' | 'cosecha-y-trasplante',
    mesaId: string,
    body: object = { motivo: 'Error de carga (e2e)' },
    opts?: { token?: string | null; tenant?: string },
  ) => call('post', `/mesas/${mesaId}/revertir-${tipo}`, body, opts);

  // ── Fixtures ────────────────────────────────────────────────────────────

  function nuevoTag(): string {
    return `${PREFIJO}${RUN}-${++seq}`;
  }

  /** Tunel con n mesas activas en posiciones 1..n, cada una con su carga INIT. */
  async function crearTunel(
    tag: string,
    sufijo: string,
    n: number,
  ): Promise<Tunel> {
    const [t] = await q<{ id: string }>(
      `INSERT INTO tuneles (tenant_id, establecimiento_id, nombre, capacidad_maxima)
       VALUES ($1, $2, $3, 500) RETURNING id`,
      [T1, est, `${tag}-${sufijo}`],
    );
    const mesas: string[] = [];
    for (let i = 0; i < n; i++) {
      const fecha = `2026-08-30 21:07:${String(53 + i).padStart(2, '0')}.493271+00`;
      const [m] = await q<{ id: string }>(
        `INSERT INTO mesas (tenant_id, establecimiento_id, tunel_id, codigo_qr, nombre,
                            posicion_actual, estado, fecha_ultimo_trasplante)
         VALUES ($1, $2, $3, $4, $5, $6, 'activa', $7::timestamptz) RETURNING id`,
        [
          T1,
          est,
          t.id,
          `${tag}-${sufijo}-m${i + 1}`,
          `${sufijo}${i + 1}`,
          i + 1,
          fecha,
        ],
      );
      mesas.push(m.id);
      const [b] = await q<{ id: string }>(
        `INSERT INTO bandejas (tenant_id, siembra_id, lote_semilla_id, lote_sustrato_id, estado,
                               mesa_id, fecha_trasplante, codigo, establecimiento_id, fecha_entrada_nursery)
         VALUES ($1, $2, $3, $4, 'trasplantada', $5, $6::timestamptz, $7, $8, $6::timestamptz) RETURNING id`,
        [
          T1,
          siembra,
          semilla,
          sustrato,
          m.id,
          fecha,
          `${tag}-${sufijo}-INIT-${i}`,
          est,
        ],
      );
      await q(
        `INSERT INTO mesa_bandeja (mesa_id, bandeja_id, fecha_trasplante, usuario_id)
         VALUES ($1, $2, $3::timestamptz, $4)`,
        [m.id, b.id, fecha, userId],
      );
      await q(
        `INSERT INTO historial_mesa (tenant_id, mesa_id, tipo_evento, fecha_hora, detalle, usuario_id)
         VALUES ($1, $2, 'trasplante', $3::timestamptz, $4::jsonb, $5)`,
        [T1, m.id, fecha, JSON.stringify({ observaciones: 'INIT' }), userId],
      );
    }
    return { id: t.id, mesas };
  }

  /** Mesa sin posicion, lista para recibir un trasplante. */
  async function crearMesaLibre(
    tag: string,
    tunelId: string,
    nombre: string,
    estado: 'activa' | 'en_cosecha',
  ): Promise<string> {
    const [m] = await q<{ id: string }>(
      `INSERT INTO mesas (tenant_id, establecimiento_id, tunel_id, codigo_qr, nombre, posicion_actual, estado)
       VALUES ($1, $2, $3, $4, $5, NULL, $6::mesa_estado) RETURNING id`,
      [T1, est, tunelId, `${tag}-${nombre}`, nombre, estado],
    );
    return m.id;
  }

  async function crearBandejas(tag: string, n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [b] = await q<{ id: string }>(
        `INSERT INTO bandejas (tenant_id, siembra_id, lote_semilla_id, lote_sustrato_id, estado,
                               codigo, establecimiento_id, fecha_entrada_nursery)
         VALUES ($1, $2, $3, $4, 'en_nursery', $5, $6, now() - interval '20 days') RETURNING id`,
        [T1, siembra, semilla, sustrato, `${tag}-NUR-${i}`, est],
      );
      ids.push(b.id);
    }
    return ids;
  }

  async function cosechar(mesaId: string): Promise<string> {
    const r = await call('post', '/cosecha', {
      mesa_id: mesaId,
      producto_id: producto,
      variedad_id: variedad,
      peso_kg: 2.5,
    });
    if (r.status !== 201)
      throw new Error(`POST /cosecha -> ${r.status} ${JSON.stringify(r.body)}`);
    const body = r.body as unknown as { data: { cosecha: { id: string } } };
    return body.data.cosecha.id;
  }

  async function trasplantar(
    mesaId: string,
    tunelId: string,
    bandejas: string[],
  ) {
    const r = await call('post', '/trasplante', {
      mesa_id: mesaId,
      tunel_id: tunelId,
      bandeja_ids: bandejas,
    });
    if (r.status !== 200)
      throw new Error(
        `POST /trasplante -> ${r.status} ${JSON.stringify(r.body)}`,
      );
  }

  /** Foto de todo lo que una reversion puede tocar, para los fixtures de un test. */
  async function snap(tag: string): Promise<string> {
    const like = `${tag}%`;
    const mesas = await q(
      `SELECT codigo_qr, estado::text AS estado, posicion_actual, tunel_id,
              fecha_ultimo_trasplante::text AS fut
         FROM mesas WHERE codigo_qr LIKE $1 AND deleted_at IS NULL ORDER BY codigo_qr`,
      [like],
    );
    const bandejas = await q(
      `SELECT codigo, estado::text AS estado, mesa_id, fecha_trasplante::text AS ft,
              fecha_entrada_nursery::text AS fen, deleted_at
         FROM bandejas WHERE codigo LIKE $1 ORDER BY codigo`,
      [like],
    );
    const vinculos = await q(
      `SELECT mb.mesa_id, mb.bandeja_id FROM mesa_bandeja mb
         JOIN mesas m ON m.id = mb.mesa_id WHERE m.codigo_qr LIKE $1 ORDER BY 1, 2`,
      [like],
    );
    const historial = await q(
      `SELECT h.mesa_id, h.tipo_evento::text AS tipo, h.detalle FROM historial_mesa h
         JOIN mesas m ON m.id = h.mesa_id WHERE m.codigo_qr LIKE $1
        ORDER BY h.mesa_id, h.fecha_hora, h.created_at`,
      [like],
    );
    const cosechas = await q(
      `SELECT c.mesa_id, c.tunel_id FROM cosechas c
         JOIN mesas m ON m.id = c.mesa_id WHERE m.codigo_qr LIKE $1 ORDER BY c.fecha_hora`,
      [like],
    );
    return JSON.stringify({ mesas, bandejas, vinculos, historial, cosechas });
  }

  async function auditorias(accion: string, mesaId: string) {
    return q<{ actor_email: string; payload: { extra: AuditExtra } }>(
      `SELECT actor_email, payload FROM audit_logs
        WHERE action = $1 AND payload->'extra'->'mesa'->>'id' = $2`,
      [accion, mesaId],
    );
  }

  async function limpiar(): Promise<void> {
    const like = `${PREFIJO}%`;
    const mesas = `(SELECT id FROM mesas WHERE codigo_qr LIKE $1)`;
    await q(
      `DELETE FROM lotes_packing WHERE cosecha_id IN (SELECT id FROM cosechas WHERE mesa_id IN ${mesas})`,
      [like],
    );
    await q(`DELETE FROM mesa_bandeja WHERE mesa_id IN ${mesas}`, [like]);
    await q(`DELETE FROM historial_mesa WHERE mesa_id IN ${mesas}`, [like]);
    await q(`DELETE FROM cosechas WHERE mesa_id IN ${mesas}`, [like]);
    await q(`DELETE FROM bandejas WHERE codigo LIKE $1`, [like]);
    await q(`DELETE FROM mesas WHERE codigo_qr LIKE $1`, [like]);
    await q(`DELETE FROM tuneles WHERE nombre LIKE $1`, [like]);
    await q(
      `DELETE FROM audit_logs
        WHERE tenant_id = $1 AND created_at >= $2
          AND action IN ('cosecha_registrada', 'trasplante_ejecutado',
                         'reversion_trasplante', 'reversion_cosecha', 'reversion_cosecha_y_trasplante')`,
      [T1, desde],
    );
  }

  // ── Ciclo de vida ───────────────────────────────────────────────────────

  beforeAll(async () => {
    // require y no import: AppModule lee el entorno al cargarse, y tiene que
    // hacerlo despues de las lineas de arriba que fijan DATABASE_URL y compania.
    const { AppModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    ds = app.get(DataSource);

    const [u] = await q<{ id: string }>(
      `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
        WHERE r.name = 'admin_global' AND u.tenant_id = $1 ORDER BY u.created_at LIMIT 1`,
      [T1],
    );
    userId = u.id;
    const [s] = await q<{ id: string; establecimiento_id: string }>(
      `SELECT id, establecimiento_id FROM siembras WHERE tenant_id = $1 LIMIT 1`,
      [T1],
    );
    siembra = s.id;
    est = s.establecimiento_id;
    semilla = (
      await q<{ id: string }>(
        `SELECT id FROM lotes WHERE tipo = 'semilla' AND tenant_id = $1 LIMIT 1`,
        [T1],
      )
    )[0].id;
    sustrato = (
      await q<{ id: string }>(
        `SELECT id FROM lotes WHERE tipo = 'sustrato' AND tenant_id = $1 LIMIT 1`,
        [T1],
      )
    )[0].id;
    const [pv] = await q<{ pid: string; vid: string }>(
      `SELECT p.id AS pid, v.id AS vid FROM productos p JOIN variedades v ON v.producto_id = p.id
        WHERE p.tenant_id = $1 LIMIT 1`,
      [T1],
    );
    producto = pv.pid;
    variedad = pv.vid;

    tokenAdminGlobal = await token(['admin_global']);
    await limpiar(); // restos de corridas anteriores que hayan fallado a mitad
  }, 180_000);

  afterAll(async () => {
    if (ds?.isInitialized) await limpiar();
    await app?.close();
  }, 60_000);

  // ── Casos ───────────────────────────────────────────────────────────────

  it('cosecha + trasplante: dry_run no cambia nada y la reversion real deja todo como estaba', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 4);
    const [b1, b2] = await crearBandejas(tag, 2);
    const [m1] = t.mesas;
    const s0 = await snap(tag);

    const cosechaId = await cosechar(m1);
    await trasplantar(m1, t.id, [b1, b2]);
    const s1 = await snap(tag);
    expect(s1).not.toBe(s0);

    // El trasplante nuevo deja grabado de donde venia la mesa.
    const [ev] = await q<{
      detalle: { estado_previo: Record<string, unknown> };
    }>(
      `SELECT detalle FROM historial_mesa WHERE mesa_id = $1 AND tipo_evento = 'trasplante'
        ORDER BY fecha_hora DESC LIMIT 1`,
      [m1],
    );
    expect(ev.detalle.estado_previo).toMatchObject({
      estado: 'en_cosecha',
      tunel_id: t.id,
      posicion_actual: null,
    });

    // Simulacion
    const dry = await revertir('cosecha-y-trasplante', m1, { dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({
      tipo: 'cosecha_y_trasplante',
      dry_run: true,
      aplicado: false,
    });
    expect(dry.body.data?.trasplante_revertido?.bandeja_ids.sort()).toEqual(
      [b1, b2].sort(),
    );
    expect(dry.body.data?.trasplante_revertido?.estado_previo_origen).toBe(
      'registrado',
    );
    expect(dry.body.data?.cosecha_revertida?.posicion_restaurada).toBe(1);
    expect(dry.body.data?.mesa.antes.posicion_actual).toBe(4);
    expect(dry.body.data?.mesa.despues.posicion_actual).toBe(1);
    expect(await snap(tag)).toBe(s1);
    expect(await auditorias('reversion_cosecha_y_trasplante', m1)).toHaveLength(
      0,
    );

    // Real
    const real = await revertir('cosecha-y-trasplante', m1);
    expect(real.status).toBe(200);
    expect(real.body.data).toMatchObject({ dry_run: false, aplicado: true });
    expect(await snap(tag)).toBe(s0);

    // Constancia con todo lo necesario para rehacerlo
    const aud = await auditorias('reversion_cosecha_y_trasplante', m1);
    expect(aud).toHaveLength(1);
    expect(aud[0].actor_email).toBe('e2e@reversiones.local');
    const extra = aud[0].payload.extra;
    expect(extra.motivo).toBe('Error de carga (e2e)');
    expect(extra.evidencia.trasplante.historial.tipo_evento).toBe('trasplante');
    expect(extra.evidencia.trasplante.mesa_bandeja).toHaveLength(2);
    expect(extra.evidencia.cosecha.cosecha.id).toBe(cosechaId);
    expect(extra.evidencia.cosecha.cosecha.posicion_al_momento).toBe(1);
  });

  it('por separado: primero el trasplante y despues la cosecha', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 4);
    const [b1] = await crearBandejas(tag, 1);
    const [m1] = t.mesas;
    const s0 = await snap(tag);

    await cosechar(m1);
    const trasCosecha = await snap(tag);
    await trasplantar(m1, t.id, [b1]);

    const r1 = await revertir('trasplante', m1);
    expect(r1.status).toBe(200);
    expect(r1.body.data?.cosecha_revertida).toBeNull();
    expect(r1.body.data?.mesa.despues).toMatchObject({
      estado: 'en_cosecha',
      posicion_actual: null,
    });
    expect(await snap(tag)).toBe(trasCosecha);

    const r2 = await revertir('cosecha', m1);
    expect(r2.status).toBe(200);
    expect(r2.body.data?.trasplante_revertido).toBeNull();
    expect(r2.body.data?.cosecha_revertida?.posicion_restaurada).toBe(1);
    expect(await snap(tag)).toBe(s0);

    expect(await auditorias('reversion_trasplante', m1)).toHaveLength(1);
    expect(await auditorias('reversion_cosecha', m1)).toHaveLength(1);
  });

  it('trasplante a otro tunel: la mesa vuelve a su tunel y posicion originales', async () => {
    const tag = nuevoTag();
    const x = await crearTunel(tag, 'X', 3);
    const y = await crearTunel(tag, 'Y', 2);
    const [b1] = await crearBandejas(tag, 1);
    const s0 = await snap(tag);

    await cosechar(x.mesas[0]);
    await trasplantar(x.mesas[0], y.id, [b1]);
    const r = await revertir('cosecha-y-trasplante', x.mesas[0]);
    expect(r.status).toBe(200);
    expect(r.body.data?.tuneles.map((n) => n.id).sort()).toEqual(
      [x.id, y.id].sort(),
    );
    expect(await snap(tag)).toBe(s0);
  });

  it('trasplante a otro tunel: si en el tunel original aparecio una mesa con el mismo nombre, rechaza', async () => {
    const tag = nuevoTag();
    const x = await crearTunel(tag, 'X', 3);
    const y = await crearTunel(tag, 'Y', 2);
    const [b1] = await crearBandejas(tag, 1);

    await cosechar(x.mesas[0]);
    await trasplantar(x.mesas[0], y.id, [b1]);
    await crearMesaLibre(tag, x.id, 'X1', 'activa'); // mismo nombre que la mesa original
    const s = await snap(tag);

    const r = await revertir('cosecha-y-trasplante', x.mesas[0]);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe(ErrorCodes.REVERSION_DATOS_INCONSISTENTES);
    expect(await snap(tag)).toBe(s);
  });

  it('cosecha: rechaza si despues se cosecho otra mesa del tunel y permite deshacer en orden inverso', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 4);
    const [m1, m2] = t.mesas;
    const s0 = await snap(tag);

    await cosechar(m1);
    await cosechar(m2); // m2 estaba en 2, tras la cosecha de m1 paso a 1
    const s2 = await snap(tag);

    const malo = await revertir('cosecha', m1);
    expect(malo.status).toBe(409);
    expect(malo.body.error?.code).toBe(
      ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
    );
    expect(await snap(tag)).toBe(s2);

    expect((await revertir('cosecha', m2)).status).toBe(200);
    expect((await revertir('cosecha', m1)).status).toBe(200);
    expect(await snap(tag)).toBe(s0);
  });

  it('trasplante: rechaza si despues entro otra mesa al tunel y permite deshacer en orden inverso', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 4);
    const libre = await crearMesaLibre(tag, t.id, 'libre', 'en_cosecha');
    const [b1, b2] = await crearBandejas(tag, 2);
    const [m1] = t.mesas;

    await cosechar(m1);
    const trasCosecha = await snap(tag);
    await trasplantar(m1, t.id, [b1]);
    await trasplantar(libre, t.id, [b2]);
    const s2 = await snap(tag);

    const malo = await revertir('trasplante', m1);
    expect(malo.status).toBe(409);
    expect(malo.body.error?.code).toBe(
      ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
    );
    expect(await snap(tag)).toBe(s2);

    expect((await revertir('trasplante', libre)).status).toBe(200);
    expect((await revertir('trasplante', m1)).status).toBe(200);
    // la mesa libre vuelve a no tener posicion ni bandejas; m1 a estar cosechada
    const s3 = JSON.parse(await snap(tag)) as {
      mesas: Array<{
        codigo_qr: string;
        estado: string;
        posicion_actual: number | null;
      }>;
    };
    expect(s3.mesas.find((m) => m.codigo_qr.endsWith('-libre'))).toMatchObject({
      estado: 'en_cosecha',
      posicion_actual: null,
    });
    const ref = JSON.parse(trasCosecha) as { mesas: unknown[] };
    expect(s3.mesas.filter((m) => !m.codigo_qr.endsWith('-libre'))).toEqual(
      (ref.mesas as typeof s3.mesas).filter(
        (m) => !m.codigo_qr.endsWith('-libre'),
      ),
    );
  });

  it('rechaza si la mesa tuvo otro evento despues del trasplante', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 3);
    const [b1] = await crearBandejas(tag, 1);
    const [m1] = t.mesas;

    await cosechar(m1);
    await trasplantar(m1, t.id, [b1]);
    await q(
      `INSERT INTO historial_mesa (tenant_id, mesa_id, tipo_evento, fecha_hora, detalle, usuario_id)
       VALUES ($1, $2, 'aplicacion_quimica', now(), '{}'::jsonb, $3)`,
      [T1, m1, userId],
    );
    const s = await snap(tag);

    for (const tipo of ['trasplante', 'cosecha-y-trasplante'] as const) {
      const r = await revertir(tipo, m1);
      expect(r.status).toBe(409);
      expect(r.body.error?.code).toBe(
        ErrorCodes.REVERSION_NO_ES_ULTIMA_OPERACION,
      );
    }
    expect(await snap(tag)).toBe(s);
  });

  it('cosecha con lote de packing: no se puede deshacer', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 3);
    const [m1] = t.mesas;
    const cosechaId = await cosechar(m1);
    await q(
      `INSERT INTO lotes_packing (tenant_id, cosecha_id, peso_bruto_kg, usuario_id)
       VALUES ($1, $2, 2.5, $3)`,
      [T1, cosechaId, userId],
    );
    const s = await snap(tag);

    const r = await revertir('cosecha', m1);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe(ErrorCodes.REVERSION_NO_APLICA);
    expect(await snap(tag)).toBe(s);
  });

  it('bandeja modificada despues del trasplante: rechaza sin tocar nada', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 3);
    const [b1, b2] = await crearBandejas(tag, 2);
    const [m1] = t.mesas;

    await cosechar(m1);
    await trasplantar(m1, t.id, [b1, b2]);
    await q(`UPDATE bandejas SET estado = 'descartada' WHERE id = $1`, [b1]);
    const s = await snap(tag);

    const r = await revertir('trasplante', m1);
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe(ErrorCodes.REVERSION_DATOS_INCONSISTENTES);
    expect(JSON.stringify(r.body.error?.details)).toContain(b1);
    expect(await snap(tag)).toBe(s);
  });

  describe('trasplantes anteriores al registro del estado previo', () => {
    async function quitarEstadoPrevio(mesaId: string) {
      await q(
        `UPDATE historial_mesa SET detalle = detalle - 'estado_previo'
          WHERE mesa_id = $1 AND tipo_evento = 'trasplante' AND detalle ? 'estado_previo'`,
        [mesaId],
      );
    }

    it('se infiere de la cosecha previa', async () => {
      const tag = nuevoTag();
      const t = await crearTunel(tag, 'A', 4);
      const [b1] = await crearBandejas(tag, 1);
      const [m1] = t.mesas;

      await cosechar(m1);
      const trasCosecha = await snap(tag);
      await trasplantar(m1, t.id, [b1]);
      await quitarEstadoPrevio(m1);

      const r = await revertir('trasplante', m1);
      expect(r.status).toBe(200);
      expect(r.body.data?.trasplante_revertido?.estado_previo_origen).toBe(
        'inferido',
      );
      // incluida la fecha_ultimo_trasplante, recuperada de las bandejas del ciclo anterior
      expect(await snap(tag)).toBe(trasCosecha);
    });

    it('sin cosecha previa no se adivina', async () => {
      const tag = nuevoTag();
      const t = await crearTunel(tag, 'A', 2);
      const libre = await crearMesaLibre(tag, t.id, 'libre', 'activa');
      const [b1] = await crearBandejas(tag, 1);
      await trasplantar(libre, t.id, [b1]);
      await quitarEstadoPrevio(libre);
      const s = await snap(tag);

      const r = await revertir('trasplante', libre);
      expect(r.status).toBe(409);
      expect(r.body.error?.code).toBe(
        ErrorCodes.REVERSION_ESTADO_PREVIO_NO_RECUPERABLE,
      );
      expect(await snap(tag)).toBe(s);
    });
  });

  it('mesa activa sin posicion (nunca cosechada): con estado previo registrado vuelve a como estaba', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 2);
    const libre = await crearMesaLibre(tag, t.id, 'libre', 'activa');
    const [b1] = await crearBandejas(tag, 1);
    const s0 = await snap(tag);

    await trasplantar(libre, t.id, [b1]);
    // combinado no aplica: antes no estaba en cosecha
    const comb = await revertir('cosecha-y-trasplante', libre);
    expect(comb.status).toBe(409);
    expect(comb.body.error?.code).toBe(ErrorCodes.REVERSION_NO_APLICA);

    const r = await revertir('trasplante', libre);
    expect(r.status).toBe(200);
    expect(await snap(tag)).toBe(s0);
  });

  it('rechaza operaciones que no corresponden al estado de la mesa', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 3);
    const [m1, m2] = t.mesas;
    await cosechar(m1);
    const s = await snap(tag);

    // m2 solo tiene la carga INIT (sin bandejas): no hay trasplante que deshacer
    const a = await revertir('trasplante', m2);
    expect([a.status, a.body.error?.code]).toEqual([
      409,
      ErrorCodes.REVERSION_NO_APLICA,
    ]);
    // m2 esta activa: no hay cosecha que deshacer
    const b = await revertir('cosecha', m2);
    expect([b.status, b.body.error?.code]).toEqual([
      409,
      ErrorCodes.REVERSION_NO_APLICA,
    ]);
    // m1 esta en cosecha: no hay trasplante que deshacer
    const c = await revertir('trasplante', m1);
    expect([c.status, c.body.error?.code]).toEqual([
      409,
      ErrorCodes.REVERSION_NO_APLICA,
    ]);
    expect(await snap(tag)).toBe(s);
  });

  it('dos reversiones simultaneas de la misma mesa: gana una y la otra se rechaza', async () => {
    const tag = nuevoTag();
    const t = await crearTunel(tag, 'A', 4);
    const [b1] = await crearBandejas(tag, 1);
    const [m1] = t.mesas;
    const s0 = await snap(tag);
    await cosechar(m1);
    await trasplantar(m1, t.id, [b1]);

    const [r1, r2] = await Promise.all([
      revertir('cosecha-y-trasplante', m1),
      revertir('cosecha-y-trasplante', m1),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const perdedora = r1.status === 409 ? r1 : r2;
    expect(perdedora.body.error?.code).toMatch(/^REVERSION_/);
    expect(await snap(tag)).toBe(s0);
    expect(await auditorias('reversion_cosecha_y_trasplante', m1)).toHaveLength(
      1,
    );
  });

  describe('validacion y permisos', () => {
    let mesaId: string;
    let tag: string;
    let s: string;

    beforeAll(async () => {
      tag = nuevoTag();
      const t = await crearTunel(tag, 'A', 2);
      mesaId = t.mesas[0];
      await cosechar(mesaId);
      s = await snap(tag);
    });

    it('sin token: 401', async () => {
      expect(
        (await revertir('cosecha', mesaId, undefined, { token: null })).status,
      ).toBe(401);
    });

    it.each(['admin', 'supervisor', 'operario'])('rol %s: 403', async (rol) => {
      const tk = await token([rol]);
      for (const tipo of [
        'trasplante',
        'cosecha',
        'cosecha-y-trasplante',
      ] as const) {
        expect(
          (await revertir(tipo, mesaId, undefined, { token: tk })).status,
        ).toBe(403);
      }
      expect(await snap(tag)).toBe(s);
    });

    it('mesa inexistente o de otro tenant: 404', async () => {
      const r = await revertir('cosecha', randomUUID());
      expect(r.status).toBe(404);
      expect(r.body.error?.code).toBe(ErrorCodes.MESA_NOT_FOUND);

      const otro = await revertir('cosecha', mesaId, undefined, {
        token: await token(['admin_global'], T2),
        tenant: T2,
      });
      expect(otro.status).toBe(404);
      expect(await snap(tag)).toBe(s);
    });

    it('body invalido: 400', async () => {
      expect(
        (
          await call('post', '/mesas/no-es-uuid/revertir-cosecha', {
            motivo: 'abcdef',
          })
        ).status,
      ).toBe(400);
      expect((await revertir('cosecha', mesaId, {})).status).toBe(400); // falta motivo
      expect(
        (await revertir('cosecha', mesaId, { motivo: 'abc' })).status,
      ).toBe(400); // muy corto
      expect(
        (await revertir('cosecha', mesaId, { motivo: 'x'.repeat(501) })).status,
      ).toBe(400);
      expect(
        (await revertir('cosecha', mesaId, { motivo: 'abcdef', otro: 1 }))
          .status,
      ).toBe(400);
      expect(await snap(tag)).toBe(s);
    });

    it('dry_run no exige motivo', async () => {
      const r = await revertir('cosecha', mesaId, { dry_run: true });
      expect(r.status).toBe(200);
      expect(r.body.data?.aplicado).toBe(false);
      expect(await snap(tag)).toBe(s);
    });
  });
});
