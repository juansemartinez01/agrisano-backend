# Quickstart: verificación de la feature 027

Se verifica contra la **base local descartable** (nunca Railway) con un tenant de pruebas y los
usuarios QA (`operario.qa`, `supervisor.qa`). Los comandos `curl` usan placeholders: `$API`,
`$TENANT` (header de tenant), `$TOKEN_OPERARIO`, `$TOKEN_SUPERVISOR`, `$ESTAB`, `$LOTE`,
`$MESA`, `$BANDEJA`.

## 0. Preparación

```bash
npm run db:migration:run     # aplica 1775200000000-AplicacionQuimicaInicioFin
npm run build
npm test                     # specs unitarios nuevos y existentes en verde
npm run start:dev
```

Comprobar en la base:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'aplicaciones_quimicas' AND column_name LIKE 'fecha_hora%';
-- fecha_hora, fecha_hora_inicio, fecha_hora_fin
```

## 1. Alta feliz (US1)

`POST /aplicaciones-quimicas` (greenhouse, 1 mesa) con inicio 45 min antes de ahora y fin = ahora.

Esperado: 201; el GET del detalle trae `fecha_hora_inicio`, `fecha_hora_fin`, `duracion_segundos = 2700`
y `fecha_hora == fecha_hora_fin`. Repetir con `contexto: nursery` y `bandeja_ids`.

Sin `fecha_hora_fin`: el fin queda ≈ ahora. Sin `fecha_hora_inicio`: 400.

## 2. Rechazos sin efectos (US2)

Para cada caso verificar 4xx **y** que no cambió el stock del lote, no hay fila nueva y la
carencia del target no se movió:

| Caso | Esperado |
|------|----------|
| fin anterior al inicio | 422 `APLICACION_HORARIO_INVALIDO` |
| fin = ahora + 10 min | 422 `APLICACION_HORARIO_INVALIDO` |
| fin = ahora + 3 min | 201 (tolerancia) |
| inicio == fin | 201, `duracion_segundos = 0` |
| fin − inicio = 25 h | 422 `APLICACION_DURACION_EXCESIVA` |
| `"2026-10-28"` o `"2026-10-28T08:00:00"` | 400 (formato) |

## 3. Corrección por supervisor (US3)

`PATCH /aplicaciones-quimicas/:id`:

1. Solo `fecha_hora_fin` más tarde → 200, nueva duración, `fecha_hora` igual al nuevo fin.
2. Solo `fecha_hora_inicio` posterior al fin guardado → 422.
3. `fecha_hora` suelto → 400 `BAD_REQUEST` (campo desconocido).
4. Con token de operario → 403.
5. Sobre una aplicación vieja (sin horarios) con un solo extremo → 422; con ambos → 200.

Grupo (`PATCH /aplicaciones-quimicas/operation-group/:operation_group_id`): enviar inicio/fin de grupo y un
item `create` sin horarios; verificar que todas las filas tocadas comparten inicio/fin y que el
item nuevo heredó los del grupo.

## 4. Carencia (US4)

Químico con 3 días de carencia, aplicación que termina el día D: el target queda con
`carencia_hasta = D + 3` (fecha UTC). Corregir el fin al día D+1 y comprobar que la carencia se
recalcula a D + 4. Consultar la trazabilidad de una cosecha de esa mesa y confirmar que muestra
la misma `carencia_hasta` y la alerta correspondiente.

Verificar que el servidor corre en UTC (local y Railway): `SHOW timezone;` en la base y
`new Date().getTimezoneOffset() === 0` en el proceso.

## 5. Lecturas (US5)

La misma aplicación nueva en: `GET /aplicaciones-quimicas`, `GET /aplicaciones-quimicas/:id`,
`GET /mesas/:id/aplicaciones`, `GET /bandejas/:id/aplicaciones` y trazabilidad → mismos
inicio, fin y duración. Una aplicación antigua → los tres en `null`, sin error.

`GET /aplicaciones-quimicas?sortBy=fecha_hora_inicio&sortOrder=DESC` → ordenado por inicio;
las antiguas al final. Historial de la mesa: eventos con `detalle.fecha_hora_inicio/fin`.

## 6. Integridad en base

```sql
-- debe fallar por el CHECK
UPDATE aplicaciones_quimicas SET fecha_hora = fecha_hora + interval '1 hour'
 WHERE fecha_hora_fin IS NOT NULL AND id = '<id de una aplicación nueva>';
```

## 7. Producción (cuando se despliegue)

Backup con `scripts/backup-data.js`; deploy coordinado con el front; luego, consulta de solo
lectura: `SELECT name FROM migrations WHERE name LIKE '%AplicacionQuimicaInicioFin%';`.
