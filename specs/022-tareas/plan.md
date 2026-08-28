# Implementation Plan: Módulo de tareas

**Branch**: `022-tareas` | **Date**: 2026-08-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-tareas/spec.md`

## Summary

Módulo nuevo y autocontenido (`src/modules/tareas`) que agrega una lista de tareas operativas. Una tabla nueva (`tareas`), dos enums nuevos (`tarea_ambito`, `tarea_estado`), ocho endpoints y cero cambios sobre tablas o módulos existentes. Cada tarea pertenece a un establecimiento y a un ámbito (`nursery` o `greenhouse`), tiene un título, una descripción opcional, un responsable opcional, una posición manual dentro de su tablero y un estado que recorre `pendiente` → `en_progreso` → `completada`/`cancelada`, con reapertura reservada a supervisor o admin_global. El cambio de estado pasa por un único endpoint (`POST /tareas/:id/estado`) validado contra una matriz de transiciones explícita, y el orden manual se persiste en una columna `orden` reasignada por lote desde `POST /tareas/reordenar` dentro de una transacción. Los ámbitos se exponen por API (`GET /tareas/ambitos`) para que sumar uno nuevo sea una migración de una línea sin tocar el frontend.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, sin `any`), Node 20

**Primary Dependencies**: NestJS 11, TypeORM 0.3.28, class-validator/class-transformer, nestjs-pino

**Storage**: PostgreSQL — una migración: 2 tipos enum + 1 tabla + 4 índices + 4 FKs. Ninguna tabla existente se modifica

**Testing**: Jest (`ts-jest`, `@nestjs/testing`) — unitarios con repositorio mockeado (matriz de transiciones, permisos de reapertura, validación del conjunto de reordenamiento); verificación funcional contra el entorno dev en Railway con el tenant de pruebas

**Target Platform**: Servidor Linux (Railway)

**Project Type**: API REST (NestJS monolito modular)

**Performance Goals**: Sin metas nuevas — decenas de tareas activas por tablero; el listado se resuelve con un índice compuesto más una única consulta batch adicional para resolver usuarios

**Constraints**: (a) el listado y la paginación deben ser estables, por lo que todo `ORDER BY` desempata por `id`; (b) el reordenamiento y la creación son atómicos (transacción) para no dejar posiciones inconsistentes; (c) el módulo no puede importar código de feature de otros módulos (Principio IX)

**Scale/Scope**: 1 módulo nuevo, 1 migración, 1 entidad, 5 DTOs, 8 endpoints, 5 códigos de error nuevos, 5 acciones de auditoría, 1 línea en `app.module.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Estado | Nota |
|---|---|---|
| I. Template First | ✅ | `TareasService extends BaseCrudTenantService<Tarea>` (reusa `getTenantId`, `findById`, `mustFindById`, `softDelete`); `Tarea extends BaseEntity`. `listTareas` es propio y no el `list()` heredado, porque `applySort` hace `qb.orderBy(...)` y borra cualquier desempate previo — mismo motivo por el que `listMesas` arma su QB a mano. |
| II. Multi-Tenancy | ✅ | Toda lectura y escritura filtra `tenant_id`; el service usa `strictTenant: true`, así que sin tenant en contexto se responde 400 `TENANT_REQUIRED` en vez de devolver datos. `establecimiento_id` es filtro de consulta, no frontera de seguridad (research D7). |
| III. Error Handling | ✅ | 5 códigos nuevos vía `AppError` + `ErrorCodes`; cero `throw new Error()`. |
| IV. Audit | ✅ | `AuditService` en las cinco escrituras; `tarea_estado_changed` registra `{ from, to }`, que es la transición de estado que el principio exige auditar. |
| V. Roles | ✅ | `JwtAuthGuard` + `RolesGuard` en todo el controller. Crear, editar, reordenar y borrar: `supervisor`, `admin_global`. Cambiar estado: además `operario`. La reapertura (`completada`/`cancelada` → `pendiente`) se valida en el service porque depende del estado de origen, no solo del rol. |
| VI. Transactions | ✅ | `createTarea` (MAX(orden)+1 e INSERT) y `reordenar` (N UPDATEs) van en `queryRunner` con commit/rollback, patrón de `createMesa`. |
| VII. API Responses | ✅ | `ok()` en todo, `page()` en `GET /tareas`. |
| VIII. Code Quality | ✅ | DTOs con class-validator, enums TypeScript tipados, sin `any`, sin duplicación de la matriz de transiciones (un único mapa constante). |
| IX. Modules | ✅ | Todo vive en `src/modules/tareas/*`. Se importan `TenancyModule`, `AuditModule` y `EstablecimientosModule` (infraestructura más validación de catálogo, igual que `MesasModule`). **No** se importa `UsersModule`: la validación del asignado se hace con una consulta directa a `users` (research D9). |
| X. Small Steps | ✅ | Un módulo nuevo aditivo. Ningún módulo existente cambia de comportamiento; los únicos archivos compartidos tocados son `error-codes.ts` (solo agrega claves) y `app.module.ts` (una línea). |

**Gate: PASS** (pre y post diseño).

## Project Structure

### Documentation (this feature)

```text
specs/022-tareas/
├── spec.md              # Especificación funcional
├── plan.md              # This file
├── research.md          # Decisiones D1..D10
├── data-model.md        # Tabla, enums, índices, FKs, máquina de estados
├── quickstart.md        # Verificación funcional en dev
├── contracts/
│   └── tareas-api.md    # Los 8 endpoints
├── checklists/
│   └── requirements.md  # Checklist de calidad de la spec
└── tasks.md             # Phase 2 output (/speckit-tasks — NO creado acá)
```

### Source Code (repository root)

```text
migrations/
└── 1774700000000-TareasInit.ts          # NUEVO — 2 enums + tabla + 4 índices + 4 FKs

src/common/errors/
└── error-codes.ts                        # MODIFICAR — 5 códigos nuevos

src/modules/tareas/                       # NUEVO — módulo completo
├── entities/tarea.entity.ts
├── dto/
│   ├── create-tarea.dto.ts
│   ├── update-tarea.dto.ts
│   ├── cambiar-estado.dto.ts
│   ├── reordenar-tareas.dto.ts
│   └── query-tareas.dto.ts
├── tareas.service.ts
├── tareas.service.spec.ts                # tests unitarios
├── tareas.controller.ts
└── tareas.module.ts

src/
└── app.module.ts                         # MODIFICAR — registrar TareasModule

docs/
└── tareas-frontend.md                    # NUEVO — guía de consumo para el front

postman/
└── tareas.postman_collection.json        # NUEVO — colección de los 8 endpoints
```

**Structure Decision**: Monolito modular NestJS existente (`src/modules/<feature>`). Se crea un módulo nuevo en vez de colgar las tareas de un módulo existente porque no son una propiedad de mesas, túneles ni siembras: son una entidad propia que apenas referencia al establecimiento (research D2).

## Diseño del cambio (exacto)

### 1. Migración — `migrations/1774700000000-TareasInit.ts`

```sql
CREATE TYPE "tarea_ambito" AS ENUM ('nursery', 'greenhouse');
CREATE TYPE "tarea_estado" AS ENUM ('pendiente', 'en_progreso', 'completada', 'cancelada');

CREATE TABLE "tareas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "establecimiento_id" uuid NOT NULL,
  "ambito" "tarea_ambito" NOT NULL,
  "estado" "tarea_estado" NOT NULL DEFAULT 'pendiente',
  "titulo" character varying(150) NOT NULL,
  "descripcion" text,
  "asignado_a_usuario_id" uuid,
  "orden" integer NOT NULL,
  "creada_por_usuario_id" uuid NOT NULL,
  "completada_at" TIMESTAMP WITH TIME ZONE,
  "completada_por_usuario_id" uuid,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "PK_tareas" PRIMARY KEY ("id")
);

CREATE INDEX "IDX_tareas_tenant_id" ON "tareas" ("tenant_id");
CREATE INDEX "IDX_tareas_tablero" ON "tareas" ("tenant_id", "establecimiento_id", "ambito", "orden");
CREATE INDEX "IDX_tareas_estado" ON "tareas" ("tenant_id", "establecimiento_id", "estado");
CREATE INDEX "IDX_tareas_asignado" ON "tareas" ("tenant_id", "asignado_a_usuario_id")
  WHERE "asignado_a_usuario_id" IS NOT NULL;

ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_establecimiento"
  FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_asignado"
  FOREIGN KEY ("asignado_a_usuario_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_creada_por"
  FOREIGN KEY ("creada_por_usuario_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tareas" ADD CONSTRAINT "FK_tareas_completada_por"
  FOREIGN KEY ("completada_por_usuario_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
```

Estilo tomado de `1771700000000-ProveedoresInit.ts` (SQL crudo, `gen_random_uuid()`, `TIMESTAMP WITH TIME ZONE`, constraints nombradas). El `down()` revierte en orden inverso: FKs, índices, `DROP TABLE` y `DROP TYPE` de ambos enums.

### 2. Entity — `entities/tarea.entity.ts`

```ts
export enum TareaAmbito {
  NURSERY = 'nursery',
  GREENHOUSE = 'greenhouse',
}

export enum TareaEstado {
  PENDIENTE = 'pendiente',
  EN_PROGRESO = 'en_progreso',
  COMPLETADA = 'completada',
  CANCELADA = 'cancelada',
}

@Entity('tareas')
@Index(['tenant_id', 'establecimiento_id', 'ambito', 'orden'])
@Index(['tenant_id', 'establecimiento_id', 'estado'])
export class Tarea extends BaseEntity {
  @Column({ type: 'uuid' })
  establecimiento_id!: string;

  @Column({ type: 'enum', enum: TareaAmbito, enumName: 'tarea_ambito' })
  ambito!: TareaAmbito;

  @Column({
    type: 'enum',
    enum: TareaEstado,
    enumName: 'tarea_estado',
    default: TareaEstado.PENDIENTE,
  })
  estado!: TareaEstado;

  @Column({ type: 'varchar', length: 150 })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'uuid', nullable: true })
  asignado_a_usuario_id!: string | null;

  @Column({ type: 'int' })
  orden!: number;

  @Column({ type: 'uuid' })
  creada_por_usuario_id!: string;

  @Column({ type: 'timestamptz', nullable: true })
  completada_at!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  completada_por_usuario_id!: string | null;
}
```

`enumName` explícito para que los tipos se llamen `tarea_ambito` y `tarea_estado`, y no el nombre derivado que genera TypeORM — mismo criterio que `mesa_estado` y `aplicacion_contexto`.

### 3. Códigos de error — `error-codes.ts`

Bloque nuevo `// tareas`:

```ts
TAREA_NOT_FOUND: 'TAREA_NOT_FOUND',                     // 404
TAREA_TRANSICION_INVALIDA: 'TAREA_TRANSICION_INVALIDA', // 422 — transición no permitida por la matriz
TAREA_FIELD_IMMUTABLE: 'TAREA_FIELD_IMMUTABLE',         // 400 — PATCH con un campo no editable
TAREA_ASIGNADO_INVALIDO: 'TAREA_ASIGNADO_INVALIDO',     // 422 — el usuario asignado no existe en el tenant
TAREA_REORDEN_INVALIDO: 'TAREA_REORDEN_INVALIDO',       // 422 — el conjunto enviado no coincide con las activas
```

La reapertura sin rol suficiente reutiliza el 403 `AUTH_FORBIDDEN` ya existente.

### 4. DTOs

**`create-tarea.dto.ts`** — `establecimiento_id` (`@IsUUID`), `ambito` (`@IsEnum(TareaAmbito)`), `titulo` (`@IsString`, `@MinLength(1)`, `@MaxLength(150)`, trim), `descripcion?` (`@IsString`, `@MaxLength(2000)`), `asignado_a_usuario_id?` (`@IsUUID`). No acepta `estado`, `orden`, `creada_por_usuario_id` ni ningún campo de cierre: el `forbidNonWhitelisted` global los rechaza con 400.

**`update-tarea.dto.ts`** — solo `titulo?`, `descripcion?` y `asignado_a_usuario_id?`; este último acepta `null` explícito para desasignar.

**`cambiar-estado.dto.ts`** — `estado` (`@IsEnum(TareaEstado)`).

**`reordenar-tareas.dto.ts`** — `establecimiento_id` (`@IsUUID`), `ambito` (`@IsEnum`), `tarea_ids` (`@IsArray`, `@ArrayMinSize(1)`, `@ArrayMaxSize(500)`, `@IsUUID` en cada elemento).

**`query-tareas.dto.ts`** — `page?`, `limit?`, `q?`, `sortBy?`, `sortOrder?`, `establecimiento_id?`, `ambito?`, `estado?`, `asignado_a?` (uuid o el literal `me`).

### 5. Service — `tareas.service.ts`

```ts
const TRANSICIONES: Record<TareaEstado, TareaEstado[]> = {
  [TareaEstado.PENDIENTE]:   [TareaEstado.EN_PROGRESO, TareaEstado.COMPLETADA, TareaEstado.CANCELADA],
  [TareaEstado.EN_PROGRESO]: [TareaEstado.PENDIENTE, TareaEstado.COMPLETADA, TareaEstado.CANCELADA],
  [TareaEstado.COMPLETADA]:  [TareaEstado.PENDIENTE],
  [TareaEstado.CANCELADA]:   [TareaEstado.PENDIENTE],
};

const ESTADOS_ACTIVOS = [TareaEstado.PENDIENTE, TareaEstado.EN_PROGRESO];
const ROLES_REAPERTURA = ['supervisor', 'admin_global'];
```

Métodos:

- **`createTarea(dto, userId)`** — valida el establecimiento vía `EstablecimientosService` y, si viene, el asignado; abre `queryRunner`, calcula `MAX(orden) + 1` sobre `(tenant_id, establecimiento_id, ambito)` e inserta en la misma transacción, igual que `createMesa` con `posicion_actual`.
- **`listTareas(q, tenantId)`** — QB propio: `tenant_id` más `deleted_at IS NULL`, filtros opcionales, `q` con `ILIKE` sobre `titulo` y `descripcion`, y `asignado_a=me` resuelto contra el `sub` del JWT. Sort whitelist `['orden', 'created_at', 'titulo', 'estado']`, fallback `orden ASC`, y siempre `.addOrderBy('t.id', 'ASC')` — sin ese desempate el `OFFSET` puede repetir una fila entre páginas y saltear otra, el problema ya documentado en `listMesas`.
- **`getTareaById(id)`** — `mustFindById` con `strictTenant: true`, remapeando el 404 genérico a `TAREA_NOT_FOUND`.
- **`updateTarea(id, dto)`** — solo los tres campos editables; revalida el asignado si cambia.
- **`cambiarEstado(id, nuevo, userId, roles)`** — busca la tarea, consulta `TRANSICIONES[actual]`, rechaza con 422 si el destino no está en la lista (incluido `actual === nuevo`), exige un rol de `ROLES_REAPERTURA` cuando el origen es `completada` o `cancelada`, aplica los efectos de cierre o reapertura y guarda.
- **`reordenar(dto, tenantId)`** — dentro de una transacción: lee los ids de las tareas activas del tablero, compara conjuntos (mismo tamaño y mismos elementos) y, si difiere, lanza 422 `TAREA_REORDEN_INVALIDO` con `{ esperadas, recibidas }` en `details`; si coincide, asigna `orden = índice + 1` a cada una.
- **`deleteTarea(id)`** — `softDelete` heredado.
- **`resolveUsuarios(tareas)`** — una sola llamada a `buildUsuariosMap()` con la unión de los tres ids de usuario de la página, para armar `asignado_a`, `creada_por` y `completada_por` sin N+1.

### 6. Controller — `tareas.controller.ts`

`@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase y rutas completas por método, estilo `MesasController`. `GET /tareas/ambitos` se declara **antes** de `GET /tareas/:id` para que `ambitos` no se interprete como un id. El `PATCH` replica el guard de campos extra de `MesasController.update`, con `ALLOWED = new Set(['titulo', 'descripcion', 'asignado_a_usuario_id'])` y 400 `TAREA_FIELD_IMMUTABLE` ante cualquier otra clave.

| Método | Ruta | Roles |
|---|---|---|
| GET | `/tareas` | autenticado |
| GET | `/tareas/ambitos` | autenticado |
| GET | `/tareas/:id` | autenticado |
| POST | `/tareas` | `supervisor`, `admin_global` |
| PATCH | `/tareas/:id` | `supervisor`, `admin_global` |
| POST | `/tareas/:id/estado` | `operario`, `supervisor`, `admin_global` |
| POST | `/tareas/reordenar` | `supervisor`, `admin_global` |
| DELETE | `/tareas/:id` | `supervisor`, `admin_global` |

Los POST llevan `@HttpCode` explícito, igual que `MesasController`: `HttpStatus.CREATED` (201) en `POST /tareas` y `HttpStatus.OK` (200) en `POST /tareas/:id/estado` y `POST /tareas/reordenar`. El `DELETE` responde `ok({ deleted: true })`.

Auditoría, con `AUDIT` como constante del módulo: `tarea_created`, `tarea_updated`, `tarea_estado_changed` (con `{ from, to }`), `tarea_reordenada` y `tarea_deleted`.

### 7. Module — `tareas.module.ts`

```ts
@Module({
  imports: [
    TypeOrmModule.forFeature([Tarea]),
    TenancyModule,
    AuditModule,
    EstablecimientosModule,
  ],
  controllers: [TareasController],
  providers: [TareasService],
  exports: [TareasService],
})
export class TareasModule {}
```

Se registra en `app.module.ts` junto al resto de los módulos de feature.

## Impacto verificado en el resto del sistema

- **Ninguna tabla existente se modifica**: la migración solo crea tipos y una tabla. Las cuatro FKs apuntan a `establecimientos` y `users` sin cascadas, así que no cambian el comportamiento de esos módulos.
- **`error-codes.ts`**: solo agrega claves al objeto existente; ningún código actual cambia de valor.
- **`app.module.ts`**: una línea en `imports`. Sin providers globales nuevos, sin middlewares, sin guards globales.
- **Frontend existente**: cero impacto — todos los endpoints son rutas nuevas bajo `/tareas`.
- **Rollback**: el `down()` de la migración destruye tabla y tipos; quitar la línea de `app.module.ts` deja el sistema exactamente como antes.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Dos usuarios reordenan el mismo tablero al mismo tiempo | El request manda el conjunto completo de activas; si no coincide con lo que hay en la base, 422 `TAREA_REORDEN_INVALIDO` y el cliente recarga. Es un fallo visible en lugar de un orden corrupto silencioso (research D6). |
| Dos tareas creadas simultáneamente obtienen el mismo `orden` | `MAX(orden)+1` e INSERT en la misma transacción (patrón `createMesa`); si aun así colisionan, el desempate por `id` mantiene la lista y la paginación estables. |
| Colisión de `orden` entre una activa reordenada y una cerrada | Aceptada por diseño: las cerradas conservan su posición histórica y no participan del reordenamiento. Es inofensiva mientras todo `ORDER BY` desempate por `id`. |
| Sumar un ámbito nuevo obliga a tocar el frontend | `GET /tareas/ambitos` es la fuente de verdad; el contrato (array de `{ value, label }`) no cambia al agregar valores. |
| Un ámbito agregado por error queda para siempre | Limitación de Postgres (no hay `DROP VALUE`), ya asumida en el repo. Mientras ninguna fila lo use, el valor queda inerte. |
| Un usuario asignado se da de baja y la tarea queda sin responsable legible | `buildUsuariosMap` no filtra por `is_active` ni `deleted_at`, así que se sigue mostrando quién era (research D4). |
| `GET /tareas/:id` captura `/tareas/ambitos` | Orden de declaración explícito en el controller, más el caso cubierto en el quickstart. |

## Fuera de alcance verificado

Sin prioridad ni fecha límite: la prioridad se expresa con el orden manual. Sin subtareas, checklist ni dependencias entre tareas. Sin comentarios ni adjuntos. Sin notificaciones ni recordatorios. Sin tareas recurrentes ni plantillas. Sin vínculo a mesa, túnel, siembra o bandeja (research D2). Sin tabla de historial navegable: la trazabilidad la cubren `AuditService` más `completada_at` y `completada_por_usuario_id` (research D8). Sin restricción por `usuario_establecimiento`: el aislamiento es por tenant, igual que en todos los módulos operativos (research D7).

## Complexity Tracking

*Sin violaciones a la Constitution Check — tabla no aplica.*

La única desviación de estilo respecto del repo es usar un endpoint de estado parametrizado (`POST /tareas/:id/estado`) en lugar de endpoints semánticos por transición como `mesas/:id/dar-de-baja`. Está justificada en research D5: las cuatro transiciones ejecutan exactamente la misma lógica con distinto destino, y con endpoints separados sumar un estado en el futuro obligaría a sumar endpoints en vez de una fila en la matriz.
