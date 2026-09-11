import { NextResponse } from "next/server";
import { requestMetricsRefresh } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getPublicationOwnerId, isOwnedByOrAdmin } from "@/lib/ownership";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const pubId = Number(id);
  if (!isOwnedByOrAdmin(getPublicationOwnerId(pubId), viewer)) {
    return NextResponse.json({ error: "Publication not found." }, { status: 404 });
  }
  const result = requestMetricsRefresh(pubId);
  if (result === "not_found") {
    return NextResponse.json({ error: "Publication not found." }, { status: 404 });
  }
  if (result === "not_posted") {
    return NextResponse.json(
      { error: "Only posted (non-dry-run) publications can refresh metrics." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
