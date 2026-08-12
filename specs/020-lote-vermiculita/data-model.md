# Data Model: Lote de vermiculita

**Branch**: `020-lote-vermiculita` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

---

## Migraciones

Son **dos**, y el orden importa. Postgres no permite usar un valor de enum dentro de la misma
transacción que lo agregó, y TypeORM corre cada migración en una transacción — ver
[D2](research.md#d2-dos-migraciones-separadas-por-la-restricción-transaccional-de-postgres).

### 1. `migrations/1774500000000-LoteTipoVermiculita.ts`

Contiene **una sola sentencia**. No agregar nada más a este archivo.

```sql
-- up()
ALTER TYPE "lote_tipo" ADD VALUE 'vermiculita';

-- down()
-- (vacío intencionalmente)
-- Postgres no soporta DROP VALUE en un enum. El valor 'vermiculita' queda en el tipo
-- de forma permanente. La reversión real de la feature la hace la migración siguiente;
-- sin la columna `grado` ni `bandejas.lote_vermiculita_id`, el valor huérfano es inerte.
-- Misma limitación ya documentada en 1772200000000-BandejaCoolingPeriod.ts.
```

### 2. `migrations/1774500000001-LoteVermiculita.ts`

```sql
-- up()
ALTER TABLE "lotes" ADD "grado" smallint;

ALTER TABLE "lotes" ADD CONSTRAINT "CHK_lotes_grado" CHECK (
  ("tipo" =  'vermiculita' AND "grado" IS NOT NULL AND "grado" BETWEEN 1 AND 3) OR
  ("tipo" <> 'vermiculita' AND "grado" IS NULL)
);

ALTER TABLE "bandejas" ADD "lote_vermiculita_id" uuid;

ALTER TABLE "bandejas" ADD CONSTRAINT "FK_bandejas_lote_vermiculita"
  FOREIGN KEY ("lote_vermiculita_id") REFERENCES "lotes"("id");

CREATE INDEX "IDX_bandejas_lote_vermiculita_id"
  ON "bandejas" ("lote_vermiculita_id");

-- down()  (reversión completa, en orden inverso)
DROP INDEX "IDX_bandejas_lote_vermiculita_id";
ALTER TABLE "bandejas" DROP CONSTRAINT "FK_bandejas_lote_vermiculita";
ALTER TABLE "bandejas" DROP COLUMN "lote_vermiculita_id";
ALTER TABLE "lotes" DROP CONSTRAINT "CHK_lotes_grado";
ALTER TABLE "lotes" DROP COLUMN "grado";
```

**Notas de ejecución**:

- La migración 2 es **segura sobre datos existentes**: `grado` nace `NULL` en todas las filas y el
  CHECK se satisface trivialmente para `semilla` y `sustrato` (rama `tipo <> 'vermiculita' AND
  grado IS NULL`). No hay filas de tipo `vermiculita` todavía, así que la otra rama no se evalúa
  contra nada.
- `lote_vermiculita_id` nace `NULL` en todas las bandejas históricas. **No hay backfill** — ver
  [D5](research.md#d5-bandejaslote_vermiculita_id-nullable-sin-backfill).
- La FK se declara **sin** cláusula `ON DELETE` / `ON UPDATE`, igual que
  `FK_bandejas_lote_semilla` y `FK_bandejas_lote_sustrato` en
  `1770400000000-SiembraInit.ts`. El default de Postgres (`NO ACTION`) es el comportamiento
  buscado: la base bloquea el borrado físico y el 409 legible lo produce el servicio antes de
  llegar ahí (ver V12).

---

## Entidad: `Lote` (campos nuevos)

| Campo | Tipo | Rol en esta feature |
|---|---|---|
| `tipo` | `enum lote_tipo` | Gana el valor `vermiculita`. `LoteTipo.VERMICULITA = 'vermiculita'` |
| `grado` | `smallint \| null` | Grado de la vermiculita: 1, 2 o 3. Obligatorio si `tipo = 'vermiculita'`; siempre `null` en el resto |

Ningún campo existente cambia de tipo, de nulabilidad ni de significado.

### Matriz de campos por tipo de lote

Esta tabla es el contrato real del discriminador. `O` = obligatorio, `X` = prohibido,
`opc` = opcional.

| Campo | `semilla` | `sustrato` | `vermiculita` | Quién lo hace cumplir |
|---|:--:|:--:|:--:|---|
| `tipo` | O | O | O | DTO `@IsEnum` |
| `numero_lote` | O | O | O | DTO + índice único parcial por `(tenant_id, tipo, numero_lote)` |
| `proveedor_id` | O | O | O | DTO `@IsUUID` |
| `establecimiento_id` | opc | opc | opc | DTO |
| `marca_id` | opc | opc | opc | DTO — sin validación por tipo ([D10](research.md#d10-marca_id-y-batch-sin-validación-nueva)) |
| `observaciones` | opc | opc | opc | DTO |
| `batch` | opc | opc | opc | DTO — sin validación por tipo (deuda preexistente aceptada) |
| `producto_id` | O | X | **X** | DTO `@ValidateIf` (obligatoriedad) + servicio (prohibición, V3) |
| `variedad_id` | O | X | **X** | ídem |
| `proveedor_semilla_id` | O | X | **X** | ídem |
| `grado` | **X** | **X** | **O** | DTO `@ValidateIf` (obligatoriedad) + servicio (prohibición, V2) + CHECK `CHK_lotes_grado` |
| `activo` | O (default `true`) | O | O | Entidad |
| `estado` | O (default `habilitado`) | O | O | Entidad — feature 019 |

Las tres celdas **X** de la columna `vermiculita` son exactamente lo que hoy **no** se cumpliría:
las guardas del servicio preguntan `tipo === SUSTRATO` y hay que invertirlas a `tipo !== SEMILLA`
([D4](research.md#d4-invertir-las-guardas-de-campos-exclusivos-de-semilla-sustrato--semilla)).

---

## Entidad: `Bandeja` (campo nuevo)

| Campo | Tipo | Rol en esta feature |
|---|---|---|
| `lote_vermiculita_id` | `uuid \| null` | Lote de vermiculita usado al sembrar el grupo. `null` cuando no se usó vermiculita (siembras históricas y siembras nuevas que la omiten) |

**Asimetría deliberada**: `lote_semilla_id` y `lote_sustrato_id` son `NOT NULL`;
`lote_vermiculita_id` es nullable. No es un descuido — es la única forma honesta de representar
las bandejas que no llevaron vermiculita.

---

## Reglas de validación

| # | Regla | Dónde | Respuesta |
|---|---|---|---|
| V1 | Al crear con `tipo = 'vermiculita'`, `grado` es obligatorio y debe ser 1, 2 o 3 | `CreateLoteDto` — `@ValidateIf(tipo === VERMICULITA) @IsNotEmpty() @IsInt() @IsIn([1,2,3])` | **400** genérico de `ValidationPipe` |
| V2 | `grado` presente con `tipo` distinto de `vermiculita` (crear o actualizar) | `LotesService.createLote` / `updateLote` | **422** `LOTE_GRADO_NO_PERMITIDO` |
| V3 | `producto_id` / `variedad_id` / `proveedor_semilla_id` en un lote no-semilla (incluida vermiculita) | `LotesService` — guardas invertidas | **422** `LOTE_PRODUCTO_NO_PERMITIDO` / `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` |
| V4 | Coherencia `tipo` ↔ `grado` a nivel de datos | `CHK_lotes_grado` en Postgres | Violación de constraint (red de seguridad; V1–V2 la interceptan antes) |
| V5 | `numero_lote` único por tenant **y por tipo** | `UQ_lotes_tenant_tipo_numero` (ya existe, sin cambios) | **409** `LOTE_NUMERO_DUPLICADO` |
| V6 | `tipo` es inmutable — no se puede convertir un lote a vermiculita ni al revés | `UpdateLoteDto` sin `tipo` + `whitelist/forbidNonWhitelisted` | **400**; el código `LOTE_TIPO_IMMUTABLE` sigue como defensa |
| V7 | `grado` editable solo en lotes de vermiculita | `LotesService.updateLote` (mismo chequeo que V2, contra `current.tipo`) | **422** `LOTE_GRADO_NO_PERMITIDO` |
| V8 | Al sembrar, `lote_vermiculita_id` debe apuntar a un lote de `tipo = 'vermiculita'` | `SiembraService.createSiembra` | **422** `LOTE_TIPO_INCORRECTO` |
| V9 | Al sembrar, el lote de vermiculita debe pertenecer al mismo establecimiento que la siembra | `SiembraService.createSiembra` | **422** `LOTE_ESTABLECIMIENTO_MISMATCH` |
| V10 | Al sembrar, el lote de vermiculita no puede estar consumido | `SiembraService.createSiembra` | **422** `LOTE_CONSUMIDO` |
| V11 | Al sembrar, el lote de vermiculita no puede estar inactivo | `SiembraService.createSiembra` | **422** `LOTE_INACTIVO` |
| V12 | No se puede borrar un lote de vermiculita referenciado por bandejas | `LotesService.deleteLote` — `OR lote_vermiculita_id = $1` | **409** `LOTE_REFERENCED_BY_BANDEJA` |

**V8–V11 se evalúan solo si el grupo trae `lote_vermiculita_id`.** Omitirlo es válido (FR-013) y
no dispara ninguna de ellas. El orden de evaluación es semilla → sustrato → vermiculita, y se
reporta el primer problema encontrado — así ningún mensaje de error de las siembras actuales
cambia ([D6](research.md#d6-la-validación-de-vermiculita-en-createsiembra-corre-bajo-un-guard-de-presencia)).

**Sobre V1 vs V2 (por qué 400 y 422 conviven)**: es exactamente el patrón que ya usa
`producto_id`. La *ausencia* de un campo obligatorio para el tipo la detecta `ValidationPipe`
antes del controlador → 400 sin código de dominio. La *presencia* de un campo prohibido para el
tipo la detecta el servicio → 422 con código. Por eso esta feature agrega **un solo** código de
error nuevo, no dos.

---

## Códigos de error nuevos

| Código | Estado HTTP | Nuevo |
|---|:--:|:--:|
| `LOTE_GRADO_NO_PERMITIDO` | 422 | ✅ |
| `LOTE_PRODUCTO_NO_PERMITIDO` | 422 | — (existente, ahora también aplica a vermiculita) |
| `LOTE_PROVEEDOR_SEMILLA_NO_PERMITIDO` | 422 | — (existente, ídem) |
| `LOTE_TIPO_INCORRECTO` | 422 | — (existente, ahora también para el slot de vermiculita) |
| `LOTE_ESTABLECIMIENTO_MISMATCH` | 422 | — (existente, ídem) |
| `LOTE_CONSUMIDO` | 422 | — (existente, ídem) |
| `LOTE_INACTIVO` | 422 | — (existente, ídem) |
| `LOTE_REFERENCED_BY_BANDEJA` | 409 | — (existente, ídem) |
| `LOTE_NUMERO_DUPLICADO` | 409 | — (existente, ídem) |

Un solo código nuevo. Todo lo demás reutiliza el vocabulario de errores que el frontend ya maneja.

---

## Forma de las respuestas de lectura

La referencia a un lote de vermiculita es un objeto propio, **no** el tipo compartido de semilla y
sustrato ([D7](research.md#d7-grado-viaja-en-las-lecturas-mediante-una-referencia-dedicada-no-ensuciando-las-existentes)):

```jsonc
// dentro de un grupo de bandejas / una fila de trazabilidad
"lote_semilla":     { "id": "…", "numero_lote": "S-001" },          // sin cambios
"lote_sustrato":    { "id": "…", "numero_lote": "SU-014" },         // sin cambios
"lote_vermiculita": { "id": "…", "numero_lote": "V-003", "grado": 2 }  // NUEVO — o null
```

`lote_vermiculita` es `null` (o ausente, según la superficie) cuando la bandeja no llevó
vermiculita. Los lotes de semilla y sustrato se informan **exactamente** como hoy: no se les
agrega `grado` (FR-024).

Superficies afectadas: detalle de siembra, reporte de trazabilidad de cosecha y listado
enriquecido de aplicaciones químicas.

---

## Invariantes preservadas

- **`activo` y `estado` siguen siendo ortogonales** (feature 019). La vermiculita hereda ambos
  ejes sin excepciones: se puede desactivar, consumir y rehabilitar igual que cualquier lote
  (FR-009, FR-010).
- **El espacio de numeración por tipo se mantiene.** Un `V-001` de vermiculita convive con un
  `V-001` de sustrato sin conflicto, porque `tipo` ya forma parte de la clave única (FR-002). No
  hay cambio de índice.
- **`tipo` sigue siendo inmutable.** No existe camino para convertir un lote de sustrato en uno de
  vermiculita ni viceversa (FR-011, V6).
- **La semilla y el sustrato siguen siendo obligatorios al sembrar** (FR-012). La vermiculita no
  reemplaza ni relaja nada: solo se suma.
- **Las siembras y bandejas históricas siguen siendo válidas y se leen sin errores** (FR-022,
  FR-023). Ninguna consulta existente cambia de resultado.
- **El aislamiento por tenant no se toca.** La vermiculita usa el mismo `BaseCrudTenantService`
  con `strictTenant: true`; no hay consulta nueva que cruce tenants (FR-025).
- **La auditoría cubre la vermiculita sin código nuevo**: creación, actualización, borrado,
  consumo y rehabilitación pasan por los mismos métodos ya instrumentados con `AuditService`.
- **Los permisos por rol no cambian.** La vermiculita se administra con los mismos roles que
  gobiernan hoy los lotes de semilla y sustrato.
