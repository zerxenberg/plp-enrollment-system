import "server-only";
import { NextResponse } from "next/server";
import { renderVerifiedCorPdf } from "./cor-pdf.mjs";

export async function verifiedCorResponse(request, record, reference) {
  const pdf = await renderVerifiedCorPdf(record);
  const disposition = new URL(request.url).searchParams.get("view") === "1"
    ? "inline" : "attachment";
  const safeReference = String(reference).replaceAll(/[^A-Za-z0-9_-]/g, "").slice(0, 90);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="PLP-COR-${safeReference || "registration"}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
