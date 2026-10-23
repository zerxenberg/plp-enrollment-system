import { Suspense } from "react";
import RegistrarEnrollment from "@/components/registrar/RegistrarEnrollment";
import { LoadingState } from "@/components/ui/PortalUI";
import { loadRegistrarProjectSimulationHistory, loadRegistrarProjectSimulationQueue } from "@/features/academic/registrar-project-simulations";

export const metadata = {title:"Registrar Enrollment"};

export default async function RegistrarEnrollmentPage() {
  const [projectSimulationQueue, projectSimulationHistory] = await Promise.all([
    loadRegistrarProjectSimulationQueue(),
    loadRegistrarProjectSimulationHistory(),
  ]);
  return <Suspense fallback={<LoadingState label="Loading enrollment queue..." />}><RegistrarEnrollment projectSimulationQueue={projectSimulationQueue} projectSimulationHistory={projectSimulationHistory} /></Suspense>;
}
