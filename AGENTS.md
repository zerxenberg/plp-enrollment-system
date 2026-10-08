# PLP Enrollment System Policy

This file is the permanent repository wide policy for coding agents working on `plp-enrollment-system`.

## 1. Instruction hierarchy

Follow instructions in this order: the current user task, this `AGENTS.md`, relevant PLP project skills in `.agents/skills`, then reusable global coding skills. Project skills contain PLP rules. Global skills contain general engineering methods.

When finalized PLP planning documents are available, treat them as the source of truth. Prefer the four finalized role GUI documents, then the Unified Student Portal Workflow interpreted with the newer Student GUI, then the finalized planning references. Do not replace finalized decisions with generic assumptions.

## 2. Required project skills

Before implementing related behavior, read the relevant skill:

* `.agents/skills/plp-enrollment-domain/SKILL.md` for lifecycle, canonical statuses, Admission handoff, enrollment transitions, correction, and confirmation.
* `.agents/skills/plp-role-workflows/SKILL.md` for role boundaries, portal modules, route access, permissions, and cross role handoffs.
* `.agents/skills/plp-academic-validation/SKILL.md` for eligibility, curriculum, prerequisites, Regular and Irregular classification, progression, units, sections, schedules, and Academic Review.
* `.agents/skills/plp-data-security/SKILL.md` for Supabase, PostgreSQL, RLS, authentication, authorization, entity ownership, audit, and server validation.
* `.agents/skills/plp-project-architecture/SKILL.md` for Next.js structure, routes, naming, file placement, shared components, and integration boundaries.

Read only skills relevant to the task. Do not duplicate global instructions in project skills.

## 3. Architecture invariants

Use one JavaScript Next.js App Router application deployed through Vercel with Supabase and PostgreSQL. Keep Student, Registrar, Academic Coordinator, and System Administrator as four separate roles in one application.

Follow the approved folder structure and naming conventions. Keep route files thin. Reuse shared components and feature logic. Separate presentation from business rules, persistence, permissions, and integration.

Check existing code before creating files, functions, components, tables, routes, or abstractions. Avoid duplicates.

## 4. Business invariants

Preserve one permanent student identity. Admission remains external. Continuing students never repeat Admission or create another account.

Use canonical status codes and legal transitions. Do not invent alternate workflow labels. Registrar confirmation is the final authority for official term enrollment.

Evaluate subject eligibility individually. A failed prerequisite normally blocks the dependent subject, not the entire enrollment. Irregular classification does not mean enrollment rejection.

Do not hardcode unresolved institutional policy values such as passing thresholds, unit limits, overload ceilings, probation rules, year level promotion rules, or corequisite policy. Keep them configurable until confirmed.

## 5. Security and data rules

Enforce authentication and authorization with trusted server side or database controls, not only frontend visibility. Apply least privilege and Supabase RLS by role, identity, record ownership, and finalized entity authority.

Never hardcode or commit passwords, tokens, API keys, service role keys, or other secrets. Use environment variables and keep `.gitignore` protective. Never expose privileged server secrets to browser code.

Validate sensitive operations on the server. Protect student and academic information. Preserve relationships, constraints, canonical statuses, and confirmed history.

Audit important state changes, authorized corrections, academic decisions, confirmation, permission changes, and integration events.

## 6. Change workflow

Before editing, inspect relevant code, nearby conventions, the current Git diff, and applicable PLP skill. Preserve useful existing work and unrelated user changes.

Implement the smallest coherent solution. Avoid unnecessary dependencies, speculative abstractions, broad rewrites, and unrelated cleanup.

Handle expected validation, permission, conflict, empty, loading, and server error states. Do not leak sensitive technical details to users.

Run the narrowest relevant verification first, then lint, tests, build, database checks, or browser workflows as appropriate. Verify permissions and failure paths too.

Do not claim a task is complete unless the available evidence supports it. Report anything that could not be tested.

## 7. Repository safety

Do not delete or overwrite useful files without a clear reason. Do not reset, clean, checkout over, or broadly reformat work that may belong to the user or another collaborator.

Do not change finalized business rules merely to simplify implementation. If a real conflict is found, identify the conflict and preserve the safer existing rule until the project decision is clarified.

## 8. Global icon standard

Apply this rule to every existing and future interface in the centralized login, Student, Registrar, Academic Coordinator, System Administrator, and shared UI areas.

* Use `lucide-react` exclusively for functional UI icons. Use only verified official exports; do not invent icon names, draw custom SVG paths, or introduce alternate icon libraries or Unicode symbols as substitutes for functional icons. University seals and other brand artwork remain image assets.
* Render icons through `src/components/ui/AppIcon.js`, the single shared `ICON_REGISTRY`. Add a semantically appropriate verified Lucide export and a stable function-based registry key there when introducing a new icon. Do not import `lucide-react` directly into feature or page components, create parallel icon wrappers, or silently substitute a generic icon for unknown keys.
* Match icons to actions and meanings. Reuse the same key for the same function across portals; use distinct icons for unrelated functions when a better match exists. Avoid duplicate icons caused by conditional rendering, nested controls, or CSS artwork.
* Preserve consistent stroke weight, scale, spacing, contrast, and alignment. Use the shared icon's defaults unless context requires a class-based size override; ensure the icon remains legible at mobile breakpoints, zoom, and in both themes.
* Decorative icons must be hidden from screen readers. Icon-only interactive controls require a meaningful accessible name on the control. If an icon itself conveys information unavailable in surrounding text, supply `title` to `AppIcon`. Keep all icons usable with visible keyboard focus and reduced motion preferences.
* After changing icons, verify registry keys and official imports, check for duplicate/broken icons and responsive overlaps, and run `npm run lint` and `npm run build`. The ESLint configuration rejects direct icon-library imports and hand-authored inline SVG elements outside the registry.
