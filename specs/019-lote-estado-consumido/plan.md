# Implementation Plan: Estado de consumido para lotes de semilla y sustrato

**Branch**: `019-lote-estado-consumido` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-lote-estado-consumido/spec.md`

## Summary

Se agrega a `lotes` un segundo eje de estado, independiente de `activo` (baja administrativa): `estado` con valores `habilitado` (default, todo lote nuevo nace así) y `consumido`. Un operario marca un lote como consumido vía `POST /lotes/:id/consumir` (nota opcional); un supervisor o admin_global revierte vía `POST /lotes/:id/rehabilitar`. `GET /lotes` gana dos filtros opcionales (`estado`, `disponible`) sin alterar el listado por defecto. `createSiembra` pasa a rechazar (422) cualquier lote de semilla o sustrato que no esté simultáneamente `habilitado` Y `activo`, identificando cuál lote y por qué motivo. Ambas transiciones son atómicas (UPDATE condicional, mismo patrón que `ajustarLote` en lotes-quimicos) para evitar carreras en doble clic, y quedan auditadas con `AuditService`. No hay migración de datos (los lotes existentes quedan `habilitado` por DEFAULT), no se toca ninguna otra tabla ni módulo, y las siembras/bandejas ya creadas con un lote que luego se consume no se ven afectadas retroactivamente.

## Technical Context

**Language/Version**: TypeScript 5 (strict, sin `any`), Node 20

**Primary Dependencies**: NestJS 10, TypeORM, class-validator/class-transformer, nestjs-pino

**Storage**: PostgreSQL — nueva migración sobre la tabla `lotes` (columnas nuevas, sin nueva tabla)

**Testing**: Jest (`ts-jest`, `@nestjs/testing`) — tests unitarios con repositorio mockeado, sin DB real; verificación funcional adicional contra el entorno dev en Railway

**Target Platform**: Servidor Linux (Railway)

**Project Type**: API REST (NestJS monolito modular)

**Performance Goals**: Sin metas nuevas — mismo perfil que el resto del CRUD de `lotes` (operaciones puntuales por id, sin lotes masivos)

**Constraints**: Ambas transiciones deben ser atómicas a nivel fila (UPDATE condicional) para que un doble clic no deje estado inconsistente ni duplique auditoría; `createSiembra` no debe introducir un segundo round-trip por lote (reutiliza el `mustFindById` que ya hace)

**Scale/Scope**: 1 migración, 4 columnas + 1 enum nuevas en `lotes`, 2 endpoints nuevos, 2 campos de filtro nuevos en `GET /lotes`, 1 punto de enforcement modificado (`createSiembra`), 4 códigos de error nuevos, 2 archivos de test nuevos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Estado | Nota |
|---|---|---|
| I. Template First | ✅ | `consumirLote`/`rehabilitarLote` extienden `LotesService` (ya `BaseCrudTenantService<Lote>`); no se duplica CRUD. |
| II. Multi-Tenancy | ✅ | Las dos transiciones filtran `tenant_id` explícitamente en el UPDATE condicional (patrón `ajustarLote`); `listLotes` sigue con `strictTenant: true`. |
| III. Error Handling | ✅ | 4 códigos nuevos (`LOTE_CONSUMIDO`, `LOTE_INACTIVO`, `LOTE_YA_CONSUMIDO`, `LOTE_NO_CONSUMIDO`) vía `AppError`/`ErrorCodes`, cero `throw new Error()`. |
| IV. Audit | ✅ | `consumir` y `rehabilitar` son transiciones de estado → auditoría obligatoria vía `AuditService`, mismo patrón que `create/update/delete` de `lotes.controller.ts`. |
| V. Roles | ✅ | `consumir` usa el set operacional (`operario`,`supervisor`,`admin_global`), `rehabilitar` usa solo (`supervisor`,`admin_global`) — decisión explícita del solicitante, ambos vía `RolesGuard`. |
| VI. Transactions | ✅ | UPDATE condicional atómico de una sola fila (no requiere transacción explícita, mismo criterio que `ajustarLote`); no hay flujo multi-tabla. |
| VII. API Responses | ✅ | Ambos endpoints devuelven `ok(lote)`; sin cambios a `page()`. |
| VIII. Code Quality | ✅ | DTO nuevo (`ConsumirLoteDto`) con class-validator; sin `any`; enum `LoteEstado` tipado. |
| IX. Modules | ✅ | Todo el cambio vive dentro de `src/modules/lotes/*`, salvo el enforcement en `siembra.service.ts` que ya importaba `LotesService`/`LoteTipo` (no se agrega import cruzado nuevo). |
| X. Small Steps | ✅ | Un solo módulo (`lotes`) más un punto de enforcement puntual en `siembra`; sin tocar packing, cosecha, trasplante, trazabilidad ni químicos. |

**Gate: PASS** (pre y post diseño).

## Project Structure

### Documentation (this feature)

```text
specs/019-lote-estado-consumido/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── consumir-lote.md
│   └── rehabilitar-lote.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
migrations/
└── 1774400000000-LoteEstadoConsumido.ts     # NUEVO — columnas estado/consumo en lotes

src/common/errors/
└── error-codes.ts                            # MODIFICAR — 4 códigos nuevos

src/modules/lotes/
├── entities/lote.entity.ts                    # MODIFICAR — enum LoteEstado + 6 columnas
├── dto/
│   ├── consumir-lote.dto.ts                   # NUEVO — { observaciones_consumo? }
│   └── query-lotes.dto.ts                     # MODIFICAR — filtros estado/disponible
├── lotes.service.ts                           # MODIFICAR — consumirLote/rehabilitarLote + listLotes
├── lotes.controller.ts                        # MODIFICAR — POST :id/consumir, POST :id/rehabilitar
└── lotes.service.spec.ts                      # NUEVO — tests unitarios

src/modules/siembra/
└── siembra.service.ts                         # MODIFICAR — 4 guards nuevos en createSiembra
└── siembra.service.spec.ts                    # NUEVO (o ampliar si ya existe) — tests de los guards nuevos
```

**Structure Decision**: Monolito modular NestJS existente (`src/modules/<feature>`). No se crea módulo nuevo — todo el estado y las transiciones son responsabilidad de `lotes`, y el único punto de enforcement fuera de ese módulo (`createSiembra`) ya depende de `LotesService`, así que no se introduce ningún import cruzado nuevo (Principio IX).

## Diseño del cambio (exacto)

### 1. Migración — `migrations/1774400000000-LoteEstadoConsumido.ts`

Agrega a `lotes`:

```sql
CREATE TYPE lotes_estado_enum AS ENUM ('habilitado', 'consumido');

ALTER TABLE lotes
  ADD COLUMN estado lotes_estado_enum NOT NULL DEFAULT 'habilitado',
  ADD COLUMN fecha_consumido timestamptz NULL,
  ADD COLUMN usuario_consumido_id uuid NULL,
  ADD COLUMN usuario_consumido_email_snapshot varchar NULL,
  ADD COLUMN usuario_consumido_nombre_snapshot varchar NULL,
  ADD COLUMN usuario_consumido_apellido_snapshot varchar NULL,
  ADD COLUMN observaciones_consumo text NULL;
```

Sin backfill: el `DEFAULT 'habilitado'` cubre todas las filas existentes (todas nacen habilitadas, consistente con FR-002). `down()` revierte columnas + drop del enum. Sin FK en `usuario_consumido_id` (consistente con el resto del código — confirmado, ningún `usuario_id` tiene FK).

### 2. Entity — `lote.entity.ts`

```ts
export enum LoteEstado {
  HABILITADO = 'habilitado',
  CONSUMIDO = 'consumido',
}
```

+ columnas: `estado: LoteEstado` (default `HABILITADO`), `fecha_consumido: Date | null`, `usuario_consumido_id: string | null`, `usuario_consumido_email_snapshot/nombre_snapshot/apellido_snapshot: string | null`, `observaciones_consumo: string | null`.

### 3. Códigos de error — `error-codes.ts`

Bajo el bloque `// lotes` existente:

```ts
LOTE_CONSUMIDO: 'LOTE_CONSUMIDO',       // 422 — createSiembra: el lote está consumido
LOTE_INACTIVO: 'LOTE_INACTIVO',         // 422 — createSiembra: el lote está dado de baja (activo=false)
LOTE_YA_CONSUMIDO: 'LOTE_YA_CONSUMIDO', // 409 — POST /consumir sobre un lote ya consumido
LOTE_NO_CONSUMIDO: 'LOTE_NO_CONSUMIDO', // 409 — POST /rehabilitar sobre un lote que no está consumido
```

### 4. DTOs

**`dto/consumir-lote.dto.ts`** (nuevo):

```ts
export class ConsumirLoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones_consumo?: string;
}
```

`rehabilitar` no lleva body (sin DTO).

**`dto/query-lotes.dto.ts`** (modificar) — agrega:

```ts
@IsOptional()
@IsEnum(LoteEstado)
estado?: LoteEstado;

@IsOptional()
@Transform(({ value }) => value === 'true' || value === true ? true : value === 'false' || value === false ? false : value)
@IsBoolean()
disponible?: boolean;
```

`CreateLoteDto`/`UpdateLoteDto` **no** ganan un campo `estado` — decisión explícita (ver research.md D6): con `forbidNonWhitelisted: true` global, cualquier intento de mandar `estado` en `POST`/`PATCH /lotes` ya devuelve 400 automáticamente sin código nuevo.

### 5. Service — `lotes.service.ts`

`listLotes` — agrega `'estado'` a `filterAllowed` y compone `customizeQb` (hoy solo cubre `q.q`) para además aplicar, cuando `q.disponible === true`:

```ts
qb.andWhere(`${alias}.estado = :estadoDisponible AND ${alias}.activo = true`, { estadoDisponible: LoteEstado.HABILITADO });
```

Dos métodos nuevos, mismo patrón atómico que `ajustarLote` (lotes-quimicos.service.ts:155-181):

```ts
async consumirLote(id: string, userId: string, dto: ConsumirLoteDto): Promise<Lote> {
  const tenantId = this.getTenantId({ strictTenant: true }) as string;
  await this.mustFindById(id, { strictTenant: true }); // 404 si no existe / no es del tenant

  const snapshot = await fetchUsuarioSnapshot(this.loteRepo.manager, userId, tenantId);

  const result = await this.loteRepo
    .createQueryBuilder()
    .update(Lote)
    .set({
      estado: LoteEstado.CONSUMIDO,
      fecha_consumido: () => 'now()',
      usuario_consumido_id: userId,
      usuario_consumido_email_snapshot: snapshot.usuario_email_snapshot,
      usuario_consumido_nombre_snapshot: snapshot.usuario_nombre_snapshot,
      usuario_consumido_apellido_snapshot: snapshot.usuario_apellido_snapshot,
      observaciones_consumo: dto.observaciones_consumo ?? null,
    })
    .where('id = :id', { id })
    .andWhere('tenant_id = :tenantId', { tenantId })
    .andWhere('estado = :habilitado', { habilitado: LoteEstado.HABILITADO })
    .execute();

  if (!result.affected) {
    throw new AppError({
      code: ErrorCodes.LOTE_YA_CONSUMIDO,
      message: 'El lote ya está consumido',
      status: 409,
    });
  }
  return this.mustFindById(id, { strictTenant: true });
}

async rehabilitarLote(id: string): Promise<Lote> {
  const tenantId = this.getTenantId({ strictTenant: true }) as string;
  await this.mustFindById(id, { strictTenant: true });

  const result = await this.loteRepo
    .createQueryBuilder()
    .update(Lote)
    .set({
      estado: LoteEstado.HABILITADO,
      fecha_consumido: null,
      usuario_consumido_id: null,
      usuario_consumido_email_snapshot: null,
      usuario_consumido_nombre_snapshot: null,
      usuario_consumido_apellido_snapshot: null,
      observaciones_consumo: null,
    })
    .where('id = :id', { id })
    .andWhere('tenant_id = :tenantId', { tenantId })
    .andWhere('estado = :consumido', { consumido: LoteEstado.CONSUMIDO })
    .execute();

  if (!result.affected) {
    throw new AppError({
      code: ErrorCodes.LOTE_NO_CONSUMIDO,
      message: 'El lote no está consumido',
      status: 409,
    });
  }
  return this.mustFindById(id, { strictTenant: true });
}
```

`fetchUsuarioSnapshot` devuelve las claves canónicas (`usuario_email_snapshot`, etc.); se remapean a mano a las columnas `usuario_consumido_*` en el `.set()` (ver research.md D1 — no se modifica el helper compartido).

### 6. Controller — `lotes.controller.ts`

```ts
@Roles('operario', 'supervisor', 'admin_global')
@Post(':id/consumir')
async consumir(@Param('id') id: string, @Body() dto: ConsumirLoteDto, @Req() req: AuthRequest) {
  const lote = await this.svc.consumirLote(id, req.user.sub, dto);
  // auditLogPayload + logger.info + audit.write('admin', { action: AUDIT.CONSUMIDO, ... })
  return ok(lote);
}

@Roles('supervisor', 'admin_global')
@Post(':id/rehabilitar')
async rehabilitar(@Param('id') id: string, @Req() req: AuthRequest) {
  const lote = await this.svc.rehabilitarLote(id);
  // auditLogPayload + logger.info + audit.write('admin', { action: AUDIT.REHABILITADO, ... })
  return ok(lote);
}
```

`AUDIT` gana `CONSUMIDO: 'lote_consumido'` y `REHABILITADO: 'lote_rehabilitado'`, mismo objeto ya exportado desde `lotes.service.ts`.

### 7. Enforcement en `createSiembra` — `siembra.service.ts`

Dentro del `for (const group of dto.bandejas)` existente (líneas ~156-199), inmediatamente después de cada chequeo de `establecimiento_id` ya existente, para semilla y para sustrato:

```ts
if (semilla.estado === LoteEstado.CONSUMIDO) {
  throw new AppError({
    code: ErrorCodes.LOTE_CONSUMIDO,
    message: `lote_semilla_id '${group.lote_semilla_id}' está consumido y no puede usarse en una siembra`,
    status: 422,
  });
}
if (!semilla.activo) {
  throw new AppError({
    code: ErrorCodes.LOTE_INACTIVO,
    message: `lote_semilla_id '${group.lote_semilla_id}' está dado de baja y no puede usarse en una siembra`,
    status: 422,
  });
}
// (mismo par de checks para sustrato)
```

El orden consumido→activo por lote, y semilla→sustrato entre lotes, hace que el primer problema encontrado sea el que se reporta — suficiente para cumplir FR-013 (identificar cuál lote y qué motivo) sin acumular una lista de errores.

## Impacto verificado en el resto del sistema

- **`GET /lotes/:id`, `PATCH /lotes/:id`, `DELETE /lotes/:id`**: sin cambios de comportamiento; `estado` viaja en la respuesta como cualquier otra columna pero no es editable por `PATCH` (whitelist).
- **Bandejas / siembras existentes**: no se tocan; `estado` en `lotes` no tiene FK ni trigger hacia `bandejas`/`siembras`. Consumir un lote con historial de siembras no altera esas filas (FR-016).
- **`lotes-quimicos`, `marcas`, `productos`, `variedades`, `trazabilidad`, `cosecha`, `packing`, `trasplante`, `aplicaciones_quimicas`**: cero referencias a `lotes.estado`; no requieren cambios (confirmado por grep de `LotesService`/`lote_semilla_id`/`lote_sustrato_id` — el único consumidor fuera de `lotes` es `siembra.service.ts`).
- **`GET /lotes` sin filtros**: idéntico a hoy — `estado`/`disponible` son opcionales y no alteran `filterAllowed` existentes (`tipo`, `activo`).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Doble clic en "Consumir" o "Rehabilitar" genera dos escrituras/auditorías | UPDATE condicional atómico (`WHERE ... AND estado = <esperado>`); la segunda llamada ve `affected === 0` y responde 409 sin tocar la fila ni auditar de más. |
| Ventana de carrera en `createSiembra`: un lote se consume justo entre el `mustFindById` y el `INSERT` de la siembra | Riesgo aceptado explícitamente (ver research.md D3) — mismo criterio que hoy con `activo`; no había `SELECT FOR UPDATE` antes de esta feature y no se introduce ahora. Peor caso: una siembra queda creada con un lote que se consumió milisegundos después, exactamente igual que hoy con `activo=false`. |
| Confusión entre `activo` (baja administrativa) y `estado` (consumido) en el frontend | Filtro combinado `disponible=true` (`estado=habilitado AND activo=true`) para que el cliente no tenga que replicar la regla (FR-014). |
| Migración de un enum Postgres en producción | Sin backfill, `DEFAULT 'habilitado'` cubre filas existentes; mismo patrón ya usado en `BandejaEstado`/`LoteTipo` (`CREATE TYPE` + `ADD COLUMN ... DEFAULT`). |

## Fuera de alcance verificado

Confirmado contra el código: no existe ninguna noción de cantidad/stock en `lotes` (a diferencia de `lotes_quimicos`, que sí tiene `cantidad_actual`), por lo que esta feature no introduce ninguna. No se agrega historial visible de transiciones (la auditoría vía `AuditService` ya cubre trazabilidad, FR-018, sin una tabla/vista dedicada). No se modifican `lotes-quimicos`, `marcas`, `trazabilidad`, `cosecha`, `packing` ni `trasplante` — ninguno referencia `lotes.estado`. La reversión de una siembra/bandeja ya creada con un lote luego consumido queda fuera de alcance (edge case ya cubierto en spec.md: no hay efecto retroactivo).

## Complexity Tracking

*Sin violaciones a la Constitution Check — tabla no aplica.*
