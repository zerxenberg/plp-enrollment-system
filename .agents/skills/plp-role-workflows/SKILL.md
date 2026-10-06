---
name: plp-role-workflows
description: Apply the finalized PLP four role responsibility boundaries, portal modules, protected routes, allowed actions, and cross role handoffs when implementing role specific pages or permissions.
---

# PLP Role Workflows

Use this skill for role routing, sidebar modules, portal pages, permissions, dashboards, protected actions, and cross role workflow handoffs.

## Four role model

The final system has exactly four primary roles: Student, Registrar, Academic Coordinator, and System Administrator. Do not recreate the obsolete combined Registrar Administrator role.

### Student

Owns self service enrollment choices, correction responses, own allowed profile fields, and viewing own records.

Permanent modules are Dashboard, Enrollment, Academic Records, Class Schedule, Notifications, and Student Profile. Admission Status is conditional only while Admission is relevant. Subject Registration, validation, status, confirmation, and enrollment documents remain inside Enrollment. Settings remain inside Student Profile.

The Student must not edit academic rules, other students, final enrollment confirmation, or technical administration data.

### Registrar

Owns official student enrollment records, enrollment queue and review, authorized record corrections, enrollment period operations, Registrar validation, final confirmation, Registrar reports, and enrollment related announcements.

Primary modules are Dashboard, Students, Enrollment, Academic & Scheduling, Reports & Monitoring, and Notifications.

The Registrar may reference curricula, prerequisites, sections, schedules, and capacity information required for enrollment. The Registrar must not own curriculum design, prerequisite rule creation, user and permission administration, security configuration, database administration, backups, or infrastructure.

### Academic Coordinator

Owns programs, curriculum versions, subjects, prerequisites, subject offerings, sections, schedules, capacity planning, academic rules, and defined academic exception decisions.

Primary modules are Dashboard, Academic Setup, Sections & Schedules, Academic Review, and Reports & Monitoring.

The Academic Coordinator may review only the enrollment context needed for academic decisions. The Academic Coordinator must not perform final Registrar confirmation, unrestricted student record administration, or technical system administration.

### System Administrator

Owns user accounts, predefined roles, permissions, access activity, authentication administration, protected integration settings, API and synchronization monitoring, security configuration, database maintenance, backups and recovery, technical audit logs, errors, and system health.

Primary modules are Dashboard, Users & Access, System Integration, System Administration, and Audit & Monitoring.

The System Administrator must not change curriculum decisions, academic exceptions, official student enrollment records, or final enrollment confirmation merely because technical access exists.

## Cross role handoff rules

1. Student selections remain nonfinal until Registrar confirmation.
2. Academic Coordinator decisions resolve defined academic exceptions but do not confirm enrollment.
3. Registrar uses academic setup as reference and does not replace Academic Coordinator rules through ordinary enrollment workflows.
4. System Administrator resolves technical access and integration issues but routes business corrections to the owning role.
5. Important handoffs must preserve actor, role, reason, timestamp, affected record, prior state when relevant, and resulting state.

## Route and permission behavior

Use protected route areas for `/student`, `/registrar`, `/academic-coordinator`, and `/system-administrator`.

Do not treat hidden buttons as authorization. Server side or trusted backend checks must enforce the same role boundaries as the interface.

For every protected action, identify the owner, entry condition, allowed action, validation, failure state, next state, and audit requirement before implementation.

Use least privilege. A role may receive read or reference access to another role's data only when the finalized workflow requires it.

## Interface consistency

Dashboard cards and quick actions should open existing parent modules rather than create duplicate feature pages. Preserve the finalized sidebar structure unless a project decision explicitly changes it.
