import { NextResponse } from "next/server";
import { getConfirmedProjectDemonstrationCor } from "@/features/students/student-portal-actions";
import { verifiedProjectCorDocument } from "@/features/cor/cor-access-server";
import { verifiedCorResponse } from "@/features/cor/cor-response";

export const runtime = "nodejs";

// Student identity and ownership are resolved by requireStudentContext and
// the protected COR RPC; no browser-supplied student ID is accepted here.
export async function GET(request) {
  let stage = "authorized registration";
  try {
    const cor = await getConfirmedProjectDemonstrationCor();
    stage = "verified COR document";
    const document = await verifiedProjectCorDocument(cor, cor.projectFeeEstimate);
    stage = "PDF renderer";
    return await verifiedCorResponse(request, document,
      cor.registration_reference || cor.simulation_id);
  } catch (error) {
    const roleMismatch = String(error?.digest || "").startsWith("NEXT_REDIRECT;") ||
      error?.message === "Student account verification is required.";
    // Keep detailed failures in the local server log, never return student data,
    // secret keys, internal SQL or implementation details to the browser.
    console.warn(
      `[COR][Student] PDF unavailable | stage=${stage} | code=${roleMismatch ? "SESSION_ROLE" : "VERIFICATION_FAILED"} | reason=${roleMismatch ? "Wrong or expired portal session" : String(error?.message || "Unknown error")}`,
    );
    return NextResponse.json({
      error: roleMismatch
        ? "Please sign in with your Student account to view this registration."
        : "The confirmed registration PDF could not be generated. Please refresh the enrollment page and try again.",
      code: roleMismatch ? "SESSION_ROLE" : "PDF_UNAVAILABLE",
    }, {
      status: roleMismatch ? 401 : 422, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
