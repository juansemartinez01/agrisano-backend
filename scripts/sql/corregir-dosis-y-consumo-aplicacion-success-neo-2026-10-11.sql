-- =============================================================================
-- CORRECCION de dosis y consumo de una aplicacion quimica cargada con valores equivocados
-- Tenant de produccion (...0001) - Success Neo, lote 22G20789F0 - 11/10/2026
-- =============================================================================
-- Que paso: la aplicacion de invernadero de Success Neo (lote 22G20789F0, 279
-- mesas de Tunnel 2/3/4/5/6, aplicada por Marcos Morel Q el 11/10/2026 06:40 hora
-- local de la UI, WHP 3 dias) se cargo con dosis 440 mL/Ha y 0.116 L consumidos, y
-- lo correcto era dosis 400 mL/Ha y 0.163 L consumidos.
--
-- Que hace este script, todo en una sola transaccion:
--
--   1. DOSIS 440 -> 400 mL/Ha, en los tres lugares donde se guarda:
--        aplicaciones_quimicas.dosis          una fila por cada tanda fisica del
--                                             operation_group (maximo 200 mesas por
--                                             tanda, asi que con 279 hay al menos 2)
--        aplicaciones_quimicas_detalle.dosis  la linea del quimico de cada tanda
--        historial_mesa.detalle.dosis         un evento `aplicacion_quimica` por mesa
--
--   2. CONSUMO 0.116 -> 0.163 L (se omite con -v con_cantidad=0):
--        aplicaciones_quimicas_detalle.cantidad   cada tanda guarda su propia cantidad;
--                                             el total nuevo se reparte en proporcion a
--                                             lo que cada tanda tenia y el resto del
--                                             redondeo a 6 decimales va a la tanda mas
--                                             grande, asi la suma da exactamente 0.163
--        historial_mesa.detalle.cantidad      cada evento lleva la cantidad de SU tanda
--        lotes_quimicos.cantidad_actual       baja la diferencia (0.163 menos el total
--                                             guardado), asi el stock del lote queda como
--                                             si se hubiera descontado 0.163 desde el
--                                             principio (se omite con -v ajustar_stock=0)
--
-- NO toca: unidad_medida, withholding_period_dias ni carencia_hasta (dependen del
-- producto, no de la dosis ni de la cantidad), los eventos EN_CARENCIA del
-- historial, updated_at ni updated_by* (ni de las aplicaciones ni del lote).
-- Tampoco deja registro en audit_logs: pedido expreso, la base debe quedar como
-- si se hubiese cargado asi desde el principio.
--
-- Por que SQL directo y no el PATCH de la API: el PATCH recalcula la carencia
-- con el WHP actual del producto, inserta eventos EN_CARENCIA nuevos fechados
-- hoy y no reescribe el historial `aplicacion_quimica`.
--
-- Como identifica la aplicacion: tenant + invernadero + lote 22G20789F0 + dosis
-- 440 mL/Ha + fecha_hora dentro de [2026-10-10 12:00Z, 2026-10-11 20:00Z), que
-- cubre las 06:40 del 11/10 en cualquier huso horario. Los eventos de historial
-- se buscan por detalle.aplicacion_id (su fecha_hora es la del request, no la
-- del encabezado).
--
-- SEGURIDAD: antes de tocar nada verifica que el estado sea EXACTAMENTE el
-- visto en la UI: un unico operation_group, el quimico Success Neo, 1 sola linea
-- de detalle por tanda (en litros), 279 mesas distintas con el mismo reparto por
-- tunel (78/78/78/38/7), 279 eventos de historial con dosis 440 (sin quimicos
-- adicionales) y, para el consumo, que el total guardado sea el de la UI (0.116,
-- con +/-0.0005 porque la UI puede mostrarlo redondeado), que cada evento lleve la
-- cantidad de su tanda y que el lote tenga stock para la diferencia. Si algo
-- difiere -p.ej. otra aplicacion del mismo lote con la misma dosis ese dia- aborta
-- sin cambiar nada y hay que re-analizar. Bloquea las filas (FOR UPDATE) antes de
-- verificar, y al final vuelve a comprobar que lo unico que cambio son esos valores
-- (compara contra una foto previa de las filas y del lote).
--
-- Es idempotente por construccion: una segunda corrida ya no encuentra filas con
-- dosis 440 y aborta en la primera verificacion.
--
-- El script NO confirma por defecto: hace todo dentro de una transaccion y
-- termina en ROLLBACK para poder ensayarlo contra la base real. Para aplicarlo en
-- firme se corre igual pero con -v apply=1 (COMMIT). Antes de aplicar: backup con
-- scripts/backup-data.js.
--
-- Uso:
--   Ensayo:   psql "$DATABASE_URL" -f scripts/sql/corregir-dosis-y-consumo-aplicacion-success-neo-2026-10-11.sql
--   En firme: psql "$DATABASE_URL" -v apply=1 -f scripts/sql/corregir-dosis-y-consumo-aplicacion-success-neo-2026-10-11.sql
--
-- Variantes (se combinan con apply=1):
--   -v ajustar_stock=0   corrige dosis y consumo de la aplicacion pero NO mueve el stock del lote
--   -v con_cantidad=0    corrige solo la dosis (consumo y stock quedan intactos)
-- =============================================================================

\set ON_ERROR_STOP on

-- Sin -v apply=1 (o con cualquier valor que no sea verdadero) termina en ROLLBACK.
\if :{?apply}
\else
  \set apply 0
\endif

-- Por defecto se corrige tambien el consumo y se mueve el stock del lote.
\if :{?con_cantidad}
\else
  \set con_cantidad 1
\endif
\if :{?ajustar_stock}
\else
  \set ajustar_stock 1
\endif

\echo 'Modo:' 'apply =' :apply ', con_cantidad =' :con_cantidad ', ajustar_stock =' :ajustar_stock

BEGIN;

-- Si las filas estan bloqueadas preferimos fallar rapido antes que colgarnos.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'UTC';

-- -----------------------------------------------------------------------------
-- 0. Alcance
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _fix_params ON COMMIT DROP AS
SELECT '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
       '22G20789F0'::text                           AS numero_lote,
       'success%neo'::text                          AS quimico_like,
       440::numeric                                 AS dosis_vieja,
       400::numeric                                 AS dosis_nueva,
       'mL/Ha'::quimico_rate_unidad                 AS dosis_unidad,
       timestamptz '2026-10-10 12:00:00+00'         AS desde,
       timestamptz '2026-10-11 20:00:00+00'         AS hasta,
       279                                          AS mesas_esperadas,
       'Tunnel 2=78, Tunnel 3=78, Tunnel 4=78, Tunnel 5=38, Tunnel 6=7'::text AS tuneles_esperados,
       -- Consumo: el total que muestra la UI (puede venir redondeado a 3 decimales)
       -- y el total correcto.
       0.116::numeric                               AS cantidad_vista,
       0.0005::numeric                              AS cantidad_tolerancia,
       0.163::numeric                               AS cantidad_nueva_total,
       :'con_cantidad'::text                        AS con_cantidad,
       :'ajustar_stock'::text                       AS ajustar_stock;

DO $$
BEGIN
  IF (SELECT con_cantidad FROM _fix_params) NOT IN ('0', '1')
     OR (SELECT ajustar_stock FROM _fix_params) NOT IN ('0', '1') THEN
    RAISE EXCEPTION 'con_cantidad y ajustar_stock solo admiten 0 o 1 (llegaron: [%] y [%])',
      (SELECT con_cantidad FROM _fix_params), (SELECT ajustar_stock FROM _fix_params);
  END IF;
END $$;

-- Las filas fisicas de la aplicacion (un operation_group puede tener varias).
CREATE TEMP TABLE _fix_apps ON COMMIT DROP AS
SELECT a.id, a.lote_quimico_id, coalesce(a.operation_group_id, a.id) AS grupo
  FROM aplicaciones_quimicas a
  JOIN lotes_quimicos lq ON lq.id = a.lote_quimico_id
  CROSS JOIN _fix_params p
 WHERE a.tenant_id = p.tenant_id
   AND a.contexto = 'greenhouse'
   AND lq.numero_lote = p.numero_lote
   AND a.dosis = p.dosis_vieja
   AND a.dosis_unidad = p.dosis_unidad
   AND a.fecha_hora >= p.desde
   AND a.fecha_hora <  p.hasta;

-- Bloquea lo que se va a tocar mientras dura la transaccion; las guardas de
-- abajo releen ya con el lock, asi nadie puede cambiarlo entre verificar y
-- actualizar.
SELECT count(*) AS filas_bloqueadas
  FROM (SELECT 1 FROM aplicaciones_quimicas
         WHERE id IN (SELECT id FROM _fix_apps) ORDER BY id FOR UPDATE) s;

SELECT count(*) AS detalles_bloqueados
  FROM (SELECT 1 FROM aplicaciones_quimicas_detalle
         WHERE aplicacion_id IN (SELECT id FROM _fix_apps) ORDER BY id FOR UPDATE) s;

SELECT count(*) AS eventos_bloqueados
  FROM (SELECT 1 FROM historial_mesa
         WHERE tenant_id = (SELECT tenant_id FROM _fix_params)
           AND tipo_evento = 'aplicacion_quimica'
           AND detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps)
         ORDER BY id FOR UPDATE) s;

-- El stock del lote se mueve con una resta relativa; se bloquea para que nadie
-- lo cambie entre las verificaciones y el UPDATE.
SELECT count(*) AS lotes_bloqueados
  FROM (SELECT 1 FROM lotes_quimicos
         WHERE id IN (SELECT lote_quimico_id FROM _fix_apps) ORDER BY id FOR UPDATE) s;

-- Reparto del consumo nuevo entre las tandas (vacia con -v con_cantidad=0).
CREATE TEMP TABLE _fix_cant ON COMMIT DROP AS
WITH det AS (
  SELECT d.aplicacion_id, d.id AS detalle_id, d.cantidad AS vieja,
         sum(d.cantidad) OVER () AS total_viejo
    FROM aplicaciones_quimicas_detalle d
   WHERE d.aplicacion_id IN (SELECT id FROM _fix_apps)
), prop AS (
  SELECT det.aplicacion_id, det.detalle_id, det.vieja, det.total_viejo,
         p.cantidad_nueva_total AS total_nuevo,
         round(det.vieja * p.cantidad_nueva_total / nullif(det.total_viejo, 0), 6) AS prop
    FROM det CROSS JOIN _fix_params p
   WHERE p.con_cantidad = '1'
)
SELECT aplicacion_id, detalle_id, vieja, total_viejo, total_nuevo,
       prop + CASE WHEN row_number() OVER (ORDER BY vieja DESC, aplicacion_id) = 1
                   THEN total_nuevo - sum(prop) OVER ()
                   ELSE 0 END AS nueva
  FROM prop;

-- Lo que se encontro (para revisarlo a ojo contra la UI aunque despues falle una guarda).
SELECT 'FILA' AS que, a.id, a.operation_group_id, a.fecha_hora,
       concat_ws(' ', a.usuario_nombre_snapshot, a.usuario_apellido_snapshot) AS aplicada_por,
       q.nombre AS quimico, lq.numero_lote AS lote, pr.nombre AS proveedor,
       a.dosis, a.dosis_unidad, a.withholding_period_dias AS whp, d.cantidad,
       (SELECT count(*) FROM aplicacion_quimica_mesa m WHERE m.aplicacion_id = a.id) AS mesas
  FROM _fix_apps f
  JOIN aplicaciones_quimicas a ON a.id = f.id
  JOIN lotes_quimicos lq ON lq.id = a.lote_quimico_id
  JOIN quimicos q ON q.id = lq.quimico_id
  LEFT JOIN proveedores pr ON pr.id = lq.proveedor_id
  LEFT JOIN aplicaciones_quimicas_detalle d ON d.aplicacion_id = a.id
 ORDER BY a.fecha_hora, a.id;

SELECT 'TUNELES' AS que, t.nombre, count(*) AS mesas
  FROM aplicacion_quimica_mesa aqm
  JOIN _fix_apps f ON f.id = aqm.aplicacion_id
  JOIN mesas m ON m.id = aqm.mesa_id
  JOIN tuneles t ON t.id = m.tunel_id
 GROUP BY t.nombre
 ORDER BY t.nombre;

SELECT 'TOTAL' AS que,
       (SELECT count(*) FROM _fix_apps) AS filas_fisicas,
       (SELECT sum(d.cantidad) FROM aplicaciones_quimicas_detalle d
         WHERE d.aplicacion_id IN (SELECT id FROM _fix_apps)) AS consumo_total_guardado;

-- Como quedaria el consumo de cada tanda (solo con -v con_cantidad=1).
SELECT 'CONSUMO' AS que, c.aplicacion_id, c.vieja AS cantidad_actual, c.nueva AS cantidad_nueva,
       (SELECT count(*) FROM aplicacion_quimica_mesa m WHERE m.aplicacion_id = c.aplicacion_id) AS mesas
  FROM _fix_cant c
 ORDER BY c.vieja DESC, c.aplicacion_id;

SELECT 'CONSUMO_TOTAL' AS que, c.total_viejo AS guardado, p.cantidad_vista AS visto_en_la_ui,
       c.total_nuevo AS nuevo, c.total_nuevo - c.total_viejo AS diferencia
  FROM (SELECT DISTINCT total_viejo, total_nuevo FROM _fix_cant) c
  CROSS JOIN _fix_params p;

-- El lote y como quedaria su stock.
SELECT 'LOTE' AS que, lq.id, lq.numero_lote, lq.cantidad_inicial, lq.cantidad_actual AS stock_actual,
       lq.cantidad_actual - CASE WHEN p.ajustar_stock = '1'
                                 THEN coalesce((SELECT max(total_nuevo - total_viejo) FROM _fix_cant), 0)
                                 ELSE 0 END AS stock_nuevo
  FROM lotes_quimicos lq
  CROSS JOIN _fix_params p
 WHERE lq.id IN (SELECT lote_quimico_id FROM _fix_apps);

-- -----------------------------------------------------------------------------
-- 1. Guardas: el estado tiene que ser exactamente el analizado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant  uuid;
  v_vieja   numeric;
  v_unidad  quimico_rate_unidad;
  v_like    text;
  v_mesas   int;
  v_tuneles text;
  v_filas   int;
  v_grupos  int;
  v_n       int;
  v_m       int;
  v_s       text;
BEGIN
  SELECT tenant_id, dosis_vieja, dosis_unidad, quimico_like, mesas_esperadas, tuneles_esperados
    INTO v_tenant, v_vieja, v_unidad, v_like, v_mesas, v_tuneles
    FROM _fix_params;

  -- Encabezados: una unica operacion, un unico lote.
  SELECT count(*), count(DISTINCT grupo) INTO v_filas, v_grupos FROM _fix_apps;
  IF v_filas = 0 THEN
    RAISE EXCEPTION 'No se encontro ninguna aplicacion candidata (lote %, dosis % %, invernadero, entre % y %): revisar la ventana de fecha_hora o si ya se corrigio',
      (SELECT numero_lote FROM _fix_params), v_vieja, v_unidad,
      (SELECT desde FROM _fix_params), (SELECT hasta FROM _fix_params);
  END IF;
  IF v_grupos <> 1 THEN
    RAISE EXCEPTION 'Las % filas candidatas pertenecen a % operaciones distintas (se esperaba 1): %',
      v_filas, v_grupos, (SELECT string_agg(DISTINCT grupo::text, ', ') FROM _fix_apps);
  END IF;
  IF (SELECT count(DISTINCT lote_quimico_id) FROM _fix_apps) <> 1 THEN
    RAISE EXCEPTION 'Las filas candidatas usan mas de un lote_quimico_id con ese numero de lote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _fix_apps f
                   JOIN lotes_quimicos lq ON lq.id = f.lote_quimico_id
                   JOIN quimicos q ON q.id = lq.quimico_id
                  WHERE q.nombre ILIKE '%' || v_like || '%') THEN
    RAISE EXCEPTION 'El quimico del lote no es Success Neo (es: %)',
      (SELECT string_agg(DISTINCT q.nombre, ', ') FROM _fix_apps f
         JOIN lotes_quimicos lq ON lq.id = f.lote_quimico_id JOIN quimicos q ON q.id = lq.quimico_id);
  END IF;

  -- Las filas siguen como las vimos (ya con el lock tomado).
  IF (SELECT count(*) FROM aplicaciones_quimicas a
        JOIN _fix_apps f ON f.id = a.id
       WHERE a.tenant_id = v_tenant AND a.contexto = 'greenhouse'
         AND a.dosis = v_vieja AND a.dosis_unidad = v_unidad
         AND a.lote_quimico_id = f.lote_quimico_id) <> v_filas THEN
    RAISE EXCEPTION 'Alguna fila cambio entre la identificacion y el bloqueo; reintentar';
  END IF;
  IF EXISTS (SELECT 1 FROM aplicacion_quimica_bandeja WHERE aplicacion_id IN (SELECT id FROM _fix_apps)) THEN
    RAISE EXCEPTION 'Alguna fila tiene bandejas vinculadas (no es una aplicacion de invernadero pura)';
  END IF;

  -- Detalle: exactamente 1 linea por tanda (sin quimicos adicionales), la del
  -- mismo lote y la misma dosis que el encabezado.
  IF EXISTS (SELECT 1 FROM _fix_apps f
              WHERE (SELECT count(*) FROM aplicaciones_quimicas_detalle d WHERE d.aplicacion_id = f.id) <> 1) THEN
    RAISE EXCEPTION 'Alguna tanda no tiene exactamente 1 linea de detalle (hay quimicos adicionales o falta la linea)';
  END IF;
  IF EXISTS (SELECT 1 FROM _fix_apps f
               JOIN aplicaciones_quimicas_detalle d ON d.aplicacion_id = f.id
              WHERE d.lote_quimico_id <> f.lote_quimico_id
                 OR d.dosis IS DISTINCT FROM v_vieja
                 OR d.dosis_unidad IS DISTINCT FROM v_unidad) THEN
    RAISE EXCEPTION 'La linea de detalle no coincide con el encabezado (lote/dosis/unidad)';
  END IF;

  -- Mesas: 279 distintas, cada una en una sola tanda, con el reparto por tunel de la UI.
  SELECT count(*), count(DISTINCT aqm.mesa_id) INTO v_n, v_m
    FROM aplicacion_quimica_mesa aqm JOIN _fix_apps f ON f.id = aqm.aplicacion_id;
  IF v_n <> v_mesas OR v_m <> v_mesas THEN
    RAISE EXCEPTION 'Se esperaban % mesas distintas, una vez cada una; hay % vinculos y % mesas distintas',
      v_mesas, v_n, v_m;
  END IF;
  SELECT string_agg(x.nombre || '=' || x.n, ', ' ORDER BY x.nombre) INTO v_s
    FROM (SELECT t.nombre, count(*) AS n
            FROM aplicacion_quimica_mesa aqm
            JOIN _fix_apps f ON f.id = aqm.aplicacion_id
            JOIN mesas m ON m.id = aqm.mesa_id
            JOIN tuneles t ON t.id = m.tunel_id
           GROUP BY t.nombre) x;
  IF v_s IS DISTINCT FROM v_tuneles THEN
    RAISE EXCEPTION 'El reparto por tunel no es el de la UI. Esperado: [%] - encontrado: [%]', v_tuneles, v_s;
  END IF;

  -- Historial: 1 evento `aplicacion_quimica` por mesa vinculada, con la dosis
  -- vieja como numero y sin quimicos adicionales.
  SELECT count(*), count(DISTINCT h.mesa_id) INTO v_n, v_m
    FROM historial_mesa h
   WHERE h.tenant_id = v_tenant AND h.tipo_evento = 'aplicacion_quimica'
     AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps);
  IF v_n <> v_mesas OR v_m <> v_mesas THEN
    RAISE EXCEPTION 'Se esperaban % eventos de historial (uno por mesa); hay % eventos en % mesas distintas',
      v_mesas, v_n, v_m;
  END IF;
  IF EXISTS (SELECT h.mesa_id FROM historial_mesa h
              WHERE h.tenant_id = v_tenant AND h.tipo_evento = 'aplicacion_quimica'
                AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps)
             EXCEPT
             SELECT aqm.mesa_id FROM aplicacion_quimica_mesa aqm JOIN _fix_apps f ON f.id = aqm.aplicacion_id)
     OR EXISTS (SELECT aqm.mesa_id FROM aplicacion_quimica_mesa aqm JOIN _fix_apps f ON f.id = aqm.aplicacion_id
                EXCEPT
                SELECT h.mesa_id FROM historial_mesa h
                 WHERE h.tenant_id = v_tenant AND h.tipo_evento = 'aplicacion_quimica'
                   AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps)) THEN
    RAISE EXCEPTION 'Las mesas de los eventos de historial no coinciden con las mesas vinculadas';
  END IF;
  IF EXISTS (SELECT 1 FROM historial_mesa h
              WHERE h.tenant_id = v_tenant AND h.tipo_evento = 'aplicacion_quimica'
                AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps)
                AND (h.detalle->'dosis' IS DISTINCT FROM to_jsonb(v_vieja)
                     OR jsonb_array_length(coalesce(h.detalle->'quimicos_adicionales', '[]'::jsonb)) <> 0)) THEN
    RAISE EXCEPTION 'Algun evento de historial no tiene dosis numerica % o tiene quimicos adicionales', v_vieja;
  END IF;

  RAISE NOTICE 'Guardas OK: % tandas, 1 operacion, % mesas, % eventos de historial, dosis % %',
    v_filas, v_mesas, v_mesas, v_vieja, v_unidad;
END $$;

-- Guardas del consumo y del stock (se omiten con -v con_cantidad=0).
DO $$
DECLARE
  v_tenant  uuid;
  v_vista   numeric;
  v_tol     numeric;
  v_nueva   numeric;
  v_ajustar boolean;
  v_total   numeric;
  v_delta   numeric;
  v_lote    uuid;
  v_stock   numeric;
BEGIN
  IF (SELECT con_cantidad FROM _fix_params) <> '1' THEN
    RAISE NOTICE 'Consumo y stock: omitidos (con_cantidad=0), solo se corrige la dosis';
    RETURN;
  END IF;

  SELECT tenant_id, cantidad_vista, cantidad_tolerancia, cantidad_nueva_total, ajustar_stock = '1'
    INTO v_tenant, v_vista, v_tol, v_nueva, v_ajustar
    FROM _fix_params;

  -- Un reparto por tanda, todo en litros (la UI muestra L).
  IF (SELECT count(*) FROM _fix_cant) <> (SELECT count(*) FROM _fix_apps) THEN
    RAISE EXCEPTION 'No se pudo calcular el reparto del consumo por tanda';
  END IF;
  IF EXISTS (SELECT 1 FROM _fix_apps f
               JOIN aplicaciones_quimicas_detalle d ON d.aplicacion_id = f.id
              WHERE lower(d.unidad_medida) <> 'l') THEN
    RAISE EXCEPTION 'La unidad de la linea de detalle no es litros (es: %)',
      (SELECT string_agg(DISTINCT d.unidad_medida, ', ') FROM _fix_apps f
         JOIN aplicaciones_quimicas_detalle d ON d.aplicacion_id = f.id);
  END IF;

  -- El total guardado es el que muestra la UI (que puede mostrarlo redondeado).
  SELECT total_viejo INTO v_total FROM _fix_cant LIMIT 1;
  IF v_total IS NULL OR abs(v_total - v_vista) > v_tol THEN
    RAISE EXCEPTION 'El consumo total guardado (%) no coincide con el de la UI (% +/- %)',
      v_total, v_vista, v_tol;
  END IF;

  -- El reparto es valido: cada tanda con algo de consumo y la suma exacta.
  IF v_nueva <= 0
     OR EXISTS (SELECT 1 FROM _fix_cant WHERE nueva IS NULL OR nueva <= 0)
     OR (SELECT sum(nueva) FROM _fix_cant) IS DISTINCT FROM v_nueva THEN
    RAISE EXCEPTION 'El reparto del consumo nuevo (%) no es valido: %',
      v_nueva, (SELECT string_agg(nueva::text, ' + ') FROM _fix_cant);
  END IF;

  -- Cada evento de historial lleva la cantidad de SU tanda.
  IF EXISTS (SELECT 1 FROM historial_mesa h
               JOIN _fix_cant c ON c.aplicacion_id::text = h.detalle->>'aplicacion_id'
              WHERE h.tenant_id = v_tenant AND h.tipo_evento = 'aplicacion_quimica'
                AND NOT (CASE WHEN jsonb_typeof(h.detalle->'cantidad') = 'number'
                              THEN (h.detalle->>'cantidad')::numeric = c.vieja
                              ELSE false END)) THEN
    RAISE EXCEPTION 'Algun evento de historial no tiene la cantidad numerica de su tanda';
  END IF;

  -- Stock: el lote tiene que existir, ser del tenant y alcanzar para la diferencia.
  IF v_ajustar THEN
    SELECT lote_quimico_id INTO v_lote FROM _fix_apps LIMIT 1;
    SELECT l.cantidad_actual INTO v_stock
      FROM lotes_quimicos l
     WHERE l.id = v_lote AND l.tenant_id = v_tenant AND l.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El lote % no existe, esta borrado o no es del tenant', v_lote;
    END IF;
    v_delta := v_nueva - v_total;
    IF v_delta > 0 AND v_stock < v_delta THEN
      RAISE EXCEPTION 'El lote no tiene stock para la diferencia: tiene %, hay que descontar % mas',
        v_stock, v_delta;
    END IF;
  END IF;

  RAISE NOTICE 'Guardas del consumo OK: % -> % L (diferencia %), stock del lote %',
    v_total, v_nueva, v_nueva - v_total,
    CASE WHEN v_ajustar THEN 'se ajusta' ELSE 'NO se toca' END;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Foto previa (para comprobar al final que solo cambiaron esos valores)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _fix_snap_aq ON COMMIT DROP AS
SELECT a.id, to_jsonb(a) - 'dosis' AS resto
  FROM aplicaciones_quimicas a
 WHERE a.id IN (SELECT id FROM _fix_apps);

CREATE TEMP TABLE _fix_snap_det ON COMMIT DROP AS
SELECT d.id, d.cantidad, to_jsonb(d) - 'dosis' - 'cantidad' AS resto
  FROM aplicaciones_quimicas_detalle d
 WHERE d.aplicacion_id IN (SELECT id FROM _fix_apps);

CREATE TEMP TABLE _fix_snap_hist ON COMMIT DROP AS
SELECT h.id, h.detalle->>'aplicacion_id' AS aplicacion_id, h.detalle->'cantidad' AS cantidad,
       to_jsonb(h) - 'detalle' AS resto, h.detalle - 'dosis' - 'cantidad' AS detalle_resto
  FROM historial_mesa h
 WHERE h.tenant_id = (SELECT tenant_id FROM _fix_params)
   AND h.tipo_evento = 'aplicacion_quimica'
   AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps);

CREATE TEMP TABLE _fix_snap_lote ON COMMIT DROP AS
SELECT l.id, l.cantidad_actual, to_jsonb(l) - 'cantidad_actual' AS resto
  FROM lotes_quimicos l
 WHERE l.id IN (SELECT lote_quimico_id FROM _fix_apps);

-- -----------------------------------------------------------------------------
-- 3. Correccion: solo esos valores
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_tenant   uuid;
  v_nueva    numeric;
  v_mesas    int;
  v_filas    int := (SELECT count(*) FROM _fix_apps);
  v_con_cant boolean;
  v_ajustar  boolean;
  v_delta    numeric;
  v_n        int;
BEGIN
  SELECT tenant_id, dosis_nueva, mesas_esperadas, con_cantidad = '1', ajustar_stock = '1'
    INTO v_tenant, v_nueva, v_mesas, v_con_cant, v_ajustar
    FROM _fix_params;

  -- 3.1 Dosis
  UPDATE aplicaciones_quimicas SET dosis = v_nueva
   WHERE id IN (SELECT id FROM _fix_apps);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_filas THEN
    RAISE EXCEPTION 'aplicaciones_quimicas: se actualizaron % filas, se esperaban %', v_n, v_filas;
  END IF;

  UPDATE aplicaciones_quimicas_detalle d SET dosis = v_nueva
    FROM _fix_apps f
   WHERE d.aplicacion_id = f.id AND d.lote_quimico_id = f.lote_quimico_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_filas THEN
    RAISE EXCEPTION 'aplicaciones_quimicas_detalle: se actualizaron % filas, se esperaban %', v_n, v_filas;
  END IF;

  UPDATE historial_mesa h SET detalle = jsonb_set(h.detalle, '{dosis}', to_jsonb(v_nueva))
   WHERE h.tenant_id = v_tenant
     AND h.tipo_evento = 'aplicacion_quimica'
     AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_mesas THEN
    RAISE EXCEPTION 'historial_mesa: se actualizaron % eventos, se esperaban %', v_n, v_mesas;
  END IF;

  -- 3.2 Consumo y stock
  IF v_con_cant THEN
    UPDATE aplicaciones_quimicas_detalle d SET cantidad = c.nueva
      FROM _fix_cant c
     WHERE d.id = c.detalle_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> v_filas THEN
      RAISE EXCEPTION 'aplicaciones_quimicas_detalle (cantidad): se actualizaron % filas, se esperaban %', v_n, v_filas;
    END IF;

    UPDATE historial_mesa h
       SET detalle = jsonb_set(h.detalle, '{cantidad}', to_jsonb(trim_scale(c.nueva)))
      FROM _fix_cant c
     WHERE h.tenant_id = v_tenant
       AND h.tipo_evento = 'aplicacion_quimica'
       AND h.detalle->>'aplicacion_id' = c.aplicacion_id::text;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> v_mesas THEN
      RAISE EXCEPTION 'historial_mesa (cantidad): se actualizaron % eventos, se esperaban %', v_n, v_mesas;
    END IF;

    IF v_ajustar THEN
      v_delta := (SELECT max(total_nuevo - total_viejo) FROM _fix_cant);
      UPDATE lotes_quimicos SET cantidad_actual = cantidad_actual - v_delta
       WHERE id IN (SELECT lote_quimico_id FROM _fix_apps) AND tenant_id = v_tenant;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'lotes_quimicos: se actualizaron % filas, se esperaba 1', v_n;
      END IF;
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Verificacion del resultado (si falla, se deshace todo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_nueva    numeric := (SELECT dosis_nueva FROM _fix_params);
  v_con_cant boolean := (SELECT con_cantidad = '1' FROM _fix_params);
  v_ajustar  boolean := (SELECT ajustar_stock = '1' FROM _fix_params);
  v_delta    numeric := coalesce((SELECT max(total_nuevo - total_viejo) FROM _fix_cant), 0);
BEGIN
  IF (SELECT count(*) FROM _fix_snap_aq) <> (SELECT count(*) FROM _fix_apps)
     OR EXISTS (SELECT 1 FROM _fix_snap_aq s
                  LEFT JOIN aplicaciones_quimicas a ON a.id = s.id
                 WHERE a.id IS NULL
                    OR a.dosis IS DISTINCT FROM v_nueva
                    OR (to_jsonb(a) - 'dosis') IS DISTINCT FROM s.resto) THEN
    RAISE EXCEPTION 'Post: aplicaciones_quimicas no quedo con la dosis nueva y todo lo demas igual';
  END IF;

  -- Detalle: dosis nueva; cantidad nueva (o la de antes con con_cantidad=0); lo demas igual.
  IF (SELECT count(*) FROM _fix_snap_det) <> (SELECT count(*) FROM _fix_apps)
     OR EXISTS (SELECT 1 FROM _fix_snap_det s
                  LEFT JOIN aplicaciones_quimicas_detalle d ON d.id = s.id
                  LEFT JOIN _fix_cant c ON c.detalle_id = s.id
                 WHERE d.id IS NULL
                    OR d.dosis IS DISTINCT FROM v_nueva
                    OR d.cantidad IS DISTINCT FROM coalesce(c.nueva, s.cantidad)
                    OR (to_jsonb(d) - 'dosis' - 'cantidad') IS DISTINCT FROM s.resto) THEN
    RAISE EXCEPTION 'Post: aplicaciones_quimicas_detalle no quedo como se esperaba (dosis, cantidad y lo demas igual)';
  END IF;

  -- Historial: cada evento con la dosis nueva y la cantidad de su tanda; lo demas igual.
  IF (SELECT count(*) FROM _fix_snap_hist) <> (SELECT mesas_esperadas FROM _fix_params)
     OR EXISTS (SELECT 1 FROM _fix_snap_hist s
                  LEFT JOIN historial_mesa h ON h.id = s.id
                  LEFT JOIN _fix_cant c ON c.aplicacion_id::text = s.aplicacion_id
                 WHERE h.id IS NULL
                    OR h.detalle->'dosis' IS DISTINCT FROM to_jsonb(v_nueva)
                    OR h.detalle->'cantidad' IS DISTINCT FROM coalesce(to_jsonb(trim_scale(c.nueva)), s.cantidad)
                    OR (to_jsonb(h) - 'detalle') IS DISTINCT FROM s.resto
                    OR (h.detalle - 'dosis' - 'cantidad') IS DISTINCT FROM s.detalle_resto) THEN
    RAISE EXCEPTION 'Post: historial_mesa no quedo como se esperaba (dosis, cantidad y lo demas igual)';
  END IF;

  -- Lote: stock bajo exactamente la diferencia (o quedo igual) y nada mas cambio.
  IF EXISTS (SELECT 1 FROM _fix_snap_lote s
               LEFT JOIN lotes_quimicos l ON l.id = s.id
              WHERE l.id IS NULL
                 OR l.cantidad_actual IS DISTINCT FROM
                    s.cantidad_actual - CASE WHEN v_con_cant AND v_ajustar THEN v_delta ELSE 0 END
                 OR (to_jsonb(l) - 'cantidad_actual') IS DISTINCT FROM s.resto) THEN
    RAISE EXCEPTION 'Post: lotes_quimicos no quedo como se esperaba (stock y lo demas igual)';
  END IF;

  IF v_con_cant
     AND (SELECT sum(cantidad) FROM aplicaciones_quimicas_detalle
           WHERE aplicacion_id IN (SELECT id FROM _fix_apps))
         IS DISTINCT FROM (SELECT cantidad_nueva_total FROM _fix_params) THEN
    RAISE EXCEPTION 'Post: el consumo total no suma el valor nuevo';
  END IF;

  RAISE NOTICE 'Verificacion final OK: dosis de % a %; consumo %; stock del lote %',
    (SELECT dosis_vieja FROM _fix_params), v_nueva,
    CASE WHEN v_con_cant THEN 'corregido' ELSE 'sin cambios' END,
    CASE WHEN v_con_cant AND v_ajustar THEN 'ajustado' ELSE 'sin cambios' END;
END $$;

SELECT 'DESPUES' AS que, 'aplicaciones_quimicas' AS tabla, count(*) AS filas,
       string_agg(DISTINCT dosis::text, ', ') AS dosis, NULL::text AS cantidad
  FROM aplicaciones_quimicas WHERE id IN (SELECT id FROM _fix_apps)
UNION ALL
SELECT 'DESPUES', 'aplicaciones_quimicas_detalle', count(*),
       string_agg(DISTINCT dosis::text, ', '), sum(cantidad)::text
  FROM aplicaciones_quimicas_detalle WHERE aplicacion_id IN (SELECT id FROM _fix_apps)
UNION ALL
SELECT 'DESPUES', 'historial_mesa', count(*),
       string_agg(DISTINCT h.detalle->>'dosis', ', '),
       string_agg(DISTINCT h.detalle->>'cantidad', ' | ')
  FROM historial_mesa h
 WHERE h.tenant_id = (SELECT tenant_id FROM _fix_params)
   AND h.tipo_evento = 'aplicacion_quimica'
   AND h.detalle->>'aplicacion_id' IN (SELECT id::text FROM _fix_apps)
UNION ALL
SELECT 'DESPUES', 'lotes_quimicos (stock)', count(*), NULL, string_agg(cantidad_actual::text, ', ')
  FROM lotes_quimicos WHERE id IN (SELECT lote_quimico_id FROM _fix_apps);

-- -----------------------------------------------------------------------------
-- 5. Cierre: COMMIT solo con -v apply=1; si no, ROLLBACK (ensayo).
-- -----------------------------------------------------------------------------
\if :apply
  COMMIT;
  \echo 'COMMIT: la correccion quedo aplicada en la base.'
\else
  ROLLBACK;
  \echo 'ROLLBACK (ensayo): no se cambio nada. Para aplicar en firme repetir con -v apply=1'
\endif
