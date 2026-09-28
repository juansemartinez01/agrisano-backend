/**
 * Carga inicial "INIT": deja las mesas posicionadas para que el mapa del
 * greenhouse las dibuje.
 *
 * El mapa del front solo pinta mesas con `estado = 'activa'` y
 * `posicion_actual IS NOT NULL`. Despues de un reset todas las mesas quedan sin
 * posicion, asi que el greenhouse aparece vacio. Este script ejecuta un
 * trasplante real (via API, no por SQL) de una bandeja por mesa, de modo que
 * cada mesa reciba su posicion.
 *
 * La posicion la asigna el backend como MAX(posicion_actual) + 1 por tunel. Como
 * el orden de `created_at` de las mesas coincide exactamente con el numero de su
 * nombre ("Table 1" .. "Table 122"), recorrerlas en ese orden hace que la
 * posicion termine siendo igual al numero del nombre. El script lo verifica en
 * cada paso y aborta si alguna no coincide.
 *
 * Es idempotente y se puede reanudar: reutiliza catalogos y lotes que ya
 * existan, y solo trasplanta mesas que sigan sin posicion.
 *
 * Uso:
 *   API_URL=https://... TENANT_ID=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   DATABASE_URL=postgres://... node scripts/seed-init-trasplante.js [--dry-run]
 *
 * Los nombres de catalogos y lotes se pueden pisar con INIT_PROVEEDOR,
 * INIT_MARCA, INIT_PRODUCTO, INIT_VARIEDAD, INIT_LOTE_SEMILLA,
 * INIT_LOTE_SUSTRATO e INIT_LOTE_VERMICULITA (ver NOMBRES mas abajo).
 *
 * Para deshacerlo: scripts/sql/rollback-init-trasplante.sql
 */
const { Client } = require('pg');

const API_URL = (process.env.API_URL || '').replace(/\/$/, '');
const TENANT_ID = process.env.TENANT_ID;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

const PREFIJO = process.env.INIT_PREFIJO || 'INIT';

// Los nombres se pueden pisar por entorno porque no son iguales en todos los
// tenants: el tenant de produccion quedo con la nomenclatura en ingles de la
// primera carga (INIT-SEED-001, "INIT - PRODUCT", ...) y el de pruebas con la
// castellana. El script busca los catalogos por nombre exacto, asi que apuntarlo
// a los nombres correctos es lo que hace que reutilice las filas ya existentes
// en vez de crear un segundo juego INIT duplicado.
const NOMBRES = {
  proveedor: process.env.INIT_PROVEEDOR || `${PREFIJO} - Proveedor inicial`,
  marca: process.env.INIT_MARCA || `${PREFIJO} - Marca inicial`,
  producto: process.env.INIT_PRODUCTO || `${PREFIJO} - Producto inicial`,
  variedad: process.env.INIT_VARIEDAD || `${PREFIJO} - Variedad inicial`,
  loteSemilla: process.env.INIT_LOTE_SEMILLA || `${PREFIJO}-SEMILLA-001`,
  loteSustrato: process.env.INIT_LOTE_SUSTRATO || `${PREFIJO}-SUSTRATO-001`,
  loteVermiculita: process.env.INIT_LOTE_VERMICULITA || `${PREFIJO}-VERMICULITA-001`,
};
const GRADO_VERMICULITA = 2; // el CHECK de la base exige 1..3
const OBS = `${PREFIJO} - carga de arranque para posicionar las mesas en el mapa`;

let token = null;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // El backend limita a 300 requests por minuto y esta corrida hace ~740.
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

/** Desenvuelve las respuestas del backend, que a veces vienen como { data: ... }. */
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
 * Busca una fila por nombre en la base y, si no existe, la crea por API.
 * Mantiene el script re-ejecutable sin duplicar catalogos.
 */
async function upsert(db, tabla, columna, valor, crear) {
  const { rows } = await db.query(
    `SELECT id FROM ${tabla}
      WHERE ${columna} = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [valor, TENANT_ID],
  );
  if (rows.length) {
    console.log(`  = ${tabla}: "${valor}" ya existe`);
    return rows[0].id;
  }
  if (DRY_RUN) {
    console.log(`  + ${tabla}: "${valor}" (dry-run, no se crea)`);
    return null;
  }
  const creado = unwrap(await crear());
  console.log(`  + ${tabla}: "${valor}" creado`);
  return creado.id;
}

/** Extrae el numero del nombre de la mesa: "Table 122" -> 122. */
function numeroDeMesa(nombre) {
  const n = Number(String(nombre).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  for (const [k, v] of Object.entries({
    API_URL, TENANT_ID, ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL,
  })) {
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    if (DRY_RUN) console.log('*** DRY-RUN: no se escribe nada ***\n');

    await login();
    console.log(`Autenticado como ${ADMIN_EMAIL}\n`);

    const { rows: ests } = await db.query(
      `SELECT id, nombre FROM establecimientos
        WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY nombre`,
      [TENANT_ID],
    );
    if (ests.length !== 1) {
      throw new Error(
        `Se esperaba 1 establecimiento en el tenant ${TENANT_ID}, hay ${ests.length}. Abortado.`,
      );
    }
    const establecimiento_id = ests[0].id;
    console.log(`Establecimiento: ${ests[0].nombre} (${establecimiento_id})\n`);

    // ── 1. Catalogos ────────────────────────────────────────────────────────
    console.log('1) Catalogos');
    const proveedor_id = await upsert(db, 'proveedores', 'nombre', NOMBRES.proveedor, () =>
      api('POST', '/proveedores', { establecimiento_id, nombre: NOMBRES.proveedor }));
    const marca_id = await upsert(db, 'marcas', 'nombre', NOMBRES.marca, () =>
      api('POST', '/marcas', { nombre: NOMBRES.marca }));
    const producto_id = await upsert(db, 'productos', 'nombre', NOMBRES.producto, () =>
      api('POST', '/productos', { nombre: NOMBRES.producto }));
    const variedad_id = await upsert(db, 'variedades', 'nombre', NOMBRES.variedad, () =>
      api('POST', '/variedades', { producto_id, nombre: NOMBRES.variedad }));

    // ── 2. Lotes ────────────────────────────────────────────────────────────
    console.log('\n2) Lotes');
    const lote_semilla_id = await upsert(db, 'lotes', 'numero_lote', NOMBRES.loteSemilla, () =>
      api('POST', '/lotes', {
        tipo: 'semilla',
        numero_lote: NOMBRES.loteSemilla,
        establecimiento_id,
        proveedor_id,
        marca_id,
        producto_id,
        variedad_id,
        proveedor_semilla_id: proveedor_id,
        observaciones: OBS,
      }));
    const lote_sustrato_id = await upsert(db, 'lotes', 'numero_lote', NOMBRES.loteSustrato, () =>
      api('POST', '/lotes', {
        tipo: 'sustrato',
        numero_lote: NOMBRES.loteSustrato,
        establecimiento_id,
        proveedor_id,
        marca_id,
        observaciones: OBS,
      }));
    const lote_vermiculita_id = await upsert(db, 'lotes', 'numero_lote', NOMBRES.loteVermiculita, () =>
      api('POST', '/lotes', {
        tipo: 'vermiculita',
        numero_lote: NOMBRES.loteVermiculita,
        establecimiento_id,
        proveedor_id,
        marca_id,
        grado: GRADO_VERMICULITA,
        observaciones: OBS,
      }));

    // ── 3. Tuneles ──────────────────────────────────────────────────────────
    const { rows: tuneles } = await db.query(
      `SELECT id, nombre FROM tuneles
        WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY nombre`,
      [TENANT_ID],
    );
    console.log(`\n3) Trasplantes (${tuneles.length} tuneles)`);

    let totalTrasplantes = 0;

    for (const tunel of tuneles) {
      // Las mesas se recorren por created_at porque ese orden coincide con el
      // numero del nombre, y el backend asigna MAX(posicion) + 1.
      const { rows: mesas } = await db.query(
        `SELECT id, nombre FROM mesas
          WHERE tunel_id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND activo = TRUE
            AND posicion_actual IS NULL AND estado = 'activa'
          ORDER BY created_at, codigo_qr`,
        [tunel.id, TENANT_ID],
      );

      if (!mesas.length) {
        console.log(`  ${tunel.nombre}: sin mesas pendientes, se saltea`);
        continue;
      }
      console.log(`  ${tunel.nombre}: ${mesas.length} mesas pendientes`);

      if (DRY_RUN) {
        console.log(`    (dry-run) se crearian ${mesas.length} bandejas y trasplantes`);
        continue;
      }

      // Bandejas libres ya sembradas con el lote INIT (permite reanudar una
      // corrida cortada sin volver a sembrar).
      const libres = async () => (await db.query(
        `SELECT id FROM bandejas
          WHERE lote_semilla_id = $1 AND tenant_id = $2 AND estado = 'en_nursery'
            AND mesa_id IS NULL AND deleted_at IS NULL
          ORDER BY created_at`,
        [lote_semilla_id, TENANT_ID],
      )).rows;

      let bandejas = await libres();
      const faltan = mesas.length - bandejas.length;

      if (faltan > 0) {
        const siembra = unwrap(await api('POST', '/siembras', {
          establecimiento_id,
          observaciones: `${OBS} — ${tunel.nombre}`,
          bandejas: [{
            lote_semilla_id,
            lote_sustrato_id,
            lote_vermiculita_id,
            cantidad: faltan,
          }],
        }));
        console.log(`    siembra ${siembra.id}: ${faltan} bandejas`);
        await api('POST', `/siembras/${siembra.id}/ingresar-nursery`, {});
        console.log('    bandejas ingresadas a nursery');
        bandejas = await libres();
      }

      if (bandejas.length < mesas.length) {
        throw new Error(
          `${tunel.nombre}: hacen falta ${mesas.length} bandejas y hay ${bandejas.length}`,
        );
      }

      for (let i = 0; i < mesas.length; i++) {
        const mesa = mesas[i];
        const r = unwrap(await api('POST', '/trasplante', {
          mesa_id: mesa.id,
          tunel_id: tunel.id,
          bandeja_ids: [bandejas[i].id],
          observaciones: OBS,
        }));

        const esperada = numeroDeMesa(mesa.nombre);
        if (esperada !== null && r.posicion_actual !== esperada) {
          throw new Error(
            `${tunel.nombre} / ${mesa.nombre}: se esperaba posicion ${esperada} y el backend asigno ${r.posicion_actual}. Abortado.`,
          );
        }
        totalTrasplantes++;
        if ((i + 1) % 25 === 0 || i === mesas.length - 1) {
          console.log(`    ${i + 1}/${mesas.length} (ultima: ${mesa.nombre} -> pos ${r.posicion_actual})`);
        }
      }
    }

    // ── 4. Verificacion ─────────────────────────────────────────────────────
    console.log(`\n4) Verificacion (${totalTrasplantes} trasplantes en esta corrida)`);
    const { rows: check } = await db.query(`
      SELECT t.nombre AS tunel,
             count(m.id)                                                      AS mesas,
             count(m.posicion_actual)                                         AS con_posicion,
             min(m.posicion_actual)                                           AS pos_min,
             max(m.posicion_actual)                                           AS pos_max,
             count(*) FILTER (
               WHERE m.posicion_actual IS DISTINCT FROM
                     (regexp_replace(m.nombre,'[^0-9]','','g'))::int
             )                                                                AS desalineadas
        FROM tuneles t
        JOIN mesas m ON m.tunel_id = t.id AND m.deleted_at IS NULL
       WHERE t.deleted_at IS NULL AND t.tenant_id = $1
       GROUP BY t.nombre ORDER BY t.nombre`, [TENANT_ID]);
    console.table(check);

    const desalineadas = check.reduce((a, r) => a + Number(r.desalineadas), 0);
    console.log(
      desalineadas === 0
        ? '\nOK: la posicion de cada mesa coincide con el numero de su nombre.'
        : `\nATENCION: ${desalineadas} mesas quedaron con posicion distinta a su nombre.`,
    );
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('\nFALLO:', e.message);
  process.exit(1);
});
