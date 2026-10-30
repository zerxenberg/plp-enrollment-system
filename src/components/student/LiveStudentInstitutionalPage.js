import "server-only";

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/PortalUI";
import { getStudentContext } from "@/features/students/student-context-server";

export async function LiveStudentInstitutionalPage({ section }) {
  const ctx = await getStudentContext();
  if (ctx.kind !== "live") return null;

  const [userResult, enrollmentResult] = await Promise.all([
    ctx.admin.from("app_users").select("full_name,email")
      .eq("id", ctx.appUserId).maybeSingle(),
    ctx.admin.from("enrollments")
      .select("id,reference,status,confirmed_at,confirmation_reference,term_id")
      .eq("student_id", ctx.studentId)
      .order("created_at", { ascending: false }).limit(10),
  ]);
  const name = userResult.data?.full_name || "Student";
  const enrollments = enrollmentResult.error ? [] : enrollmentResult.data || [];
  const official = enrollments.find((row) => row.status === "CONFIRMED" && row.confirmed_at);
  const latest = enrollments[0];
  const nextStep = official
    ? "Your Registrar-confirmed enrollment has been recorded."
    : latest
      ? "Your enrollment application is awaiting Registrar confirmation."
      : "You are admitted. The Registrar must evaluate and place you before your first official enrollment.";
  const title = section === "Dashboard" ? "Student Dashboard" : section;

  return (
    <>
      <PageHeader title={title} description="PLP Enrollment institutional student portal" />
      <Card>
        <h2>Welcome, {name}</h2>
        <p>Student Number: {ctx.studentNumber}</p>
        <p>Program: {ctx.programCode || "Pending Registrar review"}</p>
        <p>Admission Status: {ctx.studentStatus || "Pending review"}</p>
        <p>Official Enrollment: {official ? "Officially Enrolled" : "Pending"}</p>
        {official ? <p>Confirmed term: {official.term_id}</p> : null}
        <div className="notice">{nextStep}</div>
        {section === "Academic Records" ? (
          <p>Only Registrar-published academic history will appear here. No fictional project grades are displayed for institutional students.</p>
        ) : null}
        {section === "Class Schedule" ? (
          <p>{official
            ? "Your enrollment is confirmed. Consult the Registrar for published section and class meeting assignments."
            : "No official class timetable has been assigned yet."}</p>
        ) : null}
        {section === "Enrollment" ? <p>Check with the Registrar for curriculum evaluation, section placement, and enrollment confirmation.</p> : null}
        <p><Link href="/student/student-profile">View your student profile</Link></p>
      </Card>
    </>
  );
}
