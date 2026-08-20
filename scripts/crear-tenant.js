#!/usr/bin/env node
/**
 * Crea un tenant nuevo replicando la estructura de otro tenant existente:
 * usuario admin, establecimiento, tuneles y mesas.
 *
 * No copia filas: vuelve a crear todo por la API del backend, asi que el tenant
 * nuevo queda con ids y codigos QR propios. Eso es obligatorio, no una decision
 * de estilo: mesas.codigo_qr y bandejas.codigo son UNIQUE globales (no llevan
 * tenant_id adentro), asi que dos tenants no pueden compartir esos valores.
 *
 * Las mesas quedan sin posicion, que es la precondicion para trasplantar. El
 * contenido operativo (catalogos, lotes, siembras y trasplantes) lo carga
 * despues scripts/seed-init-trasplante.js apuntando al mismo TENANT_ID.
 *
 * Es idempotente: se puede volver a correr y solo crea lo que falta.
 *
 * Uso:
 *   API_URL=https://... \
 *   DATABASE_URL=postgresql://... \
 *   SOURCE_TENANT_ID=00000000-0000-0000-0000-000000000001 \
 *   TENANT_ID=00000000-0000-0000-0000-000000000002 \
 *   ADMIN_EMAIL=admin@tenantPruebas.com \
 *   ADMIN_PASSWORD='...' \
 *   node scripts/crear-tenant.js [--dry-run]
 */

const { Client } = require('pg');
const bcrypt = require('bcrypt');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
const SOURCE_TENANT_ID = process.env.SOURCE_TENANT_ID;
const TENANT_ID = process.env.TENANT_ID;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE ?? 'Admin';
const ADMIN_APELLIDO = process.env.ADMIN_APELLIDO ?? 'Pruebas';

const DRY_RUN = process.argv.includes('--dry-run');

// Los mismos roles que tiene hoy el admin del tenant de origen. Las filas de
// roles son globales (tenant_id NULL) y se comparten entre tenants por diseno,
// asi que no se duplican: el usuario nuevo se engancha a las que ya existen.
const ROLES = ['admin', 'admin_global'];

let token = null;

/** Igual que users.service.ts: el backend guarda y busca el email normalizado. */
const normalizarEmail = (v) => String(v).toLowerCase().trim();

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Request a la API con reintento ante 429. El backend tiene un throttler de 300
 * requests por minuto y este script hace ~740, asi que el reintento no es
 * defensivo de mas: es el caso esperado.
 */
async function api(method, path, body, intento = 0) {
  const headers = {
    'content-type': 'application/json',
    'x-tenant-id': TENANT_ID,
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (res.status === 429 && intento < 6) {
    const espera = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** intento;
    console.log(`    429, esperando ${Math.round(espera / 1000)}s...`);
    await dormir(espera);
    return api(method, path, body, intento + 1);
  }

  // El access token dura 15 minutos y la corrida completa puede pasarse de ahi.
  if (res.status === 401 && token && path !== '/auth/login' && intento < 2) {
    console.log('    token vencido, reautenticando...');
    await login();
    return api(method, path, body, intento + 1);
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no-JSON: se reporta el texto crudo */
  }
  if (!res.ok) {
    const detalle = json ? JSON.stringify(json) : text.slice(0, 400);
    throw new Error(`${method} ${path} -> ${res.status} ${detalle}`);
  }
  return json;
}

function unwrap(r) {
  return r && typeof r === 'object' && 'data' in r ? r.data : r;
}

async function login() {
  const r = unwrap(
    await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  );
  token = r.access_token || r.accessToken || r.token;
  if (!token) throw new Error(`Login sin token: ${JSON.stringify(r).slice(0, 300)}`);
}

/**
 * Crea el primer usuario del tenant. Va por SQL y no por la API porque es el
 * problema del huevo y la gallina: los endpoints de alta de usuarios crean en
 * el tenant del que llama, y todavia no hay nadie en el tenant nuevo. Replica
 * exactamente lo que hace UsersService.createUser (email normalizado, bcrypt
 * con cost 10, is_active true, roles por user_roles).
 */
async function crearAdmin(db) {
  const email = normalizarEmail(ADMIN_EMAIL);

  const { rows: existe } = await db.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL`,
    [TENANT_ID, email],
  );
  if (existe.length) {
    console.log(`  = usuario ${email} ya existe`);
    return existe[0].id;
  }

  const { rows: roles } = await db.query(
    `SELECT id, name FROM roles WHERE name = ANY($1) AND tenant_id IS NULL`,
    [ROLES],
  );
  if (roles.length !== ROLES.length) {
    const encontrados = roles.map((r) => r.name);
    throw new Error(
      `Faltan roles globales: ${ROLES.filter((r) => !encontrados.includes(r)).join(', ')}`,
    );
  }

  if (DRY_RUN) {
    console.log(`  + usuario ${email} (dry-run, no se crea)`);
    return null;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const { rows } = await db.query(
    `INSERT INTO users (tenant_id, email, password_hash, nombre, apellido, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
    [TENANT_ID, email, hash, ADMIN_NOMBRE, ADMIN_APELLIDO],
  );
  const userId = rows[0].id;

  for (const rol of roles) {
    await db.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, rol.id],
    );
  }

  console.log(`  + usuario ${email} creado con roles ${ROLES.join(' + ')}`);
  return userId;
}

/** Busca una fila del tenant destino por nombre y, si no esta, la crea por API. */
async function upsert(db, tabla, nombre, crear, extraWhere = '') {
  const { rows } = await db.query(
    `SELECT id FROM ${tabla}
      WHERE tenant_id = $1 AND nombre = $2 AND deleted_at IS NULL ${extraWhere}
      LIMIT 1`,
    [TENANT_ID, nombre],
  );
  if (rows.length) return { id: rows[0].id, creado: false };
  if (DRY_RUN) return { id: null, creado: true };
  const creado = unwrap(await crear());
  return { id: creado.id, creado: true };
}

async function main() {
  for (const [k, v] of Object.entries({
    API_URL, DATABASE_URL, SOURCE_TENANT_ID, TENANT_ID, ADMIN_EMAIL, ADMIN_PASSWORD,
  })) {
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
  }
  if (SOURCE_TENANT_ID === TENANT_ID) {
    throw new Error('SOURCE_TENANT_ID y TENANT_ID son el mismo. Abortado.');
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    if (DRY_RUN) console.log('*** DRY-RUN: no se escribe nada ***\n');
    console.log(`Origen : ${SOURCE_TENANT_ID}`);
    console.log(`Destino: ${TENANT_ID}\n`);

    // ── 0. Leer la estructura del tenant de origen ──────────────────────────
    const { rows: estOrigen } = await db.query(
      `SELECT nombre, ubicacion FROM establecimientos
        WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY nombre`,
      [SOURCE_TENANT_ID],
    );
    if (estOrigen.length !== 1) {
      throw new Error(
        `Se esperaba 1 establecimiento en el origen, hay ${estOrigen.length}. Abortado.`,
      );
    }

    const { rows: tunOrigen } = await db.query(
      `SELECT id, nombre, capacidad_maxima FROM tuneles
        WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY nombre`,
      [SOURCE_TENANT_ID],
    );

    const mesasOrigen = {};
    for (const t of tunOrigen) {
      // El mismo orden que usa el trasplante: define que mesa termina en que
      // posicion, y en el origen coincide con el numero del nombre.
      const { rows } = await db.query(
        `SELECT nombre FROM mesas
          WHERE tenant_id = $1 AND tunel_id = $2 AND deleted_at IS NULL
          ORDER BY created_at, codigo_qr`,
        [SOURCE_TENANT_ID, t.id],
      );
      mesasOrigen[t.nombre] = rows.map((r) => r.nombre);
    }
    const totalMesas = Object.values(mesasOrigen).reduce((a, m) => a + m.length, 0);
    console.log(
      `Estructura a replicar: 1 establecimiento, ${tunOrigen.length} tuneles, ${totalMesas} mesas\n`,
    );

    // ── 1. Usuario admin del tenant nuevo ───────────────────────────────────
    console.log('1) Usuario admin');
    await crearAdmin(db);

    if (DRY_RUN) {
      console.log('\n(dry-run) se crearian establecimiento, tuneles y mesas por API');
      return;
    }

    await login();
    console.log(`  autenticado como ${normalizarEmail(ADMIN_EMAIL)} en el tenant nuevo\n`);

    // ── 2. Establecimiento ──────────────────────────────────────────────────
    console.log('2) Establecimiento');
    const est = await upsert(db, 'establecimientos', estOrigen[0].nombre, () =>
      api('POST', '/establecimientos', {
        nombre: estOrigen[0].nombre,
        ...(estOrigen[0].ubicacion ? { ubicacion: estOrigen[0].ubicacion } : {}),
      }));
    console.log(`  ${est.creado ? '+' : '='} ${estOrigen[0].nombre} (${est.id})\n`);
    const establecimiento_id = est.id;

    // ── 3. Tuneles ──────────────────────────────────────────────────────────
    console.log('3) Tuneles');
    const tunelDestino = {};
    for (const t of tunOrigen) {
      const r = await upsert(db, 'tuneles', t.nombre, () =>
        api('POST', '/tuneles', {
          establecimiento_id,
          nombre: t.nombre,
          capacidad_maxima: t.capacidad_maxima,
        }));
      tunelDestino[t.nombre] = r.id;
      console.log(`  ${r.creado ? '+' : '='} ${t.nombre} (capacidad ${t.capacidad_maxima})`);
    }

    // ── 4. Mesas ────────────────────────────────────────────────────────────
    console.log('\n4) Mesas');
    let creadas = 0;
    for (const t of tunOrigen) {
      const tunel_id = tunelDestino[t.nombre];
      const nombres = mesasOrigen[t.nombre];

      const { rows: yaHay } = await db.query(
        `SELECT nombre FROM mesas WHERE tenant_id = $1 AND tunel_id = $2 AND deleted_at IS NULL`,
        [TENANT_ID, tunel_id],
      );
      const existentes = new Set(yaHay.map((r) => r.nombre));
      const pendientes = nombres.filter((n) => !existentes.has(n));

      if (!pendientes.length) {
        console.log(`  ${t.nombre}: ${nombres.length} mesas ya existen, se saltea`);
        continue;
      }
      console.log(`  ${t.nombre}: creando ${pendientes.length} mesas`);

      // Secuencial a proposito: createMesa calcula MAX(posicion_actual) + 1
      // dentro de su transaccion, y en paralelo dos altas del mismo tunel
      // chocarian contra el indice unico (tunel_id, posicion_actual).
      for (const nombre of pendientes) {
        await api('POST', '/mesas', { establecimiento_id, tunel_id, nombre });
        creadas++;
        if (creadas % 100 === 0) console.log(`    ${creadas}/${totalMesas}`);
      }
    }
    console.log(`  ${creadas} mesas creadas`);

    // ── 5. Dejar las mesas listas para trasplantar ──────────────────────────
    // createMesa asigna posicion al crear, pero trasplantar exige posicion NULL.
    // Solo se limpian las mesas que todavia no tienen ninguna actividad, asi
    // que volver a correr el script despues del trasplante no borra nada.
    console.log('\n5) Liberando posiciones');
    const { rowCount } = await db.query(
      `UPDATE mesas m SET posicion_actual = NULL, updated_at = now()
        WHERE m.tenant_id = $1
          AND m.posicion_actual IS NOT NULL
          AND m.estado = 'activa'
          AND NOT EXISTS (SELECT 1 FROM mesa_bandeja mb WHERE mb.mesa_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM historial_mesa h WHERE h.mesa_id = m.id)`,
      [TENANT_ID],
    );
    console.log(`  ${rowCount} mesas quedaron sin posicion, listas para trasplantar`);

    // ── 6. Resumen ──────────────────────────────────────────────────────────
    const { rows: resumen } = await db.query(
      `SELECT t.nombre AS tunel, count(*)::int AS mesas,
              count(m.posicion_actual)::int AS con_posicion
         FROM mesas m JOIN tuneles t ON t.id = m.tunel_id
        WHERE m.tenant_id = $1 AND m.deleted_at IS NULL
        GROUP BY t.nombre ORDER BY t.nombre`,
      [TENANT_ID],
    );
    console.log('\n6) Estado del tenant nuevo');
    console.table(resumen);
    console.log('Siguiente paso: scripts/seed-init-trasplante.js con TENANT_ID de este tenant.');
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
