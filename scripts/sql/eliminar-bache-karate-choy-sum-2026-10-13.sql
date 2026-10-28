-- =============================================================================
-- ELIMINACION de las 18 bandejas en nursery del bache "Karate Choy Sum"
-- sembrado el 11/9/2026 07:09 (cargado por error) - Tenant de produccion (...0001)
-- =============================================================================
-- Que es: siembra 14c633f4-b631-42dc-9bf1-7d64afffe3e1 (Choy Sum / Karate, lote
-- de semilla CSK-4058400, created_at 2026-09-11 05:09:24 UTC = 07:09 UTC+2).
-- Tiene 39 bandejas: 18 `en_nursery` y 21 `trasplantada` (ya en mesas).
--
-- Por que SQL: `DELETE /siembras/:id` responde 409 SIEMBRA_HAS_TRASPLANTADAS por
-- las 21 trasplantadas, y no existe un endpoint para borrar bandejas sueltas.
--
-- Que hace: les pone `deleted_at` a las 18 bandejas `en_nursery` y a nada mas.
-- Es el mismo mecanismo que usa `deleteSiembra` (UPDATE bandejas SET deleted_at),
-- asi que es reversible: `UPDATE bandejas SET deleted_at = NULL WHERE id IN (...)`
-- con los ids que quedan en el payload del audit_logs.
--
--   * la siembra y sus 21 bandejas trasplantadas quedan intactas
--   * NO se tocan las filas de `aplicacion_quimica_bandeja` (36 vinculos a 3
--     aplicaciones de nursery de 200 bandejas cada una): son historia de
--     trazabilidad. Los resumenes de esas aplicaciones, que hacen LEFT JOIN a
--     `bandejas` sin filtrar deleted_at, seguiran contando las 18.
--   * no se tocan lotes, stock quimico, mesas, cosechas ni historial
--   * deja un registro en `audit_logs` con el motivo y los ids
--
-- SEGURIDAD: antes de tocar nada verifica que el estado sea EXACTAMENTE el
-- analizado (39 bandejas vivas = 18 en_nursery + 21 trasplantada, ninguna con
-- mesa/descarte/borrado, 36 vinculos quimicos). Si algo difiere aborta sin
-- cambiar nada. Al final vuelve a verificar el resultado.
--
-- Es idempotente por construccion: una segunda corrida ya no encuentra las 18
-- bandejas vivas y aborta en la primera verificacion.
--
-- El script NO confirma por defecto: termina en ROLLBACK para poder ensayarlo
-- contra la base real. Para aplicarlo en firme, cambiar el ROLLBACK final por
-- COMMIT. Antes de aplicar: backup con scripts/backup-data.js.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/eliminar-bache-karate-choy-sum-2026-10-13.sql
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- -----------------------------------------------------------------------------
-- 0. Alcance
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _del_params ON COMMIT DROP AS
SELECT '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
       '14c633f4-b631-42dc-9bf1-7d64afffe3e1'::uuid AS siembra_id,
       'CSK-4058400'::text                          AS lote_semilla,
       18                                           AS esperadas_nursery,
       21                                           AS esperadas_trasplantadas,
       36                                           AS esperados_vinculos_quimicos;

-- Bloquea la siembra y todas sus bandejas mientras dura la transaccion.
SELECT count(*) AS bandejas_bloqueadas
  FROM (SELECT 1 FROM bandejas b JOIN _del_params p ON p.siembra_id = b.siembra_id
         ORDER BY b.id FOR UPDATE OF b) s;

-- Las bandejas a eliminar: las en_nursery vivas de esa siembra.
CREATE TEMP TABLE _del_bandejas ON COMMIT DROP AS
SELECT b.id, b.codigo, b.fecha_entrada_nursery
  FROM bandejas b JOIN _del_params p ON p.siembra_id = b.siembra_id AND p.tenant_id = b.tenant_id
 WHERE b.deleted_at IS NULL AND b.estado = 'en_nursery';

CREATE TEMP TABLE _del_vinculos ON COMMIT DROP AS
SELECT a.aplicacion_id, a.bandeja_id
  FROM aplicacion_quimica_bandeja a
 WHERE a.bandeja_id IN (SELECT id FROM _del_bandejas);

SELECT 'ANTES' AS momento, b.estado, (b.deleted_at IS NOT NULL) AS borrada, count(*) AS bandejas
  FROM bandejas b JOIN _del_params p ON p.siembra_id = b.siembra_id
 GROUP BY 2, 3 ORDER BY 2, 3;

-- -----------------------------------------------------------------------------
-- 1. Guardas: el estado tiene que ser exactamente el analizado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  p _del_params%ROWTYPE;
  v_n int;
BEGIN
  SELECT * INTO STRICT p FROM _del_params;

  -- La siembra es la correcta y sigue viva.
  IF NOT EXISTS (SELECT 1 FROM siembras s
                  WHERE s.id = p.siembra_id AND s.tenant_id = p.tenant_id
                    AND s.deleted_at IS NULL
                    AND s.fecha = date '2026-09-11'
                    AND date_trunc('milliseconds', s.created_at) = timestamptz '2026-09-11 05:09:24.873+00') THEN
    RAISE EXCEPTION 'La siembra % no existe, esta borrada o no es la analizada', p.siembra_id;
  END IF;

  -- Distribucion exacta de bandejas (vivas y borradas).
  SELECT count(*) INTO v_n FROM bandejas WHERE siembra_id = p.siembra_id;
  IF v_n <> p.esperadas_nursery + p.esperadas_trasplantadas THEN
    RAISE EXCEPTION 'La siembra tiene % bandejas en total, se esperaban %', v_n, p.esperadas_nursery + p.esperadas_trasplantadas;
  END IF;

  SELECT count(*) INTO v_n FROM bandejas WHERE siembra_id = p.siembra_id AND deleted_at IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'La siembra ya tiene % bandejas borradas', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM _del_bandejas;
  IF v_n <> p.esperadas_nursery THEN
    RAISE EXCEPTION 'Bandejas en_nursery vivas: % (se esperaban %)', v_n, p.esperadas_nursery;
  END IF;

  SELECT count(*) INTO v_n FROM bandejas
   WHERE siembra_id = p.siembra_id AND deleted_at IS NULL AND estado = 'trasplantada';
  IF v_n <> p.esperadas_trasplantadas THEN
    RAISE EXCEPTION 'Bandejas trasplantadas vivas: % (se esperaban %)', v_n, p.esperadas_trasplantadas;
  END IF;

  -- Las 18 son realmente solo nursery: sin mesa, sin fecha de trasplante, de la
  -- semilla correcta y sin ninguna otra referencia (mesa_bandeja, descartes).
  IF EXISTS (SELECT 1 FROM bandejas b
               LEFT JOIN lotes l ON l.id = b.lote_semilla_id
              WHERE b.id IN (SELECT id FROM _del_bandejas)
                AND (b.mesa_id IS NOT NULL OR b.fecha_trasplante IS NOT NULL
                     OR l.numero_lote IS DISTINCT FROM p.lote_semilla)) THEN
    RAISE EXCEPTION 'Alguna de las 18 bandejas tiene mesa, fecha de trasplante o no es de la semilla %', p.lote_semilla;
  END IF;

  IF EXISTS (SELECT 1 FROM mesa_bandeja WHERE bandeja_id IN (SELECT id FROM _del_bandejas)) THEN
    RAISE EXCEPTION 'Alguna de las 18 bandejas aparece en mesa_bandeja';
  END IF;

  IF EXISTS (SELECT 1 FROM bandeja_descartes d JOIN bandejas b ON b.id = d.bandeja_id
              WHERE b.siembra_id = p.siembra_id) THEN
    RAISE EXCEPTION 'La siembra tiene bandejas con descarte registrado';
  END IF;

  -- Los vinculos quimicos son los analizados: nada se aplico desde entonces.
  SELECT count(*) INTO v_n FROM _del_vinculos;
  IF v_n <> p.esperados_vinculos_quimicos THEN
    RAISE EXCEPTION 'Vinculos quimicos de las 18 bandejas: % (se esperaban %)', v_n, p.esperados_vinculos_quimicos;
  END IF;

  IF (SELECT count(DISTINCT aplicacion_id) FROM _del_vinculos) <> 3 THEN
    RAISE EXCEPTION 'Las 18 bandejas deberian estar en exactamente 3 aplicaciones quimicas';
  END IF;

  RAISE NOTICE 'Guardas OK: 18 en_nursery + 21 trasplantadas, 36 vinculos quimicos';
END $$;

-- -----------------------------------------------------------------------------
-- 2. Eliminacion (soft delete, igual que deleteSiembra)
-- -----------------------------------------------------------------------------
UPDATE bandejas
   SET deleted_at = now(), updated_at = now()
 WHERE id IN (SELECT id FROM _del_bandejas)
   AND deleted_at IS NULL
   AND estado = 'en_nursery';

-- Constancia.
INSERT INTO audit_logs (tenant_id, kind, request_id, action, entity, payload)
SELECT p.tenant_id,
       'admin',
       'manual-delete-' || gen_random_uuid()::text,
       'bandejas_eliminadas_manual',
       'bandeja',
       jsonb_build_object(
         'motivo', 'Bache cargado por error; se eliminan las 18 bandejas en nursery (soft delete). Las 21 trasplantadas se conservan',
         'script', 'scripts/sql/eliminar-bache-karate-choy-sum-2026-10-13.sql',
         'siembra_id', p.siembra_id,
         'lote_semilla', p.lote_semilla,
         'bandeja_ids', (SELECT jsonb_agg(id ORDER BY id) FROM _del_bandejas),
         'vinculos_quimicos_conservados', (SELECT count(*) FROM _del_vinculos)
       )
  FROM _del_params p;

-- -----------------------------------------------------------------------------
-- 3. Verificacion del resultado (si falla, se deshace todo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  p _del_params%ROWTYPE;
BEGIN
  SELECT * INTO STRICT p FROM _del_params;

  IF (SELECT count(*) FROM bandejas
       WHERE id IN (SELECT id FROM _del_bandejas) AND deleted_at IS NOT NULL) <> p.esperadas_nursery THEN
    RAISE EXCEPTION 'Post: las 18 bandejas no quedaron borradas';
  END IF;

  IF (SELECT count(*) FROM bandejas
       WHERE siembra_id = p.siembra_id AND deleted_at IS NULL) <> p.esperadas_trasplantadas
     OR (SELECT count(*) FROM bandejas
          WHERE siembra_id = p.siembra_id AND deleted_at IS NULL AND estado = 'trasplantada') <> p.esperadas_trasplantadas THEN
    RAISE EXCEPTION 'Post: las 21 trasplantadas no quedaron intactas y vivas';
  END IF;

  -- Se borro exactamente lo previsto en toda la base (nada colateral).
  IF (SELECT count(*) FROM bandejas WHERE deleted_at = now()) <> p.esperadas_nursery THEN
    RAISE EXCEPTION 'Post: se borraron % bandejas en esta transaccion (se esperaban %)',
      (SELECT count(*) FROM bandejas WHERE deleted_at = now()), p.esperadas_nursery;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM siembras WHERE id = p.siembra_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Post: la siembra no deberia haberse borrado';
  END IF;

  IF (SELECT count(*) FROM aplicacion_quimica_bandeja
       WHERE bandeja_id IN (SELECT id FROM _del_bandejas)) <> p.esperados_vinculos_quimicos THEN
    RAISE EXCEPTION 'Post: los vinculos quimicos no se conservaron';
  END IF;

  IF (SELECT count(*) FROM audit_logs
       WHERE action = 'bandejas_eliminadas_manual'
         AND payload->>'siembra_id' = p.siembra_id::text) <> 1 THEN
    RAISE EXCEPTION 'Post: falta (o sobra) el registro de auditoria';
  END IF;

  RAISE NOTICE 'Verificacion final OK';
END $$;

SELECT 'DESPUES' AS momento, b.estado, (b.deleted_at IS NOT NULL) AS borrada, count(*) AS bandejas
  FROM bandejas b JOIN _del_params p ON p.siembra_id = b.siembra_id
 GROUP BY 2, 3 ORDER BY 2, 3;

-- >>> Cambiar por COMMIT para aplicar en firme <<<
ROLLBACK;
