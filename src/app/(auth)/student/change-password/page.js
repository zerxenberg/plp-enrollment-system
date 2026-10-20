import "@/styles/portal.css";
import { redirect } from "next/navigation";
import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";
import FirstLoginPasswordForm from "@/components/student/FirstLoginPasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const state = await getProjectOnlyInitialPasswordState()
    .catch(() => ({ kind: "denied" }));
  if (state.kind === "complete") redirect("/student/student-profile");
  if (state.kind !== "required") redirect("/");
  return <FirstLoginPasswordForm />;
}
