import { NextResponse } from "next/server";
import { sendPublicationNow } from "@/lib/queries";
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
  const ok = sendPublicationNow(pubId);
  if (!ok) {
    return NextResponse.json(
      {
        error:
          "This send isn't waiting on a retry — only one the worker has deferred can be sent now.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
