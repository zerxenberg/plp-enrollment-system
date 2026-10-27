import { NextResponse } from "next/server";
import { registrarProjectCorDocument } from "@/features/cor/cor-access-server";
import { verifiedCorResponse } from "@/features/cor/cor-response";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  let stage = "authorized registration";
  try {
    const { simulationId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(simulationId)) throw new Error("Invalid reference");
    const document = await registrarProjectCorDocument(simulationId);
    stage = "PDF renderer";
    return await verifiedCorResponse(request, document, simulationId);
  } catch (error) {
    const roleMismatch = String(error?.digest || "").startsWith("NEXT_REDIRECT;");
    console.warn(
      `[COR][Registrar] PDF unavailable | stage=${stage} | code=${roleMismatch ? "SESSION_ROLE" : "VERIFICATION_FAILED"} | reason=${roleMismatch ? "Wrong or expired portal session" : String(error?.message || "Unknown error")}`,
    );
    return NextResponse.json({
      error: roleMismatch
        ? "Please sign in with your Registrar account to view this registration."
        : "The demonstration COR could not be generated. Please reopen the confirmed enrollment and try again.",
      code: roleMismatch ? "SESSION_ROLE" : "PDF_UNAVAILABLE",
    }, {
      status: roleMismatch ? 401 : 422, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
