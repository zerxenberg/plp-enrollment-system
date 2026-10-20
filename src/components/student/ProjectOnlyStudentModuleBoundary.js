"use client";

import { usePathname } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui/PortalUI";

const PROFILE_ROUTE = "/student/student-profile";

const MODULE_TITLES = Object.freeze({
  "/student/dashboard": "Student Dashboard",
  "/student/enrollment": "Enrollment",
  "/student/academic-records": "Academic Records",
  "/student/class-schedule": "Class Schedule",
  "/student/notifications": "Notifications",
});

/**
 * Wrap the existing Student page children inside PortalLayout so that the
 * sidebar and shared header remain available. The parent must pass only
 * serializable, trusted server-resolved profile metadata:
 *   { mode: "project" | "demo" | "unavailable" }
 * A verified first-login server state also supports kind "complete" or
 * "legacy". Never infer this from client storage or a source key alone.
 *
 * This is a presentation boundary. Supabase authorization and RLS must
 * independently protect the underlying student data and all write actions.
 */
export default function ProjectOnlyStudentModuleBoundary({
  authenticatedProfile,
  children,
}) {
  const pathname = usePathname();
  const currentPath = typeof pathname === "string"
    ? pathname.replace(/\/+$/, "") || "/"
    : "";

  // The separately authenticated Student Profile page has its own exact
  // identity-to-profile lookup and an unavailable state when verification fails.
  if (currentPath === PROFILE_ROUTE) return children;

  const mode = authenticatedProfile?.mode;
  const kind = authenticatedProfile?.kind;
  const isProject = mode === "project" || kind === "complete";
  const isLegacy = (mode === "demo" || kind === "legacy") &&
    (mode === undefined || mode === "demo") &&
    (kind === undefined || kind === "legacy");

  if (isLegacy && !isProject) return children;

  if (!isProject || mode === "demo" || kind === "legacy") {
    return (
      <>
        <PageHeader title="Student Portal" description="Account verification is required." />
        <Card>
          <EmptyState
            title="Student information unavailable"
            description="Your authenticated Student account could not be verified. Please sign in again or contact the System Administrator."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={MODULE_TITLES[currentPath] || "Student Portal"}
        description="Classroom demonstration account"
      />
      <Card>
        <EmptyState
          title="Not yet available from verified academic source"
          description="This PROJECT_ONLY account is fictional. This module currently uses shared demonstration records that do not belong to your authenticated student profile. Verified admission, grades, enrollment details, schedules, and personal notifications are not available on this page."
        />
      </Card>
    </>
  );
}
