import { NextResponse } from "next/server";
import { officialCorDocument } from "@/features/cor/cor-access-server";
import { verifiedCorResponse } from "@/features/cor/cor-response";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const { enrollmentId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(enrollmentId)) throw new Error("Invalid reference");
    return await verifiedCorResponse(request, await officialCorDocument(enrollmentId), enrollmentId);
  } catch {
    return NextResponse.json({ error: "The verified official COR is unavailable." }, {
      status: 404, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
