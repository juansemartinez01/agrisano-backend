-- =============================================================================
-- OBSOLETO - NO EJECUTAR. Usar scripts/sql/reset-tenant-produccion.sql.
-- =============================================================================
-- Este script es el que se corrio el 2026-08-16, cuando la base tenia un solo
-- tenant. Sus DELETE no llevan WHERE, asi que hoy vaciaria tambien el tenant de
-- pruebas (00000000-0000-0000-0000-000000000002). Se conserva solo como
-- registro historico de aquel reset.
-- =============================================================================

-- =============================================================================
-- RESET A PRODUCCION - Agrisano
-- =============================================================================
-- Deja la base lista para que el cliente empiece a operar desde cero:
--   CONSERVA : roles, admin@agrisano.com, tobias@tobias.com, establecimiento
--              "Agrisano", los 6 tuneles y sus 732 mesas (122 por tunel)
--              reseteadas al estado "vacia y lista para trasplantar".
--   BORRA    : todo el flujo operativo de QA (siembras, bandejas, trasplantes,
--              cosechas, aplicaciones quimicas, packing, historial), los lotes,
--              los catalogos de prueba, la auditoria, y los objetos de prueba
--              (1 mesa, 1 tunel, 1 establecimiento, 5 usuarios).
--
-- REQUISITO PREVIO: backup tomado con `node scripts/backup-data.js <dir>`.
--
-- El script corre entero dentro de una transaccion: si algo falla, no se
-- aplica nada. Revisar la salida de la verificacion final ANTES del COMMIT.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/reset-produccion.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Estado inicial (para dejar registro en el log de la corrida)
-- -----------------------------------------------------------------------------
\echo '=== CONTEO ANTES ==='
SELECT 'mesas' t, count(*) FROM mesas
UNION ALL SELECT 'tuneles', count(*) FROM tuneles
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'bandejas', count(*) FROM bandejas
UNION ALL SELECT 'bandeja_descartes', count(*) FROM bandeja_descartes
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
ORDER BY 1;

-- -----------------------------------------------------------------------------
-- 1. Auditoria (sin dependencias)
-- -----------------------------------------------------------------------------
DELETE FROM audit_logs;

-- -----------------------------------------------------------------------------
-- 2. Packing (hijo de cosechas)
-- -----------------------------------------------------------------------------
DELETE FROM lotes_packing_categorias;
DELETE FROM lotes_packing;

-- -----------------------------------------------------------------------------
-- 3. Aplicaciones quimicas (hijos primero: bandeja/mesa/detalle -> cabecera)
-- -----------------------------------------------------------------------------
DELETE FROM aplicacion_quimica_bandeja;
DELETE FROM aplicacion_quimica_mesa;
DELETE FROM aplicaciones_quimicas_detalle;
DELETE FROM aplicaciones_quimicas;

-- -----------------------------------------------------------------------------
-- 4. Cosechas
-- -----------------------------------------------------------------------------
DELETE FROM cosechas;

-- -----------------------------------------------------------------------------
-- 5. Historial de mesas y vinculos mesa-bandeja
-- -----------------------------------------------------------------------------
DELETE FROM historial_mesa;
DELETE FROM mesa_bandeja;

-- -----------------------------------------------------------------------------
-- 6. Bandejas y siembras
--    Las constancias de descarte van primero: su FK a bandejas es
--    ON DELETE NO ACTION a proposito, para que una merma no pueda
--    desaparecer en cascada. Sin esta linea el DELETE de abajo falla.
-- -----------------------------------------------------------------------------
DELETE FROM bandeja_descartes;
DELETE FROM bandejas;
DELETE FROM siembras;

-- -----------------------------------------------------------------------------
-- 7. Quimicos y sus lotes
-- -----------------------------------------------------------------------------
DELETE FROM lotes_quimicos;
DELETE FROM quimico_principio_activo;
DELETE FROM quimicos;
DELETE FROM principios_activos;

-- -----------------------------------------------------------------------------
-- 8. Lotes (semilla / sustrato / vermiculita)
-- -----------------------------------------------------------------------------
DELETE FROM lotes;

-- -----------------------------------------------------------------------------
-- 9. Catalogos de prueba (variedades antes que productos por FK)
-- -----------------------------------------------------------------------------
DELETE FROM variedades;
DELETE FROM productos;
DELETE FROM marcas;
DELETE FROM proveedores;

-- -----------------------------------------------------------------------------
-- 10. Objetos de prueba: mesa extra del Tunnel 6, tunel de test, establecimiento
--     de test. Se identifican por nombre exacto para no tocar nada mas.
-- -----------------------------------------------------------------------------
DELETE FROM mesas WHERE nombre = 'Mesa prueba 020 628517';
DELETE FROM tuneles WHERE nombre = 'Test Tunnel';
DELETE FROM establecimientos WHERE nombre = 'Est prueba 020 628517';

-- -----------------------------------------------------------------------------
-- 11. Usuarios de QA y admin del template.
--     user_roles / refresh_tokens / usuario_establecimiento caen por CASCADE.
--     ATENCION: verificar antes que SEED_ADMIN_EMAIL en Railway NO sea
--     'admin@innoview.local', o el proximo deploy lo vuelve a crear.
-- -----------------------------------------------------------------------------
DELETE FROM users
WHERE email IN (
  'admin@innoview.local',
  'qa.nombre.1784412618@test.com',
  'qa.nonombre.1784412710@test.com',
  'qa.register.1784412727@test.com',
  'qa.reg.nofields.1784412772@test.com'
);

-- -----------------------------------------------------------------------------
-- 12. OPCIONAL: cerrar todas las sesiones abiertas (fuerza re-login).
--     Descomentar si se quiere invalidar los tokens de dev.
-- -----------------------------------------------------------------------------
-- DELETE FROM refresh_tokens;

-- -----------------------------------------------------------------------------
-- 13. Reset de las mesas al estado "vacia y lista para trasplantar".
--     Segun trasplante.service.ts, una mesa es trasplantable si
--     estado = 'activa' AND posicion_actual IS NULL.
--     NO se borran ni recrean: se conserva id, codigo_qr (QRs impresos),
--     nombre, tunel_id y plantas_estimadas.
-- -----------------------------------------------------------------------------
UPDATE mesas SET
  estado                  = 'activa',
  posicion_actual         = NULL,
  fecha_ultimo_trasplante = NULL,
  carencia_hasta          = NULL,
  activo                  = TRUE,
  deleted_at              = NULL,
  updated_at              = now();

-- =============================================================================
-- VERIFICACION - revisar esta salida ANTES de confirmar el COMMIT
-- =============================================================================
\echo '=== VERIFICACION: mesas por tunel (esperado: 6 tuneles x 122) ==='
SELECT t.nombre AS tunel,
       count(m.id)                                          AS mesas,
       count(m.posicion_actual)                             AS con_posicion_debe_ser_0,
       count(*) FILTER (WHERE m.estado <> 'activa')          AS no_activas_debe_ser_0,
       count(*) FILTER (WHERE m.carencia_hasta IS NOT NULL)  AS en_carencia_debe_ser_0
FROM tuneles t
LEFT JOIN mesas m ON m.tunel_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.nombre
ORDER BY t.nombre;

\echo '=== VERIFICACION: mesas listas para trasplantar (esperado: 732) ==='
SELECT count(*) AS mesas_trasplantables
FROM mesas
WHERE estado = 'activa' AND posicion_actual IS NULL AND deleted_at IS NULL;

\echo '=== VERIFICACION: usuarios y roles conservados ==='
SELECT u.email, u.is_active, string_agg(r.name, ', ' ORDER BY r.name) AS roles
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
GROUP BY u.email, u.is_active
ORDER BY u.email;

\echo '=== VERIFICACION: establecimientos (esperado: solo Agrisano) ==='
SELECT nombre, activo FROM establecimientos ORDER BY nombre;

\echo '=== VERIFICACION: tablas que deben quedar en 0 ==='
SELECT 'aplicaciones_quimicas' t, count(*) FROM aplicaciones_quimicas
UNION ALL SELECT 'aplicaciones_quimicas_detalle', count(*) FROM aplicaciones_quimicas_detalle
UNION ALL SELECT 'aplicacion_quimica_bandeja', count(*) FROM aplicacion_quimica_bandeja
UNION ALL SELECT 'aplicacion_quimica_mesa', count(*) FROM aplicacion_quimica_mesa
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'bandejas', count(*) FROM bandejas
UNION ALL SELECT 'cosechas', count(*) FROM cosechas
UNION ALL SELECT 'historial_mesa', count(*) FROM historial_mesa
UNION ALL SELECT 'lotes', count(*) FROM lotes
UNION ALL SELECT 'lotes_packing', count(*) FROM lotes_packing
UNION ALL SELECT 'lotes_quimicos', count(*) FROM lotes_quimicos
UNION ALL SELECT 'marcas', count(*) FROM marcas
UNION ALL SELECT 'mesa_bandeja', count(*) FROM mesa_bandeja
UNION ALL SELECT 'productos', count(*) FROM productos
UNION ALL SELECT 'proveedores', count(*) FROM proveedores
UNION ALL SELECT 'quimicos', count(*) FROM quimicos
UNION ALL SELECT 'siembras', count(*) FROM siembras
UNION ALL SELECT 'variedades', count(*) FROM variedades
ORDER BY 1;

-- =============================================================================
-- Ejecutado en firme el 2026-08-16 contra la base de Railway, previo backup con
-- `node scripts/backup-data.js ./backups` y un ensayo completo con ROLLBACK.
-- Para volver a usarlo como ensayo, cambiar COMMIT por ROLLBACK.
-- =============================================================================
COMMIT;
