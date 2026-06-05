# Research: M01 — Establecimientos

**Branch**: `001-establecimientos` | **Date**: 2026-06-04

## Resolved Decisions

---

### Decision 1 — Base service class name

**Decision**: The class to extend is `BaseCrudTenantService<T extends TenantEntity>` (not `BaseCrudService`).
**Rationale**: File is `src/common/crud/base-crud.service.ts`; the exported class name is `BaseCrudTenantService`. The constitution uses this as a shorthand for the same thing.
**Constructor**: `constructor(protected readonly repo: Repository<T>)` — single repo injection. Additional deps go in the subclass constructor, calling `super(repo)`.
**Alternatives considered**: Wrapping/composing instead of extending — rejected; extending is the established pattern and avoids delegation boilerplate.

---

### Decision 2 — Role-scoped list implementation

**Decision**: Use `customizeQb` option in `BaseCrudTenantService.list()` to INNER JOIN `usuario_establecimiento` for supervisor/operario roles. Admin_global uses the standard tenant-scoped list without extra JOIN.
**Rationale**: `list()` already applies tenant scope via `applyTenantScopeQb`, then calls `opts.customizeQb?.(qb, alias)`. Adding an INNER JOIN here naturally filters to assigned establishments only, with no result for unassigned ones.
**Implementation**:
```
admin_global → super.list(q, { searchColumns: ['nombre'], filterAllowed: ['activo'], ... })
supervisor/operario → super.list(q, { ..., customizeQb: (qb, alias) => {
  qb.innerJoin('usuario_establecimiento', 'ue',
    `ue.establecimiento_id = ${alias}.id AND ue.user_id = :userId`, { userId })
}})
```
**Alternatives considered**: Post-filter after full tenant list — rejected; less efficient for large tenants and produces incorrect pagination counts.

---

### Decision 3 — Single establishment access (404 vs 403)

**Decision**: For `getOne()`, implement a two-path lookup in the service:
- `admin_global`: call `mustFindById(id)` — throws 404 if not in tenant.
- `supervisor/operario`: QueryBuilder with INNER JOIN on assignment; if no result → throw `AppError NOT_FOUND` (404). This path NEVER reveals whether the establishment exists for unassigned users.

**Rationale**: Returning 403 would confirm the establishment exists. 404 is correct for security (spec clarification Q2).
**Implementation in service**:
```typescript
async findOneForUser(id: string, actor: { userId: string; roles: string[] }): Promise<Establecimiento>
```
**Alternatives considered**: Separate permission check after lookup — rejected; would require two DB calls and still risks timing side-channels.

---

### Decision 4 — Audit action strings (not ErrorCodes)

**Decision**: Audit action values are plain string constants defined in the service file. They are NOT added to `ErrorCodes` enum.
**Rationale**: `ErrorCodes` maps to HTTP error responses. Audit `action` field in `AuditLog` is a `varchar(80)` string. Existing pattern in `AdminUsersController` uses plain strings: `'create'`, `'update'`, `'soft_delete'`. Mixing audit events into ErrorCodes would violate single-responsibility.
**Constants** (defined at top of `establecimientos.service.ts`):
```typescript
const AUDIT = {
  CREATED:      'establecimiento_created',
  UPDATED:      'establecimiento_updated',
  DEACTIVATED:  'establecimiento_deactivated',
  DELETED:      'establecimiento_deleted',
  USER_ASSIGNED: 'usuario_asignado',
  USER_REMOVED:  'usuario_removido',
} as const;
```
**Alternatives considered**: Adding to ErrorCodes — rejected; wrong semantic scope. Separate constants file — unnecessary for module-local constants.

---

### Decision 5 — New ErrorCodes to add

**Decision**: Add three new error codes to `src/common/errors/error-codes.ts` for domain-specific error handling:
- `ESTABLECIMIENTO_NOT_FOUND` — used when an establishment cannot be found in the tenant scope (semantically clearer than generic NOT_FOUND for clients)
- `ASSIGNMENT_NOT_FOUND` — used when trying to remove a non-existent assignment
- `ASSIGNMENT_CONFLICT` — used when a duplicate assignment attempt violates the UNIQUE constraint

**Rationale**: Generic `NOT_FOUND` and `CONFLICT` work at the HTTP layer, but domain-specific codes let API clients distinguish "no establishment" from "no user" errors without parsing messages.
**Alternatives considered**: Reuse generic `NOT_FOUND` / `CONFLICT` — acceptable but reduces client-side debuggability.

---

### Decision 6 — listUsers implementation

**Decision**: `EstablecimientosModule` imports `UsersModule` (one-directional dependency). `EstablecimientosService` injects `UsersService` to: (a) validate assignee user exists in the current tenant during `assignUser()`, and (b) return user email/is_active alongside assignment data in `listUsers()`.
**Rationale**: No circular dependency risk (`UsersModule` does not import `EstablecimientosModule`). Reusing `UsersService` avoids duplicating user lookup logic.
**Alternatives considered**: Inject `User` repository directly in service — avoids module dependency but breaks encapsulation; rejected. Raw SQL join — too low-level for this codebase style.

---

### Decision 7 — Audit call location

**Decision**: Audit writes happen in CONTROLLERS (same as `AdminUsersController` pattern), not in services. Services handle business logic and throw errors; controllers handle HTTP concerns including audit.
**Rationale**: Matches established project pattern exactly. Services remain testable without mocking AuditService.
**Pattern**:
```typescript
const payload = auditLogPayload({ requestId: req.id, actorUserId: req.user?.sub, ... });
this.logger.info(payload, 'admin_audit');
await this.audit.write('admin', {
  request_id: req.id, method: req.method, path: req.url, status_code: 201,
  actor_user_id: req.user?.sub ?? null, actor_email: req.user?.email ?? null,
  action: 'establecimiento_created', entity: 'establecimiento',
  tenant_id: req.tenantId ?? null, payload,
});
```

---

### Decision 8 — Current user access in controllers

**Decision**: Use `@Req() req: any` and read `req.user` (typed as `JwtPayload: { sub, email, roles, tenant_id }`). Use `@CurrentUser()` decorator from `src/modules/auth/decorators/current-user.decorator.ts` where possible.
**Rationale**: `JwtPayload` type is defined in `src/modules/auth/types/jwt-payload.type.ts`. `req.user.roles: string[]` is what `RolesGuard` checks. `req.user.sub` is the actor user ID for audit.

---

### Decision 9 — Migration timestamp

**Decision**: Use the next available timestamp after `1770146493842`. Suggested: `1770200000000-EstablecimientosInit.ts`.
**Rationale**: TypeORM migration ordering is timestamp-based. The new migration must be strictly greater than the last migration timestamp.
