-- =============================================================================
-- ROLLBACK de la carga inicial "INIT" (scripts/seed-init-trasplante.js)
-- =============================================================================
-- Deshace todo lo que creo la carga de arranque y devuelve las mesas al estado
-- "vacia y lista para trasplantar" (activa, sin posicion):
--
--   BORRA    : los trasplantes INIT (mesa_bandeja + historial_mesa), las
--              bandejas y siembras INIT, los 3 lotes INIT y el catalogo INIT
--              (variedad, producto, marca, proveedor).
--   CONSERVA : mesas, tuneles, usuarios, roles y todo lo que el cliente haya
--              cargado por su cuenta.
--
-- SEGURIDAD: aborta si alguna mesa INIT ya tiene cosechas o aplicaciones
-- quimicas encima. En ese caso el cliente ya empezo a operar y este rollback
-- destruiria trazabilidad real: hay que resolverlo a mano.
--
-- El script NO confirma por defecto: termina en ROLLBACK para que se pueda
-- ensayar. Cambiar el ROLLBACK final por COMMIT para aplicarlo en firme.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/rollback-init-trasplante.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Alcance: todo cuelga del lote de semilla INIT.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _init_bandejas ON COMMIT DROP AS
SELECT b.id, b.siembra_id, b.mesa_id
  FROM bandejas b
  JOIN lotes l ON l.id = b.lote_semilla_id
 WHERE l.numero_lote = 'INIT-SEMILLA-001';

CREATE TEMP TABLE _init_mesas ON COMMIT DROP AS
SELECT DISTINCT mesa_id AS id FROM _init_bandejas WHERE mesa_id IS NOT NULL;

\echo '=== ALCANCE ==='
SELECT (SELECT count(*) FROM _init_bandejas)                      AS bandejas_init,
       (SELECT count(DISTINCT siembra_id) FROM _init_bandejas)    AS siembras_init,
       (SELECT count(*) FROM _init_mesas)                         AS mesas_afectadas;

-- -----------------------------------------------------------------------------
-- 1. Guarda: no pisar operacion real del cliente.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  n_cosechas int;
  n_aplic    int;
BEGIN
  SELECT count(*) INTO n_cosechas
    FROM cosechas c WHERE c.mesa_id IN (SELECT id FROM _init_mesas);
  IF n_cosechas > 0 THEN
    RAISE EXCEPTION
      'Hay % cosechas sobre mesas de la carga INIT. El cliente ya opero: resolver a mano.', n_cosechas;
  END IF;

  SELECT count(*) INTO n_aplic
    FROM aplicacion_quimica_mesa a WHERE a.mesa_id IN (SELECT id FROM _init_mesas);
  IF n_aplic > 0 THEN
    RAISE EXCEPTION
      'Hay % aplicaciones quimicas sobre mesas de la carga INIT. Resolver a mano.', n_aplic;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Vinculos mesa-bandeja e historial del trasplante.
--    El historial no referencia la bandeja por FK: se ubica por el array
--    `bandeja_ids` que el servicio guarda en el jsonb `detalle`.
-- -----------------------------------------------------------------------------
DELETE FROM aplicacion_quimica_bandeja
 WHERE bandeja_id IN (SELECT id FROM _init_bandejas);

DELETE FROM mesa_bandeja
 WHERE bandeja_id IN (SELECT id FROM _init_bandejas);

DELETE FROM historial_mesa h
 WHERE h.tipo_evento = 'trasplante'
   AND EXISTS (
     SELECT 1 FROM _init_bandejas b
      WHERE h.detalle -> 'bandeja_ids' @> to_jsonb(b.id::text)
   );

-- -----------------------------------------------------------------------------
-- 3. Bandejas y siembras INIT.
-- -----------------------------------------------------------------------------
DELETE FROM bandejas WHERE id IN (SELECT id FROM _init_bandejas);

DELETE FROM siembras
 WHERE id IN (SELECT DISTINCT siembra_id FROM _init_bandejas);

-- -----------------------------------------------------------------------------
-- 4. Mesas de vuelta a "vacia y lista para trasplantar".
-- -----------------------------------------------------------------------------
UPDATE mesas SET
  estado                  = 'activa',
  posicion_actual         = NULL,
  fecha_ultimo_trasplante = NULL,
  updated_at              = now()
WHERE id IN (SELECT id FROM _init_mesas);

-- -----------------------------------------------------------------------------
-- 5. Lotes y catalogo INIT (hijos antes que padres por FK).
-- -----------------------------------------------------------------------------
DELETE FROM lotes
 WHERE numero_lote IN ('INIT-SEMILLA-001', 'INIT-SUSTRATO-001', 'INIT-VERMICULITA-001');

DELETE FROM variedades   WHERE nombre = 'INIT - Variedad inicial';
DELETE FROM productos    WHERE nombre = 'INIT - Producto inicial';
DELETE FROM marcas       WHERE nombre = 'INIT - Marca inicial';
DELETE FROM proveedores  WHERE nombre = 'INIT - Proveedor inicial';

-- -----------------------------------------------------------------------------
-- 6. OPCIONAL: borrar tambien el rastro en auditoria.
--    Por defecto NO se toca: audit_logs es un registro historico y la carga
--    INIT fue una operacion real ejecutada por un usuario real.
-- -----------------------------------------------------------------------------
-- DELETE FROM audit_logs
--  WHERE action IN ('trasplante_ejecutado', 'siembra_created', 'siembra_ingreso_nursery');

-- =============================================================================
-- VERIFICACION - revisar esta salida ANTES de confirmar
-- =============================================================================
\echo '=== VERIFICACION: mesas por tunel (con_posicion debe ser 0) ==='
SELECT t.nombre AS tunel,
       count(m.id)              AS mesas,
       count(m.posicion_actual) AS con_posicion
  FROM tuneles t
  LEFT JOIN mesas m ON m.tunel_id = t.id AND m.deleted_at IS NULL
 WHERE t.deleted_at IS NULL
 GROUP BY t.nombre ORDER BY t.nombre;

\echo '=== VERIFICACION: tablas que deben quedar en 0 ==='
SELECT 'bandejas' t, count(*) FROM bandejas
UNION ALL SELECT 'siembras', count(*) FROM siembras
UNION ALL SELECT 'mesa_bandeja', count(*) FROM mesa_bandeja
UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa
UNION ALL SELECT 'lotes', count(*) FROM lotes
ORDER BY 1;

-- =============================================================================
-- Cambiar por COMMIT para aplicar en firme.
-- =============================================================================
ROLLBACK;
