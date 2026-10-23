"use client";

import { Card, EmptyState, PageHeader } from "@/components/ui/PortalUI";

/**
 * Presentation boundary for the two verified Student Portal domains:
 * - project: protected classroom demonstration account
 * - institutional: normal PLP Student account, including Admissions handoffs
 *
 * Database authorization remains enforced server-side and through existing RLS/RPC rules.
 */
export default function ProjectOnlyStudentModuleBoundary({ authenticatedProfile, children }) {
  const mode=authenticatedProfile?.mode;
  if(mode!=="project"&&mode!=="institutional"){
    return <>
      <PageHeader title="Student Portal" description="Account verification is required."/>
      <Card><EmptyState title="Student information unavailable"
        description="Your authenticated Student account could not be verified. Please sign in again or contact the System Administrator."/></Card>
    </>;
  }
  return children;
}
