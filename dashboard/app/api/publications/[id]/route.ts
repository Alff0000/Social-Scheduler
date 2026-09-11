import { NextResponse } from "next/server";
import { deletePublication } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getPublicationOwnerId, isOwnedByOrAdmin } from "@/lib/ownership";

export const runtime = "nodejs";

export async function DELETE(
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
  const ok = deletePublication(pubId);
  if (!ok) {
    return NextResponse.json(
      { error: "Only a not-yet-posted send can be deleted." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
