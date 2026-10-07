import { Suspense } from "react";
import RegistrarEnrollment from "@/components/registrar/RegistrarEnrollment";
import { LoadingState } from "@/components/ui/PortalUI";

export const metadata = {title:"Registrar Enrollment"};

export default function RegistrarEnrollmentPage() {
  return <Suspense fallback={<LoadingState label="Loading enrollment queue..." />}><RegistrarEnrollment /></Suspense>;
}
