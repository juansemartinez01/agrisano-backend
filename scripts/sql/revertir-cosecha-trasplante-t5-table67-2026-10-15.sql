-- =============================================================================
-- REVERSION de cosecha + trasplante cargados por error (15/10/2026)
-- Tenant de produccion (...0001) - Tunnel 5 - Table 67
-- =============================================================================
-- Que paso: el 15/10 01:20 UTC, Table 67 (que estaba al frente de la fila, en
-- la posicion 1) registro una cosecha y un segundo despues un trasplante de 3
-- bandejas. La mesa quedo al final de la fila (posicion 122) y el resto del
-- tunel corrio -1. Es la ultima operacion del Tunnel 5: nada ocurrio despues.
--
-- Que hace este script: deshace esas dos operaciones y nada mas. Deja la base
-- como estaba antes de la cosecha:
--
--   * las 3 bandejas vuelven a `en_nursery` (sin mesa ni fecha de trasplante);
--     su carencia_hasta no se toca porque viene de las aplicaciones de nursery
--   * se borran las 3 filas de `mesa_bandeja` de ese trasplante
--   * se borran la cosecha y los 2 eventos de `historial_mesa`
--     (1 `cosecha` + 1 `trasplante`); la mesa conserva su trasplante INIT
--   * Table 67 vuelve a la posicion 1, `activa`, con su `fecha_ultimo_trasplante`
--     del trasplante INIT (se recupera exacta de `bandejas.fecha_trasplante` del
--     ciclo previo)
--   * el resto del tunel vuelve a correrse +1 (misma tecnica de dos pasadas con
--     offset negativo que usa la cosecha por el indice unico UQ_mesas_tunel_posicion)
--   * deja un registro en `audit_logs` con el motivo; los `cosecha_registrada` y
--     `trasplante_ejecutado` originales quedan como constancia
--
-- Las cosechas/trasplantes anteriores del tunel (Table 58 a 66, del 14/10) NO se
-- tocan: `desde` queda posterior a todas ellas.
--
-- SEGURIDAD: antes de tocar nada verifica que el estado sea EXACTAMENTE el
-- esperado (1 cosecha, 3 bandejas, 2 eventos de historial, posiciones
-- contiguas, nada mas ocurrido en el tunel desde entonces, sin packing, sin
-- aplicaciones, sin descartes). Si algo difiere -p.ej. el cliente siguio
-- operando en el Tunnel 5- aborta sin cambiar nada y hay que re-analizar. Al
-- final vuelve a verificar el resultado antes de terminar.
--
-- Es idempotente por construccion: una segunda corrida no encuentra la
-- cosecha y aborta en la primera verificacion.
--
-- El script NO confirma por defecto: termina en ROLLBACK para poder ensayarlo
-- contra la base real. Para aplicarlo en firme, cambiar el ROLLBACK final por
-- COMMIT. Antes de aplicar: backup con scripts/backup-data.js.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/revertir-cosecha-trasplante-t5-table67-2026-10-15.sql
-- =============================================================================

BEGIN;

-- Si la app tiene filas bloqueadas preferimos fallar rapido antes que colgarnos.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- -----------------------------------------------------------------------------
-- 0. Alcance
-- -----------------------------------------------------------------------------
-- `desde` es posterior a las cosechas de Table 58..66 (ultima: 14/10 23:56 UTC)
-- y anterior a la de Table 67 (15/10 01:20 UTC).
CREATE TEMP TABLE _rev_params ON COMMIT DROP AS
SELECT '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
       'Tunnel 5'::text                             AS tunel_nombre,
       timestamptz '2026-10-15 01:00:00+00'         AS desde;

-- La mesa, con su posicion original (1).
CREATE TEMP TABLE _rev_mesas ON COMMIT DROP AS
SELECT m.id, m.nombre, m.tunel_id, v.orden
  FROM (VALUES ('Table 67', 1)) AS v(nombre, orden)
  CROSS JOIN _rev_params p
  JOIN tuneles t ON t.tenant_id = p.tenant_id AND t.nombre = p.tunel_nombre AND t.deleted_at IS NULL
  JOIN mesas   m ON m.tunel_id = t.id AND m.nombre = v.nombre AND m.deleted_at IS NULL;

-- Bloquea todas las mesas del tunel mientras dura la transaccion.
SELECT count(*) AS mesas_del_tunel_bloqueadas
  FROM (SELECT 1 FROM mesas
         WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas)
         ORDER BY id FOR UPDATE) s;

-- Todo lo que ocurrio en el tunel desde el incidente.
CREATE TEMP TABLE _rev_cosechas ON COMMIT DROP AS
SELECT c.id, c.mesa_id, c.fecha_hora, c.posicion_al_momento
  FROM cosechas c CROSS JOIN _rev_params p
 WHERE c.tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas)
   AND c.fecha_hora >= p.desde;

CREATE TEMP TABLE _rev_hist ON COMMIT DROP AS
SELECT h.id, h.mesa_id, h.tipo_evento, h.fecha_hora
  FROM historial_mesa h CROSS JOIN _rev_params p
 WHERE h.mesa_id IN (SELECT id FROM mesas WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas))
   AND h.fecha_hora >= p.desde;

CREATE TEMP TABLE _rev_mb ON COMMIT DROP AS
SELECT mb.mesa_id, mb.bandeja_id, mb.fecha_trasplante
  FROM mesa_bandeja mb CROSS JOIN _rev_params p
 WHERE mb.mesa_id IN (SELECT id FROM _rev_mesas)
   AND mb.fecha_trasplante >= p.desde;

-- Estado previo recuperable: fecha del trasplante anterior (el INIT).
CREATE TEMP TABLE _rev_prev ON COMMIT DROP AS
SELECT rm.id AS mesa_id,
       (SELECT max(b.fecha_trasplante)
          FROM mesa_bandeja mb
          JOIN bandejas b ON b.id = mb.bandeja_id AND b.mesa_id = rm.id
         WHERE mb.mesa_id = rm.id AND mb.fecha_trasplante < p.desde) AS fecha_ultimo_trasplante
  FROM _rev_mesas rm CROSS JOIN _rev_params p;

-- Foto del tunel antes de modificar, para verificar el resultado.
CREATE TEMP TABLE _rev_antes ON COMMIT DROP AS
SELECT id, nombre, estado, posicion_actual, fecha_ultimo_trasplante
  FROM mesas
 WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas);

SELECT 'ANTES' AS momento, id, nombre, estado, posicion_actual, fecha_ultimo_trasplante
  FROM _rev_antes
 WHERE id IN (SELECT id FROM _rev_mesas);

SELECT 'ALCANCE' AS momento,
       (SELECT jsonb_agg(id) FROM _rev_cosechas)                      AS cosecha_ids,
       (SELECT jsonb_agg(bandeja_id ORDER BY bandeja_id) FROM _rev_mb) AS bandeja_ids,
       (SELECT jsonb_agg(id ORDER BY fecha_hora) FROM _rev_hist)       AS historial_ids,
       (SELECT fecha_ultimo_trasplante FROM _rev_prev)                 AS fecha_a_restaurar;

-- -----------------------------------------------------------------------------
-- 1. Guardas: el estado tiene que ser exactamente el analizado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tunel uuid;
  v_n     int;
  v_max   int;
  v_desde timestamptz := (SELECT desde FROM _rev_params);
BEGIN
  IF (SELECT count(*) FROM _rev_mesas) <> 1 THEN
    RAISE EXCEPTION 'No se encontro exactamente 1 mesa (encontradas: %)', (SELECT count(*) FROM _rev_mesas);
  END IF;
  SELECT DISTINCT tunel_id INTO STRICT v_tunel FROM _rev_mesas;

  -- Posiciones contiguas 1..N y la mesa en la ultima (N).
  SELECT count(*), max(posicion_actual) INTO v_n, v_max
    FROM mesas WHERE tunel_id = v_tunel AND posicion_actual IS NOT NULL;
  IF v_n <> v_max
     OR (SELECT count(DISTINCT posicion_actual) FROM mesas
          WHERE tunel_id = v_tunel AND posicion_actual IS NOT NULL) <> v_n THEN
    RAISE EXCEPTION 'Las posiciones del tunel no son contiguas (n=%, max=%)', v_n, v_max;
  END IF;
  IF EXISTS (SELECT 1 FROM mesas WHERE tunel_id = v_tunel AND posicion_actual IS NOT NULL AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay mesas dadas de baja con posicion en el tunel';
  END IF;
  IF EXISTS (SELECT 1 FROM _rev_mesas rm JOIN mesas m ON m.id = rm.id
              WHERE m.estado <> 'activa'
                 OR m.posicion_actual IS DISTINCT FROM v_max
                 OR m.fecha_ultimo_trasplante IS NULL
                 OR m.fecha_ultimo_trasplante < v_desde) THEN
    RAISE EXCEPTION 'La mesa no esta activa en la ultima posicion del tunel con un trasplante posterior al incidente';
  END IF;

  -- Cosecha: exactamente 1, de la mesa, desde la posicion 1, sin packing.
  IF (SELECT count(*) FROM _rev_cosechas) <> 1
     OR EXISTS (SELECT 1 FROM _rev_cosechas WHERE mesa_id NOT IN (SELECT id FROM _rev_mesas)) THEN
    RAISE EXCEPTION 'Se esperaba exactamente 1 cosecha (de la mesa) en el tunel desde el incidente; hay %',
      (SELECT count(*) FROM _rev_cosechas);
  END IF;
  IF EXISTS (SELECT 1 FROM _rev_cosechas WHERE posicion_al_momento <> 1) THEN
    RAISE EXCEPTION 'La cosecha no se hizo desde la posicion 1';
  END IF;
  IF EXISTS (SELECT 1 FROM lotes_packing WHERE cosecha_id IN (SELECT id FROM _rev_cosechas)) THEN
    RAISE EXCEPTION 'La cosecha ya tiene lote de packing';
  END IF;

  -- Trasplante: 3 bandejas en un unico evento, bandejas intactas y salidas de nursery.
  IF (SELECT count(*) FROM _rev_mb) <> 3
     OR (SELECT count(DISTINCT mesa_id) FROM _rev_mb) <> 1
     OR (SELECT count(DISTINCT fecha_trasplante) FROM _rev_mb) <> 1 THEN
    RAISE EXCEPTION 'Se esperaban 3 filas de mesa_bandeja (un solo evento) desde el incidente; hay %',
      (SELECT count(*) FROM _rev_mb);
  END IF;
  IF EXISTS (SELECT 1 FROM _rev_mb r JOIN bandejas b ON b.id = r.bandeja_id
              WHERE b.estado <> 'trasplantada' OR b.mesa_id IS DISTINCT FROM r.mesa_id OR b.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Alguna bandeja ya no esta trasplantada en su mesa (fue descartada o modificada)';
  END IF;
  IF EXISTS (SELECT 1 FROM _rev_mb r JOIN bandejas b ON b.id = r.bandeja_id
              WHERE b.fecha_entrada_nursery IS NULL) THEN
    RAISE EXCEPTION 'Alguna bandeja no tiene fecha de entrada a nursery (no venia de nursery)';
  END IF;
  IF EXISTS (SELECT 1 FROM bandeja_descartes WHERE bandeja_id IN (SELECT bandeja_id FROM _rev_mb)) THEN
    RAISE EXCEPTION 'Alguna de las bandejas tiene un descarte registrado';
  END IF;
  IF EXISTS (SELECT 1 FROM mesa_bandeja mb
              WHERE mb.bandeja_id IN (SELECT bandeja_id FROM _rev_mb)
                AND (mb.mesa_id, mb.bandeja_id) NOT IN (SELECT mesa_id, bandeja_id FROM _rev_mb)) THEN
    RAISE EXCEPTION 'Alguna de las bandejas esta vinculada a otra mesa';
  END IF;

  -- Nada de invernadero sobre la mesa desde el incidente.
  IF EXISTS (SELECT 1 FROM aplicacion_quimica_mesa a
               JOIN aplicaciones_quimicas aq ON aq.id = a.aplicacion_id
              WHERE a.mesa_id IN (SELECT id FROM _rev_mesas) AND aq.fecha_hora >= v_desde) THEN
    RAISE EXCEPTION 'Hay aplicaciones quimicas de invernadero sobre la mesa desde el incidente';
  END IF;

  -- Historial: en TODO el tunel solo los 2 eventos del incidente (1 cosecha + 1 trasplante).
  IF (SELECT count(*) FROM _rev_hist) <> 2
     OR EXISTS (SELECT 1 FROM _rev_hist WHERE mesa_id NOT IN (SELECT id FROM _rev_mesas))
     OR (SELECT count(*) FROM _rev_hist WHERE tipo_evento = 'cosecha') <> 1
     OR (SELECT count(*) FROM _rev_hist WHERE tipo_evento = 'trasplante') <> 1 THEN
    RAISE EXCEPTION 'El historial del tunel desde el incidente no es el esperado (2 eventos: 1 cosecha + 1 trasplante); hay %',
      (SELECT count(*) FROM _rev_hist);
  END IF;

  -- Ciclo previo (INIT) recuperable.
  IF EXISTS (SELECT 1 FROM _rev_prev WHERE fecha_ultimo_trasplante IS NULL)
     OR EXISTS (SELECT 1 FROM _rev_mesas rm
                 WHERE NOT EXISTS (SELECT 1 FROM historial_mesa h
                                    WHERE h.mesa_id = rm.id AND h.tipo_evento = 'trasplante' AND h.fecha_hora < v_desde)) THEN
    RAISE EXCEPTION 'La mesa no tiene trasplante previo (INIT) del cual restaurar el estado';
  END IF;

  RAISE NOTICE 'Guardas OK: tunel con % mesas posicionadas, 1 cosecha, 3 bandejas, 2 eventos de historial', v_n;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Reversion
-- -----------------------------------------------------------------------------
-- 2.1 Las bandejas vuelven a nursery. carencia_hasta no se toca.
UPDATE bandejas
   SET estado = 'en_nursery', mesa_id = NULL, fecha_trasplante = NULL, updated_at = now()
 WHERE id IN (SELECT bandeja_id FROM _rev_mb);

-- 2.2 Se borra el vinculo del trasplante.
DELETE FROM mesa_bandeja mb
 USING _rev_mb r
 WHERE mb.mesa_id = r.mesa_id AND mb.bandeja_id = r.bandeja_id;

-- 2.3 Se borran los eventos de historial y la cosecha del incidente.
DELETE FROM historial_mesa WHERE id IN (SELECT id FROM _rev_hist);
DELETE FROM cosechas       WHERE id IN (SELECT id FROM _rev_cosechas);

-- 2.4 Posiciones. La mesa sale de la fila; el resto corre +1 en dos pasadas
--     con offset negativo (UQ_mesas_tunel_posicion no es diferible); la mesa
--     entra al frente en 1.
UPDATE mesas SET posicion_actual = NULL, updated_at = now()
 WHERE id IN (SELECT id FROM _rev_mesas);

UPDATE mesas SET posicion_actual = -posicion_actual, updated_at = now()
 WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas)
   AND posicion_actual IS NOT NULL;

UPDATE mesas SET posicion_actual = -posicion_actual + 1, updated_at = now()
 WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas)
   AND posicion_actual < 0;

UPDATE mesas m
   SET posicion_actual         = rm.orden,
       estado                  = 'activa',
       fecha_ultimo_trasplante = rp.fecha_ultimo_trasplante,
       updated_at              = now()
  FROM _rev_mesas rm
  JOIN _rev_prev rp ON rp.mesa_id = rm.id
 WHERE m.id = rm.id;

-- 2.5 Constancia.
INSERT INTO audit_logs (tenant_id, kind, request_id, action, entity, payload)
SELECT p.tenant_id,
       'admin',
       'manual-revert-' || gen_random_uuid()::text,
       'cosecha_trasplante_revertidos_manual',
       'mesa',
       jsonb_build_object(
         'motivo', 'Cosecha y trasplante cargados por error por el cliente; revertidos a mano por script SQL',
         'script', 'scripts/sql/revertir-cosecha-trasplante-t5-table67-2026-10-15.sql',
         'tunel', p.tunel_nombre,
         'mesas', (SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'posicion_restaurada', orden) ORDER BY orden) FROM _rev_mesas),
         'cosecha_ids', (SELECT jsonb_agg(id ORDER BY fecha_hora) FROM _rev_cosechas),
         'bandeja_ids', (SELECT jsonb_agg(bandeja_id ORDER BY mesa_id, bandeja_id) FROM _rev_mb)
       )
  FROM _rev_params p;

-- -----------------------------------------------------------------------------
-- 3. Verificacion del resultado (si falla, se deshace todo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tunel uuid;
  v_n     int;
  v_max   int;
BEGIN
  SELECT DISTINCT tunel_id INTO STRICT v_tunel FROM _rev_mesas;

  SELECT count(*), max(posicion_actual) INTO v_n, v_max
    FROM mesas WHERE tunel_id = v_tunel AND posicion_actual IS NOT NULL;
  IF v_n <> v_max
     OR (SELECT count(DISTINCT posicion_actual) FROM mesas
          WHERE tunel_id = v_tunel AND posicion_actual IS NOT NULL) <> v_n THEN
    RAISE EXCEPTION 'Post: posiciones no contiguas (n=%, max=%)', v_n, v_max;
  END IF;

  IF EXISTS (SELECT 1 FROM _rev_mesas rm
               JOIN mesas m ON m.id = rm.id
               JOIN _rev_prev rp ON rp.mesa_id = rm.id
              WHERE m.posicion_actual IS DISTINCT FROM rm.orden
                 OR m.estado <> 'activa'
                 OR m.fecha_ultimo_trasplante IS DISTINCT FROM rp.fecha_ultimo_trasplante) THEN
    RAISE EXCEPTION 'Post: la mesa no quedo en 1 / activa / fecha INIT';
  END IF;

  IF EXISTS (SELECT 1 FROM _rev_antes a JOIN mesas m ON m.id = a.id
              WHERE a.id NOT IN (SELECT id FROM _rev_mesas)
                AND m.posicion_actual IS DISTINCT FROM a.posicion_actual + 1) THEN
    RAISE EXCEPTION 'Post: el resto del tunel no corrio exactamente +1';
  END IF;

  IF (SELECT count(*) FROM bandejas
       WHERE id IN (SELECT bandeja_id FROM _rev_mb)
         AND estado = 'en_nursery' AND mesa_id IS NULL AND fecha_trasplante IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Post: las 3 bandejas no quedaron en en_nursery';
  END IF;

  IF EXISTS (SELECT 1 FROM cosechas WHERE id IN (SELECT id FROM _rev_cosechas))
     OR EXISTS (SELECT 1 FROM historial_mesa WHERE id IN (SELECT id FROM _rev_hist))
     OR EXISTS (SELECT 1 FROM mesa_bandeja mb JOIN _rev_mb r ON r.mesa_id = mb.mesa_id AND r.bandeja_id = mb.bandeja_id) THEN
    RAISE EXCEPTION 'Post: quedaron rastros del incidente';
  END IF;

  -- El trasplante INIT sigue intacto en la mesa.
  IF EXISTS (SELECT 1 FROM _rev_mesas rm
              WHERE (SELECT count(*) FROM mesa_bandeja mb JOIN bandejas b ON b.id = mb.bandeja_id
                      WHERE mb.mesa_id = rm.id AND b.mesa_id = rm.id AND b.estado = 'trasplantada') < 1
                 OR NOT EXISTS (SELECT 1 FROM historial_mesa h WHERE h.mesa_id = rm.id AND h.tipo_evento = 'trasplante')) THEN
    RAISE EXCEPTION 'Post: la mesa perdio su trasplante INIT';
  END IF;

  RAISE NOTICE 'Verificacion final OK';
END $$;

SELECT 'DESPUES' AS momento, nombre, estado, posicion_actual, fecha_ultimo_trasplante
  FROM mesas
 WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas)
   AND (posicion_actual <= 4 OR posicion_actual >= 120)
 ORDER BY posicion_actual;

SELECT 'TUNEL' AS resumen, count(*) AS mesas, count(posicion_actual) AS con_posicion,
       min(posicion_actual) AS pos_min, max(posicion_actual) AS pos_max
  FROM mesas
 WHERE tunel_id = (SELECT DISTINCT tunel_id FROM _rev_mesas) AND deleted_at IS NULL;

-- >>> Cambiar por COMMIT para aplicar en firme <<<
ROLLBACK;
