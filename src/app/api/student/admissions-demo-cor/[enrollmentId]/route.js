import { NextResponse } from "next/server";
import { getStudentContext } from "@/features/students/student-context-server";
import { admissionsDemoCorDocument } from "@/features/cor/admissions-demo-cor-server";
import { verifiedCorResponse } from "@/features/cor/cor-response";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  let stage = "authorized student registration";
  try {
    const context = await getStudentContext();
    if (context.kind !== "live") {
      return NextResponse.json({ error: "Please sign in with your Student account to view this registration." },
        { status: 401, headers: { "Cache-Control": "private, no-store" } });
    }
    const { enrollmentId } = await params;
    const document = await admissionsDemoCorDocument(context.admin, enrollmentId, context.studentId);
    stage = "PDF renderer";
    return await verifiedCorResponse(request, document);
  } catch (error) {
    console.warn(`[COR][Student Admissions] PDF unavailable | stage=${stage} | reason=${String(error?.message || "Unknown error")}`);
    return NextResponse.json({
      error: "The confirmed demonstration registration PDF could not be generated. Please refresh Enrollment and try again.",
      code: "PDF_UNAVAILABLE",
    }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  }
}
