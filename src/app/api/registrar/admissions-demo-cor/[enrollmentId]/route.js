import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { admissionsDemoCorDocument } from "@/features/cor/admissions-demo-cor-server";
import { verifiedCorResponse } from "@/features/cor/cor-response";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  try {
    await requireRole("registrar");
    const { enrollmentId } = await params;
    if (!UUID.test(String(enrollmentId))) {
      return NextResponse.json({ error: "Invalid demonstration registration." }, {
        status: 400, headers: { "Cache-Control": "private, no-store" },
      });
    }

    // Read only the verified Admissions demonstration ledger after confirming
    // the Registrar session. The shared service rejects official and unconfirmed
    // enrollments before any PDF is rendered.
    const document = await admissionsDemoCorDocument(createAdminClient(), enrollmentId);
    return await verifiedCorResponse(request, document);
  } catch (error) {
    const roleMismatch = String(error?.digest || "").startsWith("NEXT_REDIRECT;");
    console.warn(
      `[COR][Registrar][Admissions] PDF unavailable | code=${roleMismatch ? "SESSION_ROLE" : "VERIFICATION_FAILED"}`,
    );
    return NextResponse.json({
      error: roleMismatch
        ? "Please sign in with your Registrar account to view this registration."
        : "The confirmed Admissions demonstration COR is unavailable. Please reopen the enrollment and try again.",
      code: roleMismatch ? "SESSION_ROLE" : "PDF_UNAVAILABLE",
    }, {
      status: roleMismatch ? 401 : 422,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
