---
name: plp-project-architecture
description: Apply the approved PLP Next.js App Router architecture, project folder structure, route organization, naming conventions, shared component boundaries, and frontend to backend consistency rules.
---

# PLP Project Architecture

Use this skill when creating files, routes, components, feature modules, constants, Supabase helpers, validation helpers, migrations, or project structure.

## Approved stack

Use one Next.js application with JavaScript and the App Router. Deploy through Vercel. Use Supabase for authentication and backend data access with PostgreSQL as the enrollment database.

Do not split the four roles into four separate applications. Keep protected role route areas inside the same project and share reusable UI and business logic.

## Approved organization

Follow this structure as the target architecture while creating only folders that current implementation work actually needs:

```text
public/assets/
src/app/(auth)/
src/app/(portal)/student/
src/app/(portal)/registrar/
src/app/(portal)/academic-coordinator/
src/app/(portal)/system-administrator/
src/components/ui/
src/components/layout/
src/components/shared/
src/components/student/
src/components/registrar/
src/components/academic-coordinator/
src/components/system-administrator/
src/features/enrollment/
src/features/academic/
src/features/students/
src/features/notifications/
src/features/reporting/
src/features/integration/
src/lib/supabase/
src/lib/auth/
src/lib/permissions/
src/lib/validation/
src/config/
src/constants/
src/utils/
src/styles/
supabase/migrations/
supabase/seed/
docs/
```

Route files should stay thin. A `page.js` should assemble the page and delegate reusable presentation to components and reusable business behavior to feature or library modules.

## Route map

Student routes live under `/student` and include dashboard, enrollment, academic records, class schedule, notifications, and student profile.

Registrar routes live under `/registrar` and include dashboard, students, enrollment, academic scheduling, reports and monitoring, and notifications.

Academic Coordinator routes live under `/academic-coordinator` and include dashboard, academic setup, sections and schedules, academic review, and reports and monitoring.

System Administrator routes live under `/system-administrator` and include dashboard, users and access, system integration, system administration, and audit and monitoring.

## Naming standard

Use English business names consistently. Do not introduce alternate names for finalized roles, modules, or statuses.

Use kebab case for general and route folders. Keep Next.js reserved files such as `page.js`, `layout.js`, `loading.js`, and `error.js` lowercase.

Use PascalCase for React component files, kebab case for noncomponent JavaScript files, camelCase for variables and functions, `is`, `has`, `can`, or `should` prefixes for booleans, and UPPER_SNAKE_CASE for shared constants and canonical status codes.

Use lowercase snake case plural database table names and lowercase snake case database columns.

Use Conventional Commit style when writing Git commit messages.

## Separation of concerns

Keep presentation, domain logic, persistence, and external integration responsibilities separate. Do not bury authoritative workflow transitions inside display components.

Centralize canonical statuses in `src/constants` or an equivalent shared source. Centralize role permission checks in `src/lib/permissions`. Centralize Supabase client creation in `src/lib/supabase`.

Reuse existing components, validation functions, and feature logic before creating new implementations. Do not create duplicate pages merely because a dashboard card or quick action needs to open a function.

## Admission integration boundary

The Enrollment application must not recreate the full external Admission System. Keep Admission transfer presentation and technical synchronization support under the integration feature area. Historical Admission data is read only after handoff except for authorized technical reconciliation that does not change the Admission decision.

## Change discipline

Before adding a new file, search for the existing responsibility and choose the approved layer. Keep scope limited to the requested feature. Do not create speculative abstractions or extra dependencies that the current implementation does not need.
