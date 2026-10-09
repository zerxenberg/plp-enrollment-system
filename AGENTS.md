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

## 9. Global visual design standard

For all present and future Login, Student, Registrar, Academic Coordinator, System Administrator, and shared UI work, follow the installed `/glassmorphism-modern-gui-design` skill alongside `/frontend-design` and `/accessibility-review` when applicable.

* Preserve PLP branding, typography, content, page structure, dimensions, responsive breakpoints, and functional behavior. Prefer scoped CSS changes to JSX or business logic changes for visual refinements.
* Reuse the glass, shadow, interaction, and motion tokens in the active `src/styles/portal.css` and the established login styles in `src/components/auth/auth-portal.module.css`. Check existing rules before adding new ones. Do not style the unused `src/app/styles/portal.css` as if it were active.
* Keep glass edges, translucency, hover highlights, shadows, and green accent glows balanced. Emphasize actions according to their purpose; do not give static academic cards, records, or disabled controls clickable affordances.
* Maintain keyboard focus visibility, readable contrast, non-hover interaction feedback, touch and reduced-motion support, and responsive stability. Respect existing theme behavior if a theme switcher is introduced later.
* Verify visual changes in representative login and role portal flows, inspect desktop and mobile layouts, and run relevant lint/build checks. Do not claim untested visual or browser coverage.
* Treat UI cards according to semantics. Shared `portal-card`, `metric-card`, `info-item`, `list-item`, and `summary-strip` surfaces use restrained border and shadow feedback without movement when informational. Only whole-card links, buttons, and actionable checkbox labels may use the shared 2px hover lift and subtle green glow. Preserve default cursors on passive cards, and style true interactive cards with keyboard focus feedback.
* Use `--portal-card-motion`, `--portal-card-hover-edge`, and `--portal-card-hover-shadow` from the active portal stylesheet for future card treatments. Enrollment workflow steps reuse `.step-tabs .tab-button`, retain a persistent active state and `aria-current="step"`, and show restrained hover elevation for other enabled steps; never indicate progression or disabled states that the workflow has not defined.

## 10. Permanent authenticated portal header standard

Apply this layout to all existing and future Student, Registrar, Academic Coordinator, and System Administrator interface pages, including child views and new modules.

* Keep the PLP seal, portal name, account identity, profile access, and logout in the left sidebar. Never duplicate the university seal/name or a profile avatar/name box above the main content.
* Every authenticated page renders its own descriptive title and optional subtitle through the shared `PageHeader` in `src/components/ui/PortalUI.js`. Shared right-side utility controls come from `PortalHeaderContext` and `Topbar`, within the same compact page header row. Do not add a separate horizontal branding bar or reserve header height above the content.
* Preserve the existing role-specific `PageHeader` actions and the Enrollment term utility only where relevant. The System Administrator portal does not show the Enrollment term pill. Responsive headers may wrap without overlap; keep page content close to the top and use the active `src/styles/portal.css` spacing tokens and rules.
* The shared Online Enrollment schedule indicator (`.term-pill` in `src/styles/portal.css`) uses a clearly visible green border, slightly contrasting translucent glass gradient, restrained shadow and glow, and a subtle calendar icon surface. Preserve its text, dates, passive information semantics, and responsive icon-only treatment. Reuse this rule for every future instance; do not add page-specific copies, pointer cursors, or movement suggesting the indicator is clickable. Honor explicit dark themes and forced-colors fallbacks.
* The notification bell opens a role-specific, keyboard-accessible preview anchored to the shared header. It shows actual state from the available notification provider, supports Escape and outside-click dismissal, and links to the role's dedicated Notifications page without adding unrelated sidebar items.
* Authorized notification details and read state must remain scoped to the current authenticated identity and role. The existing demo provider holds in-memory mock notification records; do not describe this as persistent Supabase-backed delivery until a real authorized backend has been integrated.
* Do not change portal business workflows, permissions, sidebar module order, or icons to implement header presentation. Reuse the shared header and notification components on new pages; verify desktop, tablet, mobile, keyboard, and reduced-motion behavior.

## 11. Permanent internal top bar navigation standard

Use the **Modern Tab Navigation with Active Indicators** design on every existing and future page with genuine internal navigation in the Student, Registrar, Academic Coordinator, and System Administrator portals. This is the official shared navigation pattern, distinct from the sidebar, header utilities, filters, and ordinary action buttons.

* For sections that replace content within the same page, reuse `InternalTabs` from `src/components/ui/PortalUI.js`. Pass an ordered array of `{ value, label }`, the current `selected` value, `onSelect`, a descriptive `label`, and the associated panel content as children. Use `panelCard` when the content is not already enclosed in its own card, keeping the navigation and selected content as independent cards. It provides accessible `tablist`, `tab`, and `tabpanel` relationships, selected state, roving keyboard focus, and Arrow/Home/End navigation. Keep labels, order, and application state owned by the page.
* For workflow step navigation, preserve the existing `.tabs.step-tabs` group, step numbering, legal navigation behavior, and `aria-current="step"`. For filters or other mutually exclusive choices that do not replace a tab panel, use `.tabs` with `role="group"`, an accessible label, and `aria-pressed` on the buttons. Route changes must remain actual links with appropriate `aria-current`. Never assign tab semantics to controls without functional tab behavior.
* Keep the shared `.tabs` navigation surface and `.tab-button` treatment in the **active** `src/styles/portal.css`. Reuse `--portal-tab-gap`, `--portal-tab-content-gap`, and `--portal-tab-edge` rather than adding separate per-role copies. The standard uses an independent glass navigation card, buttons at least 44 CSS pixels high, readable labels, a persistent PLP green active underline spanning the entire button width (from left edge to right edge), and a tinted selected surface. The selected content appears in a separate independent card with its own border, rounded corners, background, padding and shadow, approximately 24px below the navigation. Never enclose both cards within another shared visual card.
* Maintain subdued inactive surfaces, restrained hover highlights, strong `:focus-visible` indicators, clear disabled states, reduced motion, accessible contrast, and forced-colors fallbacks. Never rely on color or hover alone to show the active section. Do not imply that static content cards are navigational.
* Keep multi-step Enrollment navigation in its approved order, using four columns at spacious desktop widths, two columns at tablet widths, and accessible horizontal scrolling on narrow screens. Other tab groups may scroll horizontally when labels cannot fit without shrinking text. Ensure no page-level overflow, clipped content, or inaccessible hidden options.
* Adapt the existing pattern whenever new internal navigation is introduced, across all four roles, without changing authorization, business state, sidebar routing, or page content to fit the design. Verify interaction, keyboard operation, responsive layout, CSS cascade, and available lint/build checks before merging changes.
