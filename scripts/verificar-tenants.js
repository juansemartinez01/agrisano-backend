#!/usr/bin/env node
/**
 * Verifica que el aislamiento multitenant funciona de verdad, y que el tenant
 * nuevo quedo con el mismo contenido que el de origen.
 *
 * Solo hace lecturas, salvo una prueba: intenta crear una mesa del tenant A
 * usando el token del tenant B. Si el aislamiento anda, el backend responde 404
 * y no se escribe nada. Si llegara a andar mal, queda una unica fila nueva con
 * nombre ISOLATION-TEST-* que el script borra y reporta como fuga.
 *
 * Uso:
 *   API_URL=https://... DATABASE_URL=postgresql://... \
 *   TENANT_A=... EMAIL_A=... PASS_A=... \
 *   TENANT_B=... EMAIL_B=... PASS_B=... \
 *   node scripts/verificar-tenants.js
 */

const { Client } = require('pg');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
const T = {
  A: { id: process.env.TENANT_A, email: process.env.EMAIL_A, pass: process.env.PASS_A },
  B: { id: process.env.TENANT_B, email: process.env.EMAIL_B, pass: process.env.PASS_B },
};

// Endpoints de listado que deberian estar acotados al tenant del token.
const LISTADOS = [
  ['establecimientos', '/establecimientos'],
  ['tuneles', '/tuneles'],
  ['mesas', '/mesas'],
  ['productos', '/productos'],
  ['variedades', '/variedades'],
  ['marcas', '/marcas'],
  ['proveedores', '/proveedores'],
  ['lotes', '/lotes'],
  ['siembras', '/siembras'],
  ['bandejas', '/bandejas'],
  // Los controllers de administracion, que son los que mas duele que filtren.
  ['admin/users', '/admin/users'],
  ['admin/audit-logs', '/admin/audit-logs'],
  ['admin/lotes', '/admin/lotes'],
  ['admin/tuneles', '/admin/tuneles'],
  ['admin/productos', '/admin/productos'],
  ['admin/variedades', '/admin/variedades'],
  ['admin/marcas', '/admin/marcas'],
  ['admin/proveedores', '/admin/proveedores'],
];

// Tablas que deberian tener el mismo contenido en los dos tenants.
const TABLAS_PARIDAD = [
  'establecimientos', 'tuneles', 'mesas', 'productos', 'variedades',
  'marcas', 'proveedores', 'lotes', 'siembras', 'bandejas', 'historial_mesa',
];

const resultados = [];
const anotar = (grupo, prueba, ok, detalle) => {
  resultados.push({ grupo, prueba, ok, detalle });
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${prueba}${detalle ? ` — ${detalle}` : ''}`);
};

async function req(method, path, { token, tenant, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (tenant) headers['x-tenant-id'] = tenant;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* respuesta vacia o no-JSON */ }
  return { status: res.status, body: json };
}

async function login(t) {
  const r = await req('POST', '/auth/login', {
    tenant: t.id,
    body: { email: t.email, password: t.pass },
  });
  const token = (r.body?.data ?? r.body)?.access_token;
  if (!token) throw new Error(`Login fallido para ${t.email}: ${r.status} ${JSON.stringify(r.body)}`);
  return token;
}

/**
 * Extrae el array de filas de una respuesta de listado.
 * La mayoria de los endpoints devuelven { ok, data, meta }, pero /admin/users y
 * /admin/audit-logs devuelven { page, limit, total, items }. Si se lee siempre
 * "data" esos dos dan un array vacio y la comprobacion pasa en vacio.
 */
function filasDeRespuesta(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  return null;
}

/** Trae todas las paginas de un listado. */
async function listarTodo(path, token, tenant) {
  const filas = [];
  for (let page = 1; ; page++) {
    const r = await req('GET', `${path}?page=${page}&limit=200`, { token, tenant });
    if (r.status !== 200) return { status: r.status, filas: null };
    const items = filasDeRespuesta(r.body);
    if (items === null) {
      return { status: 200, filas: null, shapeDesconocido: true };
    }
    filas.push(...items);
    const total = r.body?.meta?.total ?? r.body?.total ?? items.length;
    if (!items.length || filas.length >= total) break;
  }
  return { status: 200, filas };
}

async function main() {
  for (const [k, v] of Object.entries({ API_URL, DATABASE_URL })) {
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
  }
  for (const lado of ['A', 'B']) {
    for (const campo of ['id', 'email', 'pass']) {
      if (!T[lado][campo]) throw new Error(`Falta ${campo.toUpperCase()}_${lado}`);
    }
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    const tokenA = await login(T.A);
    const tokenB = await login(T.B);

    // ── 1. Aislamiento en la capa de autenticacion ─────────────────────────
    console.log('\n1) Autenticacion');
    {
      const r = await req('POST', '/auth/login', {
        tenant: '11111111-2222-3333-4444-555555555555',
        body: { email: T.A.email, password: T.A.pass },
      });
      anotar('auth', 'login con un tenant que no existe se rechaza', r.status === 401, `HTTP ${r.status}`);
    }
    {
      const r = await req('POST', '/auth/login', { body: { email: T.A.email, password: T.A.pass } });
      anotar('auth', 'login sin header de tenant se rechaza', r.status >= 400, `HTTP ${r.status}`);
    }
    {
      const r = await req('GET', '/tuneles', { token: tokenA, tenant: T.B.id });
      anotar('auth', 'token del tenant A con header del tenant B se rechaza',
        r.status === 401, `HTTP ${r.status} ${r.body?.error?.message ?? ''}`);
    }
    {
      const r = await req('GET', '/tuneles', { token: tokenB, tenant: T.A.id });
      anotar('auth', 'token del tenant B con header del tenant A se rechaza',
        r.status === 401, `HTTP ${r.status} ${r.body?.error?.message ?? ''}`);
    }
    {
      const r = await req('GET', '/tuneles', { token: tokenA });
      anotar('auth', 'token valido sin header de tenant se rechaza', r.status >= 400, `HTTP ${r.status}`);
    }
    {
      const r = await req('POST', '/auth/login', {
        tenant: T.B.id, body: { email: T.A.email, password: T.A.pass },
      });
      anotar('auth', 'el usuario del tenant A no puede loguearse en el tenant B',
        r.status === 401, `HTTP ${r.status}`);
    }

    // ── 2. Ningun listado devuelve filas del otro tenant ────────────────────
    console.log('\n2) Listados: cada tenant ve solo lo suyo');
    const idsPorTenant = {};
    for (const lado of ['A', 'B']) {
      const { rows } = await db.query(
        `SELECT 'mesas' t, id FROM mesas WHERE tenant_id = $1
         UNION ALL SELECT 'tuneles', id FROM tuneles WHERE tenant_id = $1
         UNION ALL SELECT 'establecimientos', id FROM establecimientos WHERE tenant_id = $1
         UNION ALL SELECT 'lotes', id FROM lotes WHERE tenant_id = $1
         UNION ALL SELECT 'bandejas', id FROM bandejas WHERE tenant_id = $1
         UNION ALL SELECT 'siembras', id FROM siembras WHERE tenant_id = $1
         UNION ALL SELECT 'productos', id FROM productos WHERE tenant_id = $1
         UNION ALL SELECT 'variedades', id FROM variedades WHERE tenant_id = $1
         UNION ALL SELECT 'marcas', id FROM marcas WHERE tenant_id = $1
         UNION ALL SELECT 'proveedores', id FROM proveedores WHERE tenant_id = $1
         UNION ALL SELECT 'users', id FROM users WHERE tenant_id = $1
         UNION ALL SELECT 'audit_logs', id FROM audit_logs WHERE tenant_id = $1`,
        [T[lado].id],
      );
      idsPorTenant[lado] = new Set(rows.map((r) => r.id));
    }

    for (const [nombre, path] of LISTADOS) {
      for (const [lado, token] of [['A', tokenA], ['B', tokenB]]) {
        const otro = lado === 'A' ? 'B' : 'A';
        const { status, filas, shapeDesconocido } = await listarTodo(path, token, T[lado].id);
        if (status !== 200) {
          anotar('listados', `${path} (tenant ${lado})`, true, `HTTP ${status}, no aplica`);
          continue;
        }
        if (shapeDesconocido) {
          anotar('listados', `${path} desde el tenant ${lado}`, false,
            'la respuesta no trae ni "data" ni "items": no se puede verificar');
          continue;
        }
        const intrusas = filas.filter((f) => idsPorTenant[otro].has(f.id));
        // Un listado vacio pasa el filtro sin comprobar nada; se marca para que
        // no se lea como una verificacion real.
        const nota = filas.length === 0 ? ' — listado vacio, no prueba nada' : '';
        anotar('listados', `${path} desde el tenant ${lado}`, intrusas.length === 0,
          `${filas.length} filas, ${intrusas.length} del tenant ${otro}${nota}`);
      }
    }

    // ── 3. Acceso directo por id a un recurso del otro tenant ───────────────
    console.log('\n3) Acceso por id cruzado (deberia dar 404)');
    const porId = [
      ['mesas', '/mesas'], ['tuneles', '/tuneles'],
      ['establecimientos', '/establecimientos'], ['lotes', '/lotes'],
    ];
    for (const [tabla, base] of porId) {
      const { rows } = await db.query(
        `SELECT id FROM ${tabla} WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [T.A.id],
      );
      if (!rows.length) continue;
      const r = await req('GET', `${base}/${rows[0].id}`, { token: tokenB, tenant: T.B.id });
      anotar('por-id', `${base}/:id del tenant A con token del tenant B`,
        r.status === 404, `HTTP ${r.status}`);
    }
    {
      // El QR es UNIQUE global: la busqueda por QR tambien tiene que estar acotada.
      const { rows } = await db.query(
        `SELECT codigo_qr FROM mesas WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [T.A.id],
      );
      if (rows.length) {
        const r = await req('GET', `/mesas/qr/${rows[0].codigo_qr}`, { token: tokenB, tenant: T.B.id });
        anotar('por-id', 'QR de una mesa del tenant A con token del tenant B',
          r.status === 404, `HTTP ${r.status}`);
      }
    }

    // ── 4. Escritura cruzada ───────────────────────────────────────────────
    console.log('\n4) Escritura cruzada (deberia dar 404 y no crear nada)');
    {
      const { rows } = await db.query(
        `SELECT t.id tunel_id, t.establecimiento_id FROM tuneles t
          WHERE t.tenant_id = $1 AND t.deleted_at IS NULL LIMIT 1`,
        [T.A.id],
      );
      const marca = `ISOLATION-TEST-${Date.now()}`;
      const r = await req('POST', '/mesas', {
        token: tokenB,
        tenant: T.B.id,
        body: {
          establecimiento_id: rows[0].establecimiento_id,
          tunel_id: rows[0].tunel_id,
          nombre: marca,
        },
      });
      const { rows: creada } = await db.query(`SELECT id, tenant_id FROM mesas WHERE nombre = $1`, [marca]);
      if (creada.length) {
        await db.query(`DELETE FROM mesas WHERE nombre = $1`, [marca]);
        anotar('escritura', 'crear una mesa en el tunel del tenant A desde el tenant B', false,
          `FUGA: HTTP ${r.status}, se creo la fila y se borro`);
      } else {
        anotar('escritura', 'crear una mesa en el tunel del tenant A desde el tenant B',
          r.status >= 400, `HTTP ${r.status}, no se escribio nada`);
      }
    }

    // ── 5. Colisiones de UNIQUE globales ───────────────────────────────────
    console.log('\n5) Codigos unicos globales');
    {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM mesas a JOIN mesas b ON a.codigo_qr = b.codigo_qr
          WHERE a.tenant_id = $1 AND b.tenant_id = $2`, [T.A.id, T.B.id]);
      anotar('unicidad', 'ningun codigo_qr compartido entre tenants', rows[0].n === 0, `${rows[0].n} repetidos`);
    }
    {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM bandejas a JOIN bandejas b ON a.codigo = b.codigo
          WHERE a.tenant_id = $1 AND b.tenant_id = $2`, [T.A.id, T.B.id]);
      anotar('unicidad', 'ningun codigo de bandeja compartido entre tenants', rows[0].n === 0, `${rows[0].n} repetidos`);
    }

    // ── 6. Paridad de contenido ────────────────────────────────────────────
    console.log('\n6) Paridad de contenido entre los dos tenants');
    const paridad = [];
    for (const tabla of TABLAS_PARIDAD) {
      const { rows } = await db.query(
        `SELECT count(*) FILTER (WHERE tenant_id = $1)::int a,
                count(*) FILTER (WHERE tenant_id = $2)::int b
           FROM ${tabla} WHERE deleted_at IS NULL`,
        [T.A.id, T.B.id],
      ).catch(async () => db.query(
        `SELECT count(*) FILTER (WHERE tenant_id = $1)::int a,
                count(*) FILTER (WHERE tenant_id = $2)::int b FROM ${tabla}`,
        [T.A.id, T.B.id],
      ));
      paridad.push({ tabla, tenant_A: rows[0].a, tenant_B: rows[0].b, igual: rows[0].a === rows[0].b });
    }
    console.table(paridad);
    anotar('paridad', 'todas las tablas tienen la misma cantidad de filas',
      paridad.every((p) => p.igual),
      paridad.filter((p) => !p.igual).map((p) => p.tabla).join(', ') || 'sin diferencias');

    // Mesas: posicion alineada al nombre en el tenant nuevo.
    {
      const { rows } = await db.query(
        `SELECT count(*)::int total, count(posicion_actual)::int con_posicion,
                count(*) FILTER (WHERE posicion_actual IS DISTINCT FROM
                  (regexp_replace(nombre,'[^0-9]','','g'))::int)::int desalineadas
           FROM mesas WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [T.B.id],
      );
      const r = rows[0];
      anotar('paridad', 'en el tenant nuevo la posicion de cada mesa coincide con su nombre',
        r.desalineadas === 0 && r.con_posicion === r.total,
        `${r.con_posicion}/${r.total} posicionadas, ${r.desalineadas} desalineadas`);
    }

    // ── Resumen ────────────────────────────────────────────────────────────
    const fallas = resultados.filter((r) => !r.ok);
    console.log('\n' + '='.repeat(70));
    console.log(`${resultados.length - fallas.length}/${resultados.length} pruebas OK`);
    if (fallas.length) {
      console.log('\nFALLAS:');
      for (const f of fallas) console.log(`  [${f.grupo}] ${f.prueba} — ${f.detalle}`);
      process.exitCode = 1;
    } else {
      console.log('El aislamiento multitenant funciona y los dos tenants tienen el mismo contenido.');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
