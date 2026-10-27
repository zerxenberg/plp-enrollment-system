import "server-only";
import { NextResponse } from "next/server";
import { renderVerifiedCorPdf } from "./cor-pdf.mjs";
import { corPdfFilename } from "./cor-filename.mjs";

export async function verifiedCorResponse(request, record) {
  const filename = corPdfFilename(record);
  const pdf = await renderVerifiedCorPdf(record);
  const disposition = new URL(request.url).searchParams.get("view") === "1"
    ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
