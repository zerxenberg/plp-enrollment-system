"use client";

import { Card, EmptyState, PageHeader } from "@/components/ui/PortalUI";

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
  const mode = authenticatedProfile?.mode;
  const kind = authenticatedProfile?.kind;
  const isProject = mode === "project" || kind === "complete";

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

  // The actual modules now perform server-side identity and ownership checks
  // before loading database-backed student content.
  return children;
}
