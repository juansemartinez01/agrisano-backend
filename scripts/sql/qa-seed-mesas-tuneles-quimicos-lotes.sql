-- ============================================================================
-- QA seed dump — Agrisano
-- ============================================================================
-- Genera un volumen grande de datos de prueba para testing manual end-to-end:
--   - 20 tuneles ("QA Tunel 01".."QA Tunel 20")
--   - 150 mesas por tunel (3000 mesas en total), activas, posicion 1..150
--   - 5 productos + 10 variedades de apoyo (para lotes de semilla)
--   - 3 proveedores + 2 marcas de apoyo
--   - 10 quimicos (mezcla de kg/L y mL/L, con y sin carencia)
--   - 20 lotes de quimico (2 por quimico, stock inicial completo)
--   - 40 lotes de semilla + 15 lotes de sustrato
--
-- Todo el dataset queda prefijado con "QA " o "QA-" para poder ubicarlo e
-- identificarlo facilmente (y borrarlo) sin tocar datos reales.
--
-- CÓMO CORRERLO
--   psql "$DATABASE_URL" -f scripts/sql/qa-seed-mesas-tuneles-quimicos-lotes.sql
--   (o pegarlo en la consola SQL de Railway / tu cliente de Postgres)
--
-- SUPUESTOS
--   - Tenant fijo: 00000000-0000-0000-0000-000000000001 (el unico tenant activo,
--     tomado de SEED_TENANT_ID en .env.local/.env.example).
--   - Existe un establecimiento llamado exactamente 'Agrisano' para ese tenant.
--     Si tu establecimiento se llama distinto, cambia el valor 'Agrisano' en la
--     seccion 0 antes de correr.
--
-- IDEMPOTENCIA
--   - Catalogos (productos/variedades/proveedores/marcas/tuneles/quimicos) usan
--     NOT EXISTS por nombre: correr el script dos veces NO los duplica.
--   - Mesas: solo se insertan para los tuneles QA que todavia no tengan ninguna
--     mesa cargada (asi que tampoco duplica en una segunda corrida).
--   - Lotes (quimico/semilla/sustrato): usan NOT EXISTS por numero_lote, tampoco
--     duplican en una segunda corrida.
--
-- Todo corre dentro de una sola transaccion: si algo falla, no queda nada a
-- medio insertar.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Constantes (ajustar aca si hace falta)
-- ---------------------------------------------------------------------------
-- tenant_id: '00000000-0000-0000-0000-000000000001'
-- establecimiento: 'Agrisano'

-- ---------------------------------------------------------------------------
-- 1. Catalogos de apoyo: productos + variedades (para lotes de semilla)
-- ---------------------------------------------------------------------------
INSERT INTO productos (id, tenant_id, nombre, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', d.nombre, true
FROM (VALUES
  ('QA Tomate'), ('QA Pepino'), ('QA Zapallito'), ('QA Rucula'), ('QA Albahaca')
) AS d(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM productos p
  WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND p.nombre = d.nombre AND p.deleted_at IS NULL
);

INSERT INTO variedades (id, tenant_id, producto_id, nombre, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', p.id, d.variedad, true
FROM (VALUES
  ('QA Tomate',    'QA Cherry'),
  ('QA Tomate',    'QA Perita'),
  ('QA Pepino',    'QA Comun'),
  ('QA Pepino',    'QA Armenio'),
  ('QA Zapallito', 'QA Redondo'),
  ('QA Zapallito', 'QA Alargado'),
  ('QA Rucula',    'QA Comun'),
  ('QA Rucula',    'QA Silvestre'),
  ('QA Albahaca',  'QA Genovesa'),
  ('QA Albahaca',  'QA Napolitana')
) AS d(producto, variedad)
JOIN productos p
  ON p.tenant_id = '00000000-0000-0000-0000-000000000001' AND p.nombre = d.producto
WHERE NOT EXISTS (
  SELECT 1 FROM variedades v
  WHERE v.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND v.producto_id = p.id AND v.nombre = d.variedad AND v.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 2. Catalogos de apoyo: proveedores + marcas
-- ---------------------------------------------------------------------------
INSERT INTO proveedores (id, tenant_id, establecimiento_id, nombre, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', est.id, d.nombre, true
FROM (VALUES ('QA Proveedor Norte'), ('QA Proveedor Sur'), ('QA Proveedor Import')) AS d(nombre)
CROSS JOIN (
  SELECT id FROM establecimientos
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre = 'Agrisano'
  LIMIT 1
) AS est
WHERE NOT EXISTS (
  SELECT 1 FROM proveedores pr
  WHERE pr.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND pr.establecimiento_id = est.id AND pr.nombre = d.nombre AND pr.deleted_at IS NULL
);

INSERT INTO marcas (id, tenant_id, nombre, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', d.nombre, true
FROM (VALUES ('QA Marca Alfa'), ('QA Marca Beta')) AS d(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM marcas m
  WHERE m.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND m.nombre = d.nombre AND m.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 3. Tuneles (20) — capacidad_maxima=200 para dejar margen sobre las 150 mesas
-- ---------------------------------------------------------------------------
INSERT INTO tuneles (id, tenant_id, establecimiento_id, nombre, capacidad_maxima, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', est.id,
       'QA Tunel ' || lpad(n::text, 2, '0'), 200, true
FROM generate_series(1, 20) AS n
CROSS JOIN (
  SELECT id FROM establecimientos
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre = 'Agrisano'
  LIMIT 1
) AS est
WHERE NOT EXISTS (
  SELECT 1 FROM tuneles t
  WHERE t.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND t.establecimiento_id = est.id
    AND t.nombre = 'QA Tunel ' || lpad(n::text, 2, '0')
    AND t.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 4. Mesas (150 por tunel QA = 3000) — solo para tuneles QA sin mesas todavia
-- ---------------------------------------------------------------------------
INSERT INTO mesas (
  id, tenant_id, establecimiento_id, tunel_id, codigo_qr,
  posicion_actual, estado, plantas_estimadas, activo
)
SELECT
  gen_random_uuid(), '00000000-0000-0000-0000-000000000001', t.establecimiento_id, t.id,
  gen_random_uuid()::text, pos, 'activa', 450, true
FROM tuneles t
CROSS JOIN generate_series(1, 150) AS pos
WHERE t.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND t.nombre LIKE 'QA Tunel %'
  AND t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM mesas m WHERE m.tunel_id = t.id);

-- ---------------------------------------------------------------------------
-- 5. Quimicos (10) — mitad stockeados en kg (rate g/L o kg/L), mitad en L
--    (rate mL/L o L/L). Mezcla de withholding_period_dias (incluye NULL/0).
-- ---------------------------------------------------------------------------
INSERT INTO quimicos (
  id, tenant_id, establecimiento_id, nombre, unidad_medida, rate_unidad,
  withholding_period_dias, marca_id, activo
)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', est.id,
       d.nombre, d.unidad_medida::quimico_unidad_medida, d.rate_unidad::quimico_rate_unidad,
       d.withholding, mc.id, true
FROM (VALUES
  ('QA Quimico 01', 'kg', 'g/L',  3,    'QA Marca Alfa'),
  ('QA Quimico 02', 'kg', 'kg/L', NULL, 'QA Marca Alfa'),
  ('QA Quimico 03', 'kg', 'g/L',  7,    NULL),
  ('QA Quimico 04', 'kg', 'g/L',  1,    'QA Marca Beta'),
  ('QA Quimico 05', 'kg', 'kg/L', 14,   NULL),
  ('QA Quimico 06', 'l',  'mL/L', 5,    'QA Marca Beta'),
  ('QA Quimico 07', 'l',  'L/L',  NULL, NULL),
  ('QA Quimico 08', 'l',  'mL/L', 10,   'QA Marca Alfa'),
  ('QA Quimico 09', 'l',  'mL/L', 2,    NULL),
  ('QA Quimico 10', 'l',  'L/L',  4,    'QA Marca Beta')
) AS d(nombre, unidad_medida, rate_unidad, withholding, marca_nombre)
CROSS JOIN (
  SELECT id FROM establecimientos
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre = 'Agrisano'
  LIMIT 1
) AS est
LEFT JOIN marcas mc
  ON mc.tenant_id = '00000000-0000-0000-0000-000000000001' AND mc.nombre = d.marca_nombre
WHERE NOT EXISTS (
  SELECT 1 FROM quimicos q
  WHERE q.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND q.establecimiento_id = est.id AND q.nombre = d.nombre AND q.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 6. Lotes de quimico (2 por quimico QA = 20) — stock inicial completo
-- ---------------------------------------------------------------------------
INSERT INTO lotes_quimicos (
  id, tenant_id, quimico_id, establecimiento_id, proveedor_id,
  numero_lote, cantidad_inicial, cantidad_actual, dom, fecha_vencimiento
)
SELECT
  gen_random_uuid(), '00000000-0000-0000-0000-000000000001', q.id, q.establecimiento_id, pv.id,
  'QA-QUI-' || right(q.nombre, 2) || '-' || d.sufijo,
  d.cantidad, d.cantidad,
  (now() - (d.dom_dias || ' days')::interval)::date,
  (now() + (d.venc_dias || ' days')::interval)::date
FROM quimicos q
CROSS JOIN (VALUES
  ('A', 60::numeric,  120, 540),
  ('B', 35::numeric,   30, 365)
) AS d(sufijo, cantidad, dom_dias, venc_dias)
JOIN proveedores pv
  ON pv.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND pv.nombre = (ARRAY['QA Proveedor Norte','QA Proveedor Sur','QA Proveedor Import'])[1 + (('x' || md5(q.nombre || d.sufijo))::bit(32)::int % 3)]
WHERE q.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND q.nombre LIKE 'QA Quimico %'
  AND q.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lotes_quimicos lq
    WHERE lq.tenant_id = '00000000-0000-0000-0000-000000000001'
      AND lq.quimico_id = q.id
      AND lq.numero_lote = 'QA-QUI-' || right(q.nombre, 2) || '-' || d.sufijo
      AND lq.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 7. Lotes de semilla (4 por variedad QA = 40)
-- ---------------------------------------------------------------------------
INSERT INTO lotes (
  id, tenant_id, tipo, numero_lote, establecimiento_id, proveedor_id,
  proveedor_semilla_id, producto_id, variedad_id, activo
)
SELECT
  gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'semilla',
  'QA-SEM-' || lpad(row_number() OVER (ORDER BY v.nombre, n)::text, 3, '0'),
  est.id, pv.id, pv.id, v.producto_id, v.id, true
FROM variedades v
JOIN productos p ON p.id = v.producto_id AND p.nombre LIKE 'QA %'
CROSS JOIN generate_series(1, 4) AS n
CROSS JOIN (
  SELECT id FROM establecimientos
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre = 'Agrisano'
  LIMIT 1
) AS est
JOIN proveedores pv
  ON pv.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND pv.nombre = (ARRAY['QA Proveedor Norte','QA Proveedor Sur','QA Proveedor Import'])[1 + ((n + length(v.nombre)) % 3)]
WHERE v.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND v.nombre LIKE 'QA %'
  AND v.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lotes l
    WHERE l.tenant_id = '00000000-0000-0000-0000-000000000001'
      AND l.tipo = 'semilla'
      AND l.numero_lote = 'QA-SEM-' || lpad(row_number() OVER (ORDER BY v.nombre, n)::text, 3, '0')
      AND l.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 8. Lotes de sustrato (15)
-- ---------------------------------------------------------------------------
INSERT INTO lotes (id, tenant_id, tipo, numero_lote, establecimiento_id, proveedor_id, activo)
SELECT
  gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'sustrato',
  'QA-SUS-' || lpad(n::text, 3, '0'), est.id, pv.id, true
FROM generate_series(1, 15) AS n
CROSS JOIN (
  SELECT id FROM establecimientos
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre = 'Agrisano'
  LIMIT 1
) AS est
JOIN proveedores pv
  ON pv.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND pv.nombre = (ARRAY['QA Proveedor Norte','QA Proveedor Sur','QA Proveedor Import'])[1 + (n % 3)]
WHERE NOT EXISTS (
  SELECT 1 FROM lotes l
  WHERE l.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND l.tipo = 'sustrato'
    AND l.numero_lote = 'QA-SUS-' || lpad(n::text, 3, '0')
    AND l.deleted_at IS NULL
);

COMMIT;

-- ============================================================================
-- VERIFICACION RAPIDA (correr despues del COMMIT)
-- ============================================================================
-- SELECT count(*) FROM tuneles  WHERE nombre LIKE 'QA Tunel %';        -- 20
-- SELECT count(*) FROM mesas m JOIN tuneles t ON t.id = m.tunel_id
--   WHERE t.nombre LIKE 'QA Tunel %';                                  -- 3000
-- SELECT count(*) FROM quimicos WHERE nombre LIKE 'QA Quimico %';      -- 10
-- SELECT count(*) FROM lotes_quimicos WHERE numero_lote LIKE 'QA-QUI-%'; -- 20
-- SELECT count(*) FROM lotes WHERE numero_lote LIKE 'QA-SEM-%';        -- 40
-- SELECT count(*) FROM lotes WHERE numero_lote LIKE 'QA-SUS-%';        -- 15

-- ============================================================================
-- ROLLBACK / LIMPIEZA (comentado a proposito — descomentar y correr manualmente
-- si queres borrar TODO el dataset QA generado por este script)
-- ============================================================================
-- BEGIN;
-- DELETE FROM lotes WHERE numero_lote LIKE 'QA-SEM-%' OR numero_lote LIKE 'QA-SUS-%';
-- DELETE FROM lotes_quimicos WHERE numero_lote LIKE 'QA-QUI-%';
-- DELETE FROM quimicos WHERE nombre LIKE 'QA Quimico %';
-- DELETE FROM mesas m USING tuneles t WHERE t.id = m.tunel_id AND t.nombre LIKE 'QA Tunel %';
-- DELETE FROM tuneles WHERE nombre LIKE 'QA Tunel %';
-- DELETE FROM proveedores WHERE nombre LIKE 'QA Proveedor %';
-- DELETE FROM marcas WHERE nombre LIKE 'QA Marca %';
-- DELETE FROM variedades WHERE nombre LIKE 'QA %';
-- DELETE FROM productos WHERE nombre LIKE 'QA %';
-- COMMIT;
