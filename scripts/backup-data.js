// Backup de datos (no esquema) de la base Agrisano.
// El esquema se reproduce con las migraciones de TypeORM.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CONN = process.env.DUMP_URL;
const OUT_DIR = process.argv[2];

// Orden de inserción respetando FKs (padres primero).
const TABLES = [
  'migrations',
  'roles',
  'users',
  'user_roles',
  'refresh_tokens',
  'app_settings',
  'file_objects',
  'establecimientos',
  'usuario_establecimiento',
  'productos',
  'variedades',
  'marcas',
  'proveedores',
  'lotes',
  'tuneles',
  'mesas',
  'siembras',
  'bandejas',
  'mesa_bandeja',
  'historial_mesa',
  'principios_activos',
  'quimicos',
  'quimico_principio_activo',
  'lotes_quimicos',
  'aplicaciones_quimicas',
  'aplicaciones_quimicas_detalle',
  'aplicacion_quimica_mesa',
  'aplicacion_quimica_bandeja',
  'cosechas',
  'lotes_packing',
  'lotes_packing_categorias',
  'audit_logs',
];

function quoteLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

async function main() {
  if (!CONN || !OUT_DIR) throw new Error('Falta DUMP_URL o directorio de salida');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new Client({ connectionString: CONN });
  await client.connect();

  const sqlParts = [
    '-- Backup de datos Agrisano',
    `-- Generado: ${new Date().toISOString()}`,
    '-- Restaurar sobre un esquema ya migrado, dentro de una transaccion.',
    'BEGIN;',
    'SET session_replication_role = replica;  -- desactiva FKs durante la carga',
    '',
  ];
  const jsonDump = {};
  const summary = [];

  for (const table of TABLES) {
    const { rows, fields } = await client.query(`SELECT * FROM ${table}`);
    jsonDump[table] = rows;
    summary.push(`${table}: ${rows.length}`);
    sqlParts.push(`-- ${table} (${rows.length} filas)`);
    if (rows.length === 0) {
      sqlParts.push('');
      continue;
    }
    const cols = fields.map((f) => `"${f.name}"`).join(', ');
    for (const row of rows) {
      const vals = fields.map((f) => quoteLiteral(row[f.name])).join(', ');
      sqlParts.push(`INSERT INTO ${table} (${cols}) VALUES (${vals});`);
    }
    sqlParts.push('');
  }

  sqlParts.push('SET session_replication_role = DEFAULT;', 'COMMIT;');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sqlPath = path.join(OUT_DIR, `agrisano-backup-${stamp}.sql`);
  const jsonPath = path.join(OUT_DIR, `agrisano-backup-${stamp}.json`);
  fs.writeFileSync(sqlPath, sqlParts.join('\n'), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonDump, null, 2), 'utf8');

  await client.end();

  console.log(summary.join('\n'));
  console.log('\nSQL :', sqlPath, `(${(fs.statSync(sqlPath).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('JSON:', jsonPath, `(${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error('Backup fallo:', e.message);
  process.exit(1);
});
