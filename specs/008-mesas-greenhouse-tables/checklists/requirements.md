# Specification Quality Checklist: M08 — Mesas (Greenhouse Tables)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

All 16 checklist items pass. Clarification session 2026-06-05 completed (7 questions answered). Specification ready for `/speckit-plan`.

Key decisions confirmed during clarification:
- `GET /tuneles/:tunel_id/mesas` lives in MesasController (no prefix, explicit full-path routes) — NOT TunelesController
- dar-de-baja allowed from "activa" AND "en_cosecha"; blocked from "baja" → MESA_ESTADO_INVALIDO 409
- reactivar allowed only from "baja"; blocked from "activa"/"en_cosecha" → MESA_ESTADO_INVALIDO 409
- codigo_qr is a plain UUID v4 — no prefix, globally unique constraint
- PATCH rejects immutable fields with MESA_FIELD_IMMUTABLE 400
- HistorialMesaService exported from MesasModule for M09/M10/M11 injection
- posicion_actual assignment wrapped in atomic transaction at creation

Scope boundaries:
- `en_cosecha` estado is set by M11 only (not in scope for this module's write endpoints)
- Tunnel capacity enforcement is M10/M11 responsibility
- posicion_actual management after creation is owned by M10/M11 transplant flows
