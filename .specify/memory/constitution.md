<!--
Sync Impact Report
Version change: template-placeholder → 1.0.0
Added principles:
- I. Template First
- II. Multi-Tenancy
- III. Error Handling
- IV. Audit
- V. Roles
- VI. Transactions
- VII. API Responses
- VIII. Code Quality
- IX. Modules
- X. Small Steps
Added sections:
- Additional Constraints
- Development Workflow
Removed sections:
- none
Templates reviewed:
- .specify/templates/plan-template.md ✅ reviewed
- .specify/templates/spec-template.md ✅ reviewed
- .specify/templates/tasks-template.md ✅ reviewed
Follow-up TODOs:
- None
-->

# agrisano-backend Constitution

## Core Principles

### I. Template First
All new modules must extend existing base classes and shared infrastructure in `src/common/*`.
This includes `BaseCrudTenantService`, `BaseCrudController`, and `BaseEntity`.
Do not duplicate business logic already implemented in common utilities; reuse template primitives
for validation, tenant scope, and CRUD behavior.

### II. Multi-Tenancy
Every entity is tenant-bound by default unless an explicit architectural justification is documented.
Use `TenancyService`, `tenantContext`, and tenant-aware repository access consistently.
Avoid any design that exposes cross-tenant data or allows queries across tenant boundaries.

### III. Error Handling
Expected business failures must be expressed with `AppError` and the `ErrorCodes` enum.
Do not use `throw new Error()` for validation failures, authorization denials, missing resources,
or other recoverable domain cases. Centralized error classes preserve API consistency and
simplify HTTP mapping.

### IV. Audit
Sensitive operations — including create, delete, state transitions, and admin actions — must
write audit records through `AuditService`.
Audit logging is mandatory for operations that change business state, access rights, or tenant
security posture.

### V. Roles
Enforce role checks with `JwtAuthGuard` and `RolesGuard`.
Recognized roles are `admin`, `operario`, `supervisor`, and `admin_global`.
New roles may only be added after verifying they do not break existing authentication or
authorization flows.

### VI. Transactions
Critical flows must execute inside atomic database transactions.
This includes harvest processing with FIFO recalculation, chemical stock consumption,
transplant operations, and any other multi-step state or inventory changes.
Failures must rollback fully to prevent partial updates.

### VII. API Responses
All controllers must use `src/common/http/api-response.ts` helpers such as `ok()` and `page()`.
Never return raw entities, raw objects, or ad-hoc payload wrappers directly from API endpoints.
Consistent response shapes are required for client stability and observability.

### VIII. Code Quality
Maintain TypeScript strict mode and avoid `any` in application code.
All DTOs must use `class-validator` rules and explicit typings.
Document public endpoints with JSDoc and keep service contracts clear and type-safe.

### IX. Modules
One feature equals one module under `src/modules/<name>`.
Do not import feature code directly across modules; use shared services or common modules
for cross-cutting behavior only. This prevents tight coupling and preserves module ownership.

### X. Small Steps
Implement one module at a time, fully tested and integrated before moving to the next.
Avoid scope creep by validating each feature independently and keeping iterations small.

## Additional Constraints
The backend is built on NestJS with TypeORM and PostgreSQL.
Preserve the existing repository structure in `src/`, `src/common/`, `src/modules/`, and `src/infra/`.
All new work must respect shared tenancy, audit, and error handling infrastructure.

## Development Workflow
Pull requests must include a constitution checklist covering tenant isolation, error handling,
audit writes, role enforcement, transactions, API response shape, and strict typing.
New modules require integration tests and a working validation path before they are merged.
Changes to tenancy, audit, or authorization behavior must be documented and reviewed explicitly.

## Governance
This constitution defines the core backend governance for agrisano-backend.
Amendments require a documented rationale, peer review, and a version update.
Compliance reviews must verify every PR against these principles.

Version bumps follow semantic rules:
- MAJOR: remove or redefine an existing principle, or change governance semantics.
- MINOR: add a new principle or materially expand guidance.
- PATCH: clarify wording, fix typos, or refine existing guidance without changing meaning.

**Version**: 1.0.0 | **Ratified**: 2026-06-04 | **Last Amended**: 2026-06-04

