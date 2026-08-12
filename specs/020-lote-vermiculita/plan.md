# Implementation Plan: Lote de vermiculita

**Branch**: `020-lote-vermiculita` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-lote-vermiculita/spec.md`

## Summary

Se agrega **vermiculita** como tercer tipo de lote, con el mismo ciclo de vida completo que el
sustrato (alta, edición, baja administrativa, consumo, rehabilitación, borrado, numeración propia
por tipo, aislamiento por tenant y auditoría), más un campo exclusivo `grado` con valores 1, 2 o
3. Al sembrar, cada grupo de bandejas puede informar **opcionalmente** un lote de vermiculita, que
se valida con los mismos cuatro chequeos que los otros dos lotes (tipo correcto, mismo
establecimiento, no consumido, activo) y queda registrado por bandeja, propagándose a las tres
superficies de lectura que hoy muestran linaje de lotes: detalle de siembra, reporte de
trazabilidad de cosecha y listado enriquecido de aplicaciones químicas. La implementación se apoya
en la herencia de tabla única que `lotes` ya usa: extender el enum `lote_tipo` reutiliza servicio
base, tenancy, soft delete, auditoría, endpoints de consumo y el índice único parcial por
`(tenant_id, tipo, numero_lote)` sin escribir nada nuevo. Los dos puntos delicados son de esquema
y de guardas: el valor de enum debe agregarse en una migración **aislada** (Postgres no permite
usarlo en la misma transacción), y las tres condiciones `tipo === SUSTRATO` de `lotes.service.ts`
deben invertirse a `tipo !== SEMILLA` o un lote de vermiculita aceptaría producto, variedad y
semillero en silencio. Sin cambios incompatibles: los cuatro contratos tocados se extienden de
forma aditiva y las siembras históricas siguen leyéndose sin vermiculita.

## Technical Context

**Language/Version**: TypeScript 5 strict, sin `any`; Node 20
**Primary Dependencies**: NestJS 10, TypeORM, class-validator / class-transformer, nestjs-pino
**Storage**: PostgreSQL (Railway) — tablas `lotes`, `bandejas`; tipo enum `lote_tipo`
**Testing**: Jest con ts-jest y `@nestjs/testing`; unit tests con repositorio mockeado, más
verificación funcional contra el entorno dev en Railway
**Target Platform**: Servidor Linux (Railway)
**Project Type**: API REST NestJS, monolito modular
**Performance Goals**: sin degradación medible. La validación de vermiculita agrega, como máximo,
una lectura por índice primario por grupo de bandejas y solo cuando el lote viene informado. Los
JOIN nuevos de trazabilidad y aplicaciones químicas son `LEFT JOIN` contra `lotes.id` (PK), con
índice nuevo `IDX_bandejas_lote_vermiculita_id` para el filtro por lote.
**Constraints**:
- `ALTER TYPE ... ADD VALUE` es **irreversible** en Postgres y no puede usarse en la misma
  transacción que lo agregó → dos migraciones obligatorias.
- `bandejas.lote_semilla_id` y `lote_sustrato_id` son `NOT NULL`; `lote_vermiculita_id` **debe**
  ser nullable porque no existe backfill honesto para bandejas históricas.
- Cero cambios incompatibles en los contratos existentes.
**Scale/Scope**: 2 migraciones, ~15 archivos de código, 1 código de error nuevo, 4 contratos de
API extendidos de forma aditiva, 1 documento de handoff para el frontend.

## Constitution Check

| Principio | Cumplimiento |
|---|---|
| I. Template First | `LotesService` sigue extendiendo `BaseCrudTenantService`; no se crea servicio, módulo ni controlador nuevo. La vermiculita es un valor más del discriminador existente |
| II. Multi-Tenancy | Todas las lecturas y escrituras siguen pasando por `strictTenant: true` / `requireTenantId()`. Los JOIN nuevos van contra `lotes.id` dentro de consultas que ya filtran por `tenant_id` |
| III. Error Handling | Un único código nuevo, `LOTE_GRADO_NO_PERMITIDO` (422), en `ErrorCodes`, lanzado con `AppError`. Todo lo demás reutiliza códigos existentes. Ningún `throw new Error()` |
| IV. Audit | Alta, edición, borrado, consumo y rehabilitación de lotes de vermiculita atraviesan los mismos métodos ya instrumentados con `AuditService.write('admin', ...)`. Sin código de auditoría nuevo |
| V. Roles | Sin roles nuevos ni cambios de `@Roles`. La vermiculita se administra con los mismos permisos que rigen hoy para los lotes |
| VI. Transactions | `createSiembra` ya corre dentro de un `QueryRunner` con transacción explícita; `lote_vermiculita_id` se persiste dentro de esa misma transacción. Las migraciones corren en transacción salvo la del `ADD VALUE`, que Postgres obliga a aislar |
| VII. API Responses | Sin cambios: los controladores siguen usando `ok()` y `page()` de `src/common/http/api-response.ts` |
| VIII. Code Quality | `grado?: number` tipado explícito; validadores `class-validator` (`@ValidateIf`, `@IsInt`, `@IsIn`); referencias de lote con tipos dedicados, sin `any`. Se **eliminan** dos aserciones de no-nulo peligrosas al mapear vermiculita en trazabilidad |
| IX. Modules | Sin imports cruzados nuevos entre módulos de feature. Los tipos de referencia se definen en cada módulo consumidor, como ya ocurre hoy |
| X. Small Steps | Implementación por fases verificables: esquema → catálogo → siembra → lecturas → filtros → documentación. Cada fase deja el sistema funcionando |

**Gate: PASS** (pre y post diseño).

## Project Structure

### Documentation

```
specs/020-lote-vermiculita/
├── spec.md              # Qué y por qué (aprobado)
├── research.md          # Decisiones técnicas D1..D10
├── data-model.md        # DDL, matriz de campos, reglas V1..V12, errores
├── plan.md              # Este archivo
├── tasks.md             # Desglose ejecutable T001..T028
├── quickstart.md        # (pendiente) Verificación manual contra dev
├── contracts/           # (pendiente)
└── checklists/          # (pendiente)
```

### Source Code

```
migrations/
├── 1774500000000-LoteTipoVermiculita.ts     # NUEVO — solo ALTER TYPE ADD VALUE
└── 1774500000001-LoteVermiculita.ts         # NUEVO — grado, CHECK, FK, índice

src/common/errors/
└── error-codes.ts                            # MODIFICAR — LOTE_GRADO_NO_PERMITIDO

src/modules/lotes/
├── entities/lote.entity.ts                   # MODIFICAR — LoteTipo.VERMICULITA, grado
├── dto/create-lote.dto.ts                    # MODIFICAR — grado con @ValidateIf
├── dto/update-lote.dto.ts                    # MODIFICAR — grado opcional
├── dto/query-lotes.dto.ts                    # MODIFICAR — filtro grado (FR-010)
└── lotes.service.ts                          # MODIFICAR — 3 guardas, grado, filterAllowed, deleteLote

src/modules/siembra/
├── entities/bandeja.entity.ts                # MODIFICAR — lote_vermiculita_id
├── dto/create-siembra.dto.ts                 # MODIFICAR — lote_vermiculita_id opcional
├── siembra.service.ts                        # MODIFICAR — validación, persistencia, join
└── bandeja.service.ts                        # MODIFICAR — filterAllowed

src/modules/trazabilidad/
└── trazabilidad.service.ts                   # MODIFICAR — SQL, 3 interfaces, mapeo

src/modules/aplicaciones-quimicas/
├── aplicaciones-quimicas.service.ts          # MODIFICAR — JOIN + columnas
└── types/aplicacion-enriched.types.ts        # MODIFICAR — referencia de vermiculita

docs/
└── handoff-frontend-lote-vermiculita.md      # NUEVO
```

**Structure Decision**: no se crea ningún módulo nuevo. La feature se realiza extendiendo el
módulo `lotes` (que ya modela los tres tipos con herencia de tabla única) y propagando el dato a
los tres módulos que consumen linaje de lotes (`siembra`, `trazabilidad`,
`aplicaciones-quimicas`). Un módulo `vermiculita` separado duplicaría un CRUD idéntico y obligaría
a cada consumidor a resolver dos orígenes distintos para el mismo concepto —
ver [D1](research.md#d1-tercer-valor-del-enum-lote_tipo-en-la-tabla-lotes-no-una-tabla-nueva).

## Diseño del cambio (exacto)

### 1. Migraciones

Dos archivos, en orden. El DDL completo está en [data-model.md](data-model.md#migraciones). El
punto crítico: `1774500000000` contiene **una sola sentencia** (`ALTER TYPE "lote_tipo" ADD VALUE
'vermiculita'`) y su `down()` queda vacío con comentario, replicando exactamente
`1772200000000-BandejaCoolingPeriod.ts`. Todo lo demás va en `1774500000001`, que sí revierte por
completo.

### 2. Entidad `Lote`

```ts
export enum LoteTipo {
  SEMILLA = 'semilla',
  SUSTRATO = 'sustrato',
  VERMICULITA = 'vermiculita',
}

// Vermiculita-only field (nullable — semilla y sustrato lo dejan en null)
@Column({ type: 'smallint', nullable: true })
grado!: number | null;
```

El filtro por **tipo** sale gratis: `QueryLotesDto` ya valida `tipo` con `@IsEnum(LoteTipo)`, así
que `GET /lotes?tipo=vermiculita` empieza a funcionar solo. El filtro por **grado** (FR-010) sí
requiere dos líneas:

```ts
// query-lotes.dto.ts
@IsOptional()
@IsInt()
@IsIn([1, 2, 3])
grado?: number;

// lotes.service.ts:67
filterAllowed: ['tipo', 'activo', 'estado', 'grado'],
```

`GET /lotes?grado=2` sobre lotes que no son de vermiculita devuelve vacío, que es la respuesta
correcta: ningún otro tipo tiene grado.

### 3. DTOs de lote

`CreateLoteDto` — mismo patrón `@ValidateIf` que ya usan los campos exclusivos de semilla:

```ts
// Vermiculita-only field — validated only when tipo === 'vermiculita'
@ValidateIf((o: CreateLoteDto) => o.tipo === LoteTipo.VERMICULITA)
@IsNotEmpty()
@IsInt()
@IsIn([1, 2, 3])
grado?: number;
```

`UpdateLoteDto`:

```ts
@IsOptional()
@IsInt()
@IsIn([1, 2, 3])
grado?: number;
```

Con `enableImplicitConversion: true` en el `ValidationPipe` global, `"grado": "2"` llega como
número y `@IsInt()` lo acepta; `"grado": "alto"` queda en `NaN` y falla con 400.

### 4. `LotesService.createLote`

La guarda se invierte y se agrega el chequeo de `grado`:

```ts
if (
  dto.tipo !== LoteTipo.SEMILLA &&                    // antes: === LoteTipo.SUSTRATO
  (dto.proveedor_semilla_id || dto.producto_id || dto.variedad_id)
) {
  // ... (cuerpo sin cambios: los mismos dos AppError 422)
}

if (dto.tipo !== LoteTipo.VERMICULITA && dto.grado !== undefined) {
  throw new AppError({
    code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
    message: 'grado solo aplica a lotes de tipo vermiculita',
    status: 422,
  });
}
```

**No** ampliar la guarda invertida a `batch` ni a `marca_id`: ambos siguen permitidos en cualquier
tipo, igual que hoy ([D10](research.md#d10-marca_id-y-batch-sin-validación-nueva)). Agregarlos
rompería lotes de sustrato existentes.

### 5. `LotesService.updateLote`

Dos guardas invertidas (`current.tipo === LoteTipo.SUSTRATO` → `current.tipo !== LoteTipo.SEMILLA`,
líneas 160 y 173) y —el detalle fácil de pasar por alto— **`grado` debe entrar en la condición
externa que decide si se carga `current`**:

```ts
if (
  dto.proveedor_semilla_id !== undefined ||
  dto.producto_id !== undefined ||
  dto.variedad_id !== undefined ||
  dto.grado !== undefined ||          // NUEVO — sin esto, `current` no se carga
  dto.numero_lote
) {
  const current = await this.mustFindById(id, { strictTenant: true });

  if (dto.grado !== undefined && current.tipo !== LoteTipo.VERMICULITA) {
    throw new AppError({
      code: ErrorCodes.LOTE_GRADO_NO_PERMITIDO,
      message: 'grado solo aplica a lotes de tipo vermiculita',
      status: 422,
    });
  }
  // ... resto sin cambios
}
```

Si se omite ese `||`, un `PATCH` que solo mande `grado` nunca entra al bloque, `current` no se
carga, la validación no corre y el `CHECK` de la base devuelve un 500 en vez de un 422.

### 6. `LotesService.deleteLote`

```ts
`SELECT COUNT(*)::int AS cnt FROM bandejas
 WHERE lote_semilla_id = $1 OR lote_sustrato_id = $1 OR lote_vermiculita_id = $1`
```

Un `OR` y nada más. El resto de la consulta se deja como está (no filtra `deleted_at` ni
`tenant_id`): es deuda preexistente cuya corrección cambiaría el comportamiento de borrado para
semilla y sustrato — ver [D8](research.md#d8-deletelote-debe-contar-también-las-referencias-de-vermiculita).

### 7. Entidad `Bandeja` y DTO de siembra

```ts
// bandeja.entity.ts
@Column({ type: 'uuid', nullable: true })
lote_vermiculita_id!: string | null;

// create-siembra.dto.ts — BandejaGroupDto
@IsOptional()
@IsUUID()
lote_vermiculita_id?: string;
```

`@IsOptional()` es lo que mantiene la compatibilidad total: todo cliente que hoy manda solo
semilla y sustrato sigue funcionando sin tocar una línea.

### 8. `SiembraService.createSiembra`

**Validación** — se agrega al final del bucle por grupo, envuelta en un guard de presencia, con
los mismos cuatro chequeos y los mismos códigos de error que semilla y sustrato:

```ts
if (group.lote_vermiculita_id) {
  const vermiculita = await this.lotesService.mustFindById(
    group.lote_vermiculita_id,
    { strictTenant: true },
  );
  if (vermiculita.tipo !== LoteTipo.VERMICULITA) { /* 422 LOTE_TIPO_INCORRECTO */ }
  if (
    vermiculita.establecimiento_id !== null &&
    vermiculita.establecimiento_id !== dto.establecimiento_id
  ) { /* 422 LOTE_ESTABLECIMIENTO_MISMATCH */ }
  if (vermiculita.estado === LoteEstado.CONSUMIDO) { /* 422 LOTE_CONSUMIDO */ }
  if (!vermiculita.activo) { /* 422 LOTE_INACTIVO */ }
}
```

Va **después** del bloque de sustrato: así el primer error reportado en un payload con varios
problemas sigue siendo el mismo que hoy, y ningún test ni expectativa del frontend cambia.

**Persistencia** — dentro de la transacción ya existente:

```ts
lote_vermiculita_id: group.lote_vermiculita_id ?? null,
```

### 9. `SiembraService.getSiembraWithBandejas`

Tercer `leftJoinAndMapOne` y tres columnas más en el `select`:

```ts
.leftJoinAndMapOne('b.lote_vermiculita', 'lotes', 'lv', 'lv.id = b.lote_vermiculita_id')
// select: 'b.lote_vermiculita_id', 'lv.id', 'lv.numero_lote', 'lv.tipo', 'lv.grado'
```

El tipo `LoteRef` local gana un hermano `LoteVermiculitaRef = LoteRef & { grado: number }`, y
`BandejaWithRefs` declara `lote_vermiculita?: LoteVermiculitaRef`. `leftJoinAndMapOne` ya deja la
propiedad ausente cuando no hay match, así que la ausencia se representa sola. **No** se agrega
`grado` a `LoteRef` — ver [D7](research.md#d7-grado-viaja-en-las-lecturas-mediante-una-referencia-dedicada-no-ensuciando-las-existentes).

### 10. `BandejaService`

```ts
filterAllowed: ['estado', 'establecimiento_id', 'siembra_id',
                'lote_semilla_id', 'lote_sustrato_id', 'lote_vermiculita_id'],
```

`lote_vermiculita_id` cubre FR-021. `lote_sustrato_id` es una adición que **ningún FR pide** —
está hoy ausente por descuido y agregarla evita dejar el conjunto más asimétrico que antes; es
una palabra, sin riesgo, y se puede quitar sin afectar nada más
([D9](research.md#d9-filtro-por-lote-en-get-bandejas)).

### 11. `TrazabilidadService`

SQL cruda — un `LEFT JOIN` y tres columnas:

```sql
lv.numero_lote AS lote_vermiculita_numero,
lv.tipo        AS lote_vermiculita_tipo,
lv.grado       AS lote_vermiculita_grado
...
LEFT JOIN lotes lv ON lv.id = b.lote_vermiculita_id
```

Las tres interfaces (`BandejaCicloRaw`, `SiembraInfo`, `BandejaCicloRow`) suman los campos
correspondientes, con `lote_vermiculita` **nullable** en `SiembraInfo`. El mapeo es el único punto
donde hay que apartarse del estilo vigente: semilla y sustrato se mapean con aserción de no-nulo
(`r.lote_semilla_numero!`) porque sus columnas son `NOT NULL`; vermiculita **no puede** usar esa
aserción, porque sería mentira:

```ts
lote_vermiculita: r.lote_vermiculita_id
  ? {
      id: r.lote_vermiculita_id,
      numero_lote: r.lote_vermiculita_numero!,
      tipo: r.lote_vermiculita_tipo!,
      grado: r.lote_vermiculita_grado!,
    }
  : null,
```

### 12. `AplicacionesQuimicasService`

`LEFT JOIN lotes lv ON lv.id = b.lote_vermiculita_id` en la consulta enriquecida, más las columnas
`lote_vermiculita_id`, `lote_vermiculita_numero` y `lote_vermiculita_grado`. En
`NurserySeedingGroup` el campo nuevo sigue la convención en inglés del archivo:
`vermiculite_lot: LoteVermiculitaRef | null`, junto a `seed_lot` y `substrate_lot`.

El módulo **ya tiene** el helper `loteRefOrNull()` para referencias que pueden faltar, así que el
caso nullable encaja sin lógica nueva; se agrega una variante que además arrastre `grado`. Hay un
detalle de tipos que hay que resolver a propósito: `homogeneousLote` está firmado como
`(values: (LoteRef | null)[]): LoteRef | null`, así que pasarle referencias de vermiculita
**devolvería `LoteRef` y perdería `grado` en silencio**. Debe volverse genérico:

```ts
private homogeneousLote<T extends { id: string }>(values: (T | null)[]): T | null
```

El comportamiento no cambia para semilla ni sustrato: sigue degradando a `null` cuando el grupo de
bandejas es heterogéneo. Para vermiculita, `null` significa tanto "ninguna bandeja del grupo llevó
vermiculita" como "llevaron partidas distintas" — la misma ambigüedad que ya tienen los otros dos
lotes en esta superficie, y se mantiene por consistencia.

### 13. Fases de implementación

Cada fase deja el sistema funcionando y verificable por separado (principio X):

| Fase | Contenido | Verificable con |
|---|---|---|
| 1 | Las dos migraciones + entidad `Lote` + `ErrorCodes` | Migraciones aplican y revierten; el sistema sigue funcionando sin vermiculita |
| 2 | DTOs de lote + `LotesService` (guardas, `grado`, `deleteLote`) | Alta/edición/consumo/borrado de un lote de vermiculita por API |
| 3 | Entidad `Bandeja` + DTO de siembra + validación y persistencia en `createSiembra` | Siembra con y sin vermiculita; los cuatro rechazos |
| 4 | Lecturas: detalle de siembra, trazabilidad, aplicaciones químicas | El `grado` aparece en las tres superficies; siembras históricas se leen sin vermiculita |
| 5 | `filterAllowed` en bandejas | `GET /bandejas?lote_vermiculita_id=…` |
| 6 | Tests unitarios + `docs/handoff-frontend-lote-vermiculita.md` | Suite en verde; frontend con contrato escrito |

## Impacto verificado en el resto del sistema

Revisado consumidor por consumidor:

- **`GET /lotes`** — empieza a devolver una tercera clase de `tipo`. El contrato es
  retrocompatible (ningún campo cambia), pero **cualquier interfaz que renderice el tipo con un
  ternario** (`tipo === 'semilla' ? 'Semilla' : 'Sustrato'`) etiquetará la vermiculita como
  sustrato. Es el único impacto real fuera del backend y va explícito en el handoff.
- **`POST /siembras`** — extensión aditiva y opcional; los clientes actuales no cambian.
- **`GET /siembras/:id`, `GET /trazabilidad/cosecha/:id`, `GET /aplicaciones-quimicas`** —
  ganan un campo nullable; ningún campo existente cambia de nombre, tipo ni forma.
- **Cosechas y trasplantes** — no referencian lotes directamente; llegan a ellos a través de
  `bandejas`. Sin cambios.
- **Módulo `mesas` / `mesa_bandeja`** — no toca columnas de lote. Sin cambios.
- **`ProveedoresService.deleteProveedor`** — cuenta lotes por `proveedor_id`, sin discriminar
  tipo: la vermiculita queda protegida automáticamente. (Sigue sin contar
  `proveedor_semilla_id`, deuda preexistente ajena a esta feature.)
- **`MarcasService.deleteMarca`** — cuenta lotes por `marca_id` sin discriminar tipo: la
  vermiculita queda protegida automáticamente.
- **Endpoints `consumir` / `rehabilitar`** — operan sobre `lotes` sin mirar `tipo`: funcionan con
  vermiculita sin ninguna modificación.
- **Auditoría, roles, tenancy, paginación, ordenamiento y soft delete** — heredados sin cambios.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Poner el `ADD VALUE` junto con el resto del DDL: la migración falla en producción con `unsafe use of new value` | Dos archivos separados desde el diseño, siguiendo el precedente `1772200000000`. Verificar en dev antes de promover |
| Olvidar invertir alguna de las tres guardas `=== SUSTRATO`: un lote de vermiculita acepta producto/variedad/semillero sin error visible | FR-006 lo eleva a requisito funcional con test dedicado por cada una de las tres ubicaciones (create, y las dos de update) |
| Olvidar `dto.grado !== undefined` en la condición externa de `updateLote`: el `PATCH` de solo-grado esquiva la validación y explota contra el CHECK con 500 | Señalado explícitamente en §5; test de `PATCH { grado }` sobre un lote de sustrato esperando 422 |
| Olvidar el `OR lote_vermiculita_id` en `deleteLote`: 500 por violación de FK en vez de 409 | FR-017 lo eleva a requisito funcional con test dedicado |
| Usar aserción de no-nulo (`!`) al mapear vermiculita en trazabilidad, copiando el estilo de las líneas vecinas: `numero_lote: undefined` filtrado como si fuera un lote real | Mapeo condicional explícito en §11; test de trazabilidad sobre una cosecha cuyo ciclo no usó vermiculita |
| `homogeneousLote` devuelve `LoteRef` y descarta `grado` sin que TypeScript se queje | Volverlo genérico (§12); test de aplicaciones químicas que verifique que `grado` llega en `vermiculite_lot` |
| El frontend etiqueta vermiculita como sustrato por el ternario de dos ramas | `docs/handoff-frontend-lote-vermiculita.md` lo señala como el primer punto a revisar |
| El rollback deja el valor de enum huérfano | Aceptado y documentado: sin `grado` ni `lote_vermiculita_id`, el valor es inerte. Es limitación de Postgres, no del diseño |
| `grado` se vuelve un conjunto dinámico y `smallint` + CHECK queda corto | Migrar a FK contra un catálogo es un cambio acotado (una columna, un JOIN). Registrado como suposición en `spec.md` |

## Fuera de alcance verificado

Confirmado que **no** se toca nada de esto:

- La consulta de `deleteLote` sigue sin filtrar `deleted_at` ni `tenant_id` (deuda preexistente).
- `deleteProveedor` sigue sin contar `proveedor_semilla_id` (deuda preexistente).
- `batch` sigue permitido en cualquier tipo de lote (decisión del solicitante,
  [D10](research.md#d10-marca_id-y-batch-sin-validación-nueva)).
- No se agregan cantidades, stock ni descuento por consumo a la vermiculita: los lotes de
  semilla/sustrato/vermiculita no llevan stock; eso es exclusivo de `lotes_quimicos`.
- No se cambia la obligatoriedad de semilla ni de sustrato al sembrar.
- No se permite convertir un lote existente a vermiculita: `tipo` sigue siendo inmutable.
- No se agrega vermiculita a trasplantes ni a cosechas como dato propio: viaja por linaje de
  bandeja, igual que los otros dos lotes.
- No se unifican los tipos de referencia de lote entre módulos (principio IX).

## Complexity Tracking

Sin violaciones al constitution que requieran justificación. Las dos desviaciones de estilo del
repositorio son forzadas y están documentadas:

| Desviación | Por qué es inevitable |
|---|---|
| Migración con `down()` vacío | Postgres no soporta `DROP VALUE` en un enum. Precedente idéntico en `1772200000000-BandejaCoolingPeriod.ts` |
| Tercera columna de lote en `bandejas` nullable, junto a dos `NOT NULL` | La vermiculita es opcional al sembrar y las bandejas históricas no la llevaron; cualquier backfill fabricaría trazabilidad falsa ([D5](research.md#d5-bandejaslote_vermiculita_id-nullable-sin-backfill)) |
