-- =============================================================================
-- RESET del tenant de PRODUCCION  (00000000-0000-0000-0000-000000000001)
-- =============================================================================
-- Devuelve el tenant de produccion al estado en que quedo despues del reset del
-- 2026-08-16 + la carga INIT: 1 establecimiento, 6 tuneles, 732 mesas
-- posicionadas segun el numero de su nombre, el catalogo INIT, los 3 lotes INIT
-- y 2 usuarios.
--
-- DIFERENCIA CLAVE CON scripts/sql/reset-produccion.sql (el de agosto): aquel
-- borraba con DELETE sin WHERE. Desde que existe el tenant de pruebas
-- (00000000-0000-0000-0000-000000000002) eso vaciaria los dos tenants. Aca cada
-- borrado esta acotado al tenant de produccion, sea por su columna tenant_id o
-- por el padre en las tablas puente, que no la tienen.
--
--   BORRA    : cosechas, packing, quimicos y aplicaciones, siembras, bandejas,
--              trasplantes e historial, tareas, audit_logs, refresh_tokens,
--              el catalogo y los lotes que NO son INIT, y los 2 usuarios que
--              estaban borrados en soft desde el 2026-08-16.
--   CONSERVA : establecimiento, tuneles, mesas (id y codigo_qr intactos: los QR
--              ya estan impresos), el catalogo INIT, los 3 lotes INIT, los
--              usuarios admin@agrisano.com y user@agrisano.com, los roles
--              (son globales) y EL TENANT DE PRUEBAS ENTERO.
--
-- Las bandejas, siembras y trasplantes INIT tambien se borran: las posiciones
-- del Tunnel 1 quedaron corridas por las 2 cosechas y 6 mesas tienen bandejas
-- de mas, asi que las mesas se resetean y se vuelven a posicionar corriendo
-- despues `node scripts/seed-init-trasplante.js`. Los catalogos y lotes INIT se
-- conservan justamente para que ese script los reutilice.
--
-- SEGURIDAD: al final compara el tenant de pruebas contra el snapshot tomado al
-- principio y aborta la transaccion si cambio aunque sea una fila.
--
-- El script NO confirma por defecto: termina en ROLLBACK para poder ensayarlo.
-- Cambiar el ROLLBACK final por COMMIT para aplicarlo en firme.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/reset-tenant-produccion.sql
-- =============================================================================

\set ON_ERROR_STOP on
\set TEN_PROD '00000000-0000-0000-0000-000000000001'
\set TEN_TEST '00000000-0000-0000-0000-000000000002'

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Snapshot del tenant de pruebas, para verificar al final que no se toco.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _snap_test ON COMMIT DROP AS
SELECT 'establecimientos' AS tabla, count(*) AS filas FROM establecimientos WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'tuneles',        count(*) FROM tuneles               WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'mesas',          count(*) FROM mesas                 WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'lotes',          count(*) FROM lotes                 WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'productos',      count(*) FROM productos             WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'variedades',     count(*) FROM variedades            WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'marcas',         count(*) FROM marcas                WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'proveedores',    count(*) FROM proveedores           WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'siembras',       count(*) FROM siembras              WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'bandejas',       count(*) FROM bandejas              WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa        WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'cosechas',       count(*) FROM cosechas              WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'quimicos',       count(*) FROM quimicos              WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos        WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'aplicaciones_quimicas', count(*) FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'lotes_packing',  count(*) FROM lotes_packing         WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'tareas',         count(*) FROM tareas                WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'users',          count(*) FROM users                 WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs            WHERE tenant_id = :'TEN_TEST'
UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens        WHERE tenant_id = :'TEN_TEST'
-- Las tablas puente no tienen tenant_id: se cuentan por el padre.
UNION ALL SELECT 'mesa_bandeja',   count(*) FROM mesa_bandeja mb
   WHERE mb.mesa_id IN (SELECT id FROM mesas WHERE tenant_id = :'TEN_TEST')
UNION ALL SELECT 'usuario_establecimiento', count(*) FROM usuario_establecimiento ue
   WHERE ue.user_id IN (SELECT id FROM users WHERE tenant_id = :'TEN_TEST')
UNION ALL SELECT 'principios_activos', count(*) FROM principios_activos;

\echo ''
\echo '=== ANTES: filas del tenant de PRODUCCION que se van a borrar ==='
SELECT 'cosechas' AS tabla, count(*) AS filas FROM cosechas WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'aplicaciones_quimicas', count(*) FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'quimicos',       count(*) FROM quimicos       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'siembras',       count(*) FROM siembras       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'bandejas',       count(*) FROM bandejas       WHERE tenant_id = :'TEN_PROD'
-- bandeja_descartes.tenant_id es nullable: se acota por las dos puntas, igual
-- que mesa_bandeja, para no dejar afuera ninguna constancia del tenant.
UNION ALL SELECT 'bandeja_descartes', count(*) FROM bandeja_descartes bd
   WHERE bd.tenant_id = :'TEN_PROD'
      OR bd.bandeja_id IN (SELECT id FROM bandejas WHERE tenant_id = :'TEN_PROD')
UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'tareas',         count(*) FROM tareas         WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs     WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'lotes NO init',       count(*) FROM lotes       WHERE tenant_id = :'TEN_PROD' AND numero_lote NOT LIKE 'INIT%'
UNION ALL SELECT 'variedades NO init',  count(*) FROM variedades  WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%'
UNION ALL SELECT 'productos NO init',   count(*) FROM productos   WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%'
UNION ALL SELECT 'marcas NO init',      count(*) FROM marcas      WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%'
UNION ALL SELECT 'proveedores NO init', count(*) FROM proveedores WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%'
ORDER BY 1;

\echo ''
\echo '=== ANTES: catalogo INIT que se CONSERVA (esperado: 4 filas + 3 lotes) ==='
SELECT 'proveedor' AS tipo, nombre AS valor, activo, deleted_at FROM proveedores WHERE tenant_id = :'TEN_PROD' AND nombre LIKE 'INIT%'
UNION ALL SELECT 'marca',    nombre,      activo, deleted_at FROM marcas     WHERE tenant_id = :'TEN_PROD' AND nombre      LIKE 'INIT%'
UNION ALL SELECT 'producto', nombre,      activo, deleted_at FROM productos  WHERE tenant_id = :'TEN_PROD' AND nombre      LIKE 'INIT%'
UNION ALL SELECT 'variedad', nombre,      activo, deleted_at FROM variedades WHERE tenant_id = :'TEN_PROD' AND nombre      LIKE 'INIT%'
UNION ALL SELECT 'lote',     numero_lote, activo, deleted_at FROM lotes      WHERE tenant_id = :'TEN_PROD' AND numero_lote LIKE 'INIT%'
ORDER BY 1, 2;

-- -----------------------------------------------------------------------------
-- 1. Packing (cuelga de cosechas).
-- -----------------------------------------------------------------------------
DELETE FROM lotes_packing_categorias
 WHERE lote_packing_id IN (SELECT id FROM lotes_packing WHERE tenant_id = :'TEN_PROD');
DELETE FROM lotes_packing WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 2. Cosechas.
-- -----------------------------------------------------------------------------
DELETE FROM cosechas WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 3. Aplicaciones quimicas y sus 3 tablas puente (sin tenant_id).
-- -----------------------------------------------------------------------------
DELETE FROM aplicacion_quimica_bandeja
 WHERE aplicacion_id IN (SELECT id FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD');
DELETE FROM aplicacion_quimica_mesa
 WHERE aplicacion_id IN (SELECT id FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD');
DELETE FROM aplicaciones_quimicas_detalle
 WHERE aplicacion_id IN (SELECT id FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD');
DELETE FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 4. Trasplantes e historial. mesa_bandeja no tiene tenant_id: se acota por las
--    dos puntas para barrer tambien cualquier fila huerfana.
-- -----------------------------------------------------------------------------
DELETE FROM mesa_bandeja
 WHERE mesa_id    IN (SELECT id FROM mesas    WHERE tenant_id = :'TEN_PROD')
    OR bandeja_id IN (SELECT id FROM bandejas WHERE tenant_id = :'TEN_PROD');
DELETE FROM historial_mesa WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 5. Bandejas y siembras (las INIT incluidas: se recrean con el seed).
--    Las constancias de descarte van primero: su FK a bandejas es
--    ON DELETE NO ACTION a proposito. Se acotan por las dos puntas porque
--    bandeja_descartes.tenant_id es nullable.
-- -----------------------------------------------------------------------------
DELETE FROM bandeja_descartes bd
 WHERE bd.tenant_id = :'TEN_PROD'
    OR bd.bandeja_id IN (SELECT id FROM bandejas WHERE tenant_id = :'TEN_PROD');
DELETE FROM bandejas WHERE tenant_id = :'TEN_PROD';
DELETE FROM siembras WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 6. Quimicos.
-- -----------------------------------------------------------------------------
DELETE FROM quimico_principio_activo
 WHERE quimico_id IN (SELECT id FROM quimicos WHERE tenant_id = :'TEN_PROD');
DELETE FROM lotes_quimicos WHERE tenant_id = :'TEN_PROD';
DELETE FROM quimicos       WHERE tenant_id = :'TEN_PROD';

-- principios_activos no tiene tenant_id: es una tabla global que comparten los
-- dos tenants. Se borran solo los que quedaron sin ningun quimico apuntandoles,
-- asi lo que use el tenant de pruebas queda intacto.
DELETE FROM principios_activos pa
 WHERE NOT EXISTS (
   SELECT 1 FROM quimico_principio_activo qpa WHERE qpa.principio_activo_id = pa.id
 );

-- -----------------------------------------------------------------------------
-- 7. Lotes y catalogo: se conserva todo lo que empieza con INIT.
-- -----------------------------------------------------------------------------
DELETE FROM lotes       WHERE tenant_id = :'TEN_PROD' AND numero_lote NOT LIKE 'INIT%';
DELETE FROM variedades  WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%';
DELETE FROM productos   WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%';
DELETE FROM marcas      WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%';
DELETE FROM proveedores WHERE tenant_id = :'TEN_PROD' AND nombre      NOT LIKE 'INIT%';

-- -----------------------------------------------------------------------------
-- 8. Tareas, auditoria y sesiones abiertas del tenant de produccion.
--    Borrar los refresh_tokens obliga a todos los usuarios a loguearse de nuevo.
-- -----------------------------------------------------------------------------
DELETE FROM tareas         WHERE tenant_id = :'TEN_PROD';
DELETE FROM audit_logs     WHERE tenant_id = :'TEN_PROD';
DELETE FROM refresh_tokens WHERE tenant_id = :'TEN_PROD';

-- -----------------------------------------------------------------------------
-- 9. Usuarios borrados en soft el 2026-08-16: se purgan de verdad.
--    user_roles y usuario_establecimiento caen por CASCADE.
--    Se exige deleted_at IS NOT NULL para no tocar un usuario activo si alguien
--    volviera a dar de alta esos mails.
-- -----------------------------------------------------------------------------
DELETE FROM users
 WHERE tenant_id = :'TEN_PROD'
   AND deleted_at IS NOT NULL
   AND email IN ('tobias@tobias.com', 'user@user.com');

-- -----------------------------------------------------------------------------
-- 10. Reactivar el catalogo y los lotes INIT: quedaron con activo = false y el
--     seed necesita poder sembrar con ellos.
-- -----------------------------------------------------------------------------
UPDATE proveedores SET activo = TRUE, deleted_at = NULL, updated_at = now()
 WHERE tenant_id = :'TEN_PROD' AND nombre LIKE 'INIT%';
UPDATE marcas      SET activo = TRUE, deleted_at = NULL, updated_at = now()
 WHERE tenant_id = :'TEN_PROD' AND nombre LIKE 'INIT%';
UPDATE productos   SET activo = TRUE, deleted_at = NULL, updated_at = now()
 WHERE tenant_id = :'TEN_PROD' AND nombre LIKE 'INIT%';
UPDATE variedades  SET activo = TRUE, deleted_at = NULL, updated_at = now()
 WHERE tenant_id = :'TEN_PROD' AND nombre LIKE 'INIT%';
-- Los lotes ademas quedan en estado 'consumido' cuando se agotan. El seed
-- siembra con el lote INIT de semilla, y /siembras rechaza con 422
-- LOTE_CONSUMIDO cualquier lote que no este 'habilitado', asi que hay que
-- limpiar tambien el consumo y sus snapshots de auditoria.
UPDATE lotes SET
  activo                              = TRUE,
  deleted_at                          = NULL,
  estado                              = 'habilitado',
  fecha_consumido                     = NULL,
  usuario_consumido_id                = NULL,
  usuario_consumido_email_snapshot    = NULL,
  usuario_consumido_nombre_snapshot   = NULL,
  usuario_consumido_apellido_snapshot = NULL,
  observaciones_consumo               = NULL,
  updated_at                          = now()
 WHERE tenant_id = :'TEN_PROD' AND numero_lote LIKE 'INIT%';

-- -----------------------------------------------------------------------------
-- 11. Reset de las mesas al estado "vacia y lista para trasplantar".
--     Segun trasplante.service.ts una mesa es trasplantable si
--     estado = 'activa' AND posicion_actual IS NULL.
--     No se borran ni recrean: se conserva id, codigo_qr (los QR ya estan
--     impresos), nombre, tunel_id y plantas_estimadas.
-- -----------------------------------------------------------------------------
UPDATE mesas SET
  estado                  = 'activa',
  posicion_actual         = NULL,
  fecha_ultimo_trasplante = NULL,
  carencia_hasta          = NULL,
  activo                  = TRUE,
  deleted_at              = NULL,
  updated_at              = now()
WHERE tenant_id = :'TEN_PROD';

-- =============================================================================
-- VERIFICACION - revisar esta salida ANTES de confirmar el COMMIT
-- =============================================================================
\echo ''
\echo '=== CONTROL: el tenant de PRUEBAS no se toco (todo debe decir OK) ==='
WITH ahora AS (
  SELECT 'establecimientos' AS tabla, count(*) AS filas FROM establecimientos WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'tuneles',        count(*) FROM tuneles               WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'mesas',          count(*) FROM mesas                 WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'lotes',          count(*) FROM lotes                 WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'productos',      count(*) FROM productos             WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'variedades',     count(*) FROM variedades            WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'marcas',         count(*) FROM marcas                WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'proveedores',    count(*) FROM proveedores           WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'siembras',       count(*) FROM siembras              WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'bandejas',       count(*) FROM bandejas              WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa        WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'cosechas',       count(*) FROM cosechas              WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'quimicos',       count(*) FROM quimicos              WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos        WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'aplicaciones_quimicas', count(*) FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'lotes_packing',  count(*) FROM lotes_packing         WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'tareas',         count(*) FROM tareas                WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'users',          count(*) FROM users                 WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs            WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens        WHERE tenant_id = :'TEN_TEST'
  UNION ALL SELECT 'mesa_bandeja',   count(*) FROM mesa_bandeja mb
     WHERE mb.mesa_id IN (SELECT id FROM mesas WHERE tenant_id = :'TEN_TEST')
  UNION ALL SELECT 'usuario_establecimiento', count(*) FROM usuario_establecimiento ue
     WHERE ue.user_id IN (SELECT id FROM users WHERE tenant_id = :'TEN_TEST')
  UNION ALL SELECT 'principios_activos', count(*) FROM principios_activos
)
SELECT s.tabla, s.filas AS antes, a.filas AS despues,
       CASE
         -- principios_activos es global (sin tenant_id) y no se cuenta por
         -- tenant: baja de forma esperada al limpiar los huerfanos. Lo que sigue
         -- usando el tenant de pruebas queda, porque el borrado exige que ningun
         -- quimico lo referencie.
         WHEN s.tabla = 'principios_activos' THEN
           CASE WHEN a.filas <= s.filas THEN 'OK (global, baja esperada)'
                ELSE '*** CAMBIO ***' END
         WHEN s.filas = a.filas THEN 'OK'
         ELSE '*** CAMBIO ***'
       END AS estado
  FROM _snap_test s
  JOIN ahora a USING (tabla)
 ORDER BY 1;

-- Aborta la transaccion si alguna tabla del tenant de pruebas cambio. El JOIN
-- deja afuera principios_activos a proposito, por lo explicado arriba.
DO $ctrl$
DECLARE dif int;
BEGIN
  SELECT count(*) INTO dif
    FROM _snap_test s
    JOIN (
      SELECT 'establecimientos' AS tabla, count(*) AS filas FROM establecimientos WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'tuneles',        count(*) FROM tuneles               WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'mesas',          count(*) FROM mesas                 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'lotes',          count(*) FROM lotes                 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'productos',      count(*) FROM productos             WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'variedades',     count(*) FROM variedades            WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'marcas',         count(*) FROM marcas                WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'proveedores',    count(*) FROM proveedores           WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'siembras',       count(*) FROM siembras              WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'bandejas',       count(*) FROM bandejas              WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa        WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'cosechas',       count(*) FROM cosechas              WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'quimicos',       count(*) FROM quimicos              WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos        WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'aplicaciones_quimicas', count(*) FROM aplicaciones_quimicas WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'lotes_packing',  count(*) FROM lotes_packing         WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'tareas',         count(*) FROM tareas                WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'users',          count(*) FROM users                 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs            WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens        WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
      UNION ALL SELECT 'mesa_bandeja',   count(*) FROM mesa_bandeja mb
         WHERE mb.mesa_id IN (SELECT id FROM mesas WHERE tenant_id = '00000000-0000-0000-0000-000000000002')
      UNION ALL SELECT 'usuario_establecimiento', count(*) FROM usuario_establecimiento ue
         WHERE ue.user_id IN (SELECT id FROM users WHERE tenant_id = '00000000-0000-0000-0000-000000000002')
    ) a USING (tabla)
   WHERE s.filas IS DISTINCT FROM a.filas;

  IF dif > 0 THEN
    RAISE EXCEPTION 'ABORTADO: el tenant de pruebas cambio en % tabla(s). Revisar el control de arriba.', dif;
  END IF;
  RAISE NOTICE 'Control OK: el tenant de pruebas quedo intacto.';
END
$ctrl$;

\echo ''
\echo '=== PRODUCCION: mesas por tunel (esperado: 6 tuneles x 122, 0 con posicion) ==='
SELECT t.nombre AS tunel,
       count(m.id)                                          AS mesas,
       count(m.posicion_actual)                             AS con_posicion_debe_ser_0,
       count(*) FILTER (WHERE m.estado <> 'activa')         AS no_activas_debe_ser_0,
       count(*) FILTER (WHERE m.carencia_hasta IS NOT NULL) AS en_carencia_debe_ser_0
  FROM tuneles t
  LEFT JOIN mesas m ON m.tunel_id = t.id AND m.tenant_id = :'TEN_PROD'
 WHERE t.deleted_at IS NULL AND t.tenant_id = :'TEN_PROD'
 GROUP BY t.nombre
 ORDER BY t.nombre;

\echo ''
\echo '=== PRODUCCION: mesas listas para trasplantar (esperado: 732) ==='
SELECT count(*) AS mesas_trasplantables
  FROM mesas
 WHERE tenant_id = :'TEN_PROD'
   AND estado = 'activa' AND posicion_actual IS NULL AND deleted_at IS NULL;

\echo ''
\echo '=== PRODUCCION: catalogo que quedo (esperado: solo INIT, activo = t) ==='
SELECT 'proveedor' AS tipo, nombre AS valor, activo FROM proveedores WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'marca',    nombre,      activo FROM marcas     WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'producto', nombre,      activo FROM productos  WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'variedad', nombre,      activo FROM variedades WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'lote',     numero_lote, activo FROM lotes      WHERE tenant_id = :'TEN_PROD'
ORDER BY 1, 2;

\echo ''
\echo '=== PRODUCCION: usuarios conservados (esperado: admin@ y user@agrisano.com) ==='
SELECT u.email, u.is_active, u.deleted_at,
       string_agg(r.name, ', ' ORDER BY r.name) AS roles
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id
 WHERE u.tenant_id = :'TEN_PROD'
 GROUP BY u.email, u.is_active, u.deleted_at
 ORDER BY u.email;

\echo ''
\echo '=== PRODUCCION: tablas que deben quedar en 0 ==='
SELECT 'aplicaciones_quimicas' AS tabla, count(*) AS filas FROM aplicaciones_quimicas WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs     WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'bandejas',       count(*) FROM bandejas       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'cosechas',       count(*) FROM cosechas       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'lotes_packing',  count(*) FROM lotes_packing  WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'quimicos',       count(*) FROM quimicos       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'refresh_tokens', count(*) FROM refresh_tokens WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'siembras',       count(*) FROM siembras       WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'tareas',         count(*) FROM tareas         WHERE tenant_id = :'TEN_PROD'
UNION ALL SELECT 'bandeja_descartes', count(*) FROM bandeja_descartes bd
   WHERE bd.tenant_id = :'TEN_PROD'
      OR bd.bandeja_id IN (SELECT id FROM bandejas WHERE tenant_id = :'TEN_PROD')
UNION ALL SELECT 'mesa_bandeja (prod)', count(*) FROM mesa_bandeja mb
   WHERE mb.mesa_id IN (SELECT id FROM mesas WHERE tenant_id = :'TEN_PROD')
ORDER BY 1;

-- =============================================================================
-- Despues del COMMIT hay que correr el seed para volver a posicionar las mesas:
--
--   API_URL=... TENANT_ID=00000000-0000-0000-0000-000000000001 \
--   ADMIN_EMAIL=... ADMIN_PASSWORD=... DATABASE_URL=... \
--   INIT_PROVEEDOR='...' INIT_MARCA='...' INIT_PRODUCTO='...' \
--   INIT_VARIEDAD='...' INIT_LOTE_SEMILLA='...' INIT_LOTE_SUSTRATO='...' \
--   INIT_LOTE_VERMICULITA='...' \
--   node scripts/seed-init-trasplante.js
--
-- Los valores INIT_* son los nombres exactos que imprime la verificacion
-- "catalogo que quedo" de mas arriba. Si no coinciden, el seed crea un segundo
-- juego INIT en vez de reutilizar el que quedo.
-- =============================================================================
ROLLBACK;
