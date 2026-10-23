import { NextResponse } from "next/server";

import { readProjectDemonstrationCOR } from "@/features/academic/project-phase8-actions";
import { buildProjectCorPdf } from "@/features/registrar/registrar-cor-pdf";

export async function GET(_request, { params }) {
  try {
    const { simulationId } = await params;
    const cor = await readProjectDemonstrationCOR(simulationId, "registrar");
    const pdf = buildProjectCorPdf(cor);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="demonstration-cor-${simulationId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "The demonstration COR is unavailable." }, { status: 404 });
  }
}
