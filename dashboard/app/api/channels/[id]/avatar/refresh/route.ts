import { NextResponse } from "next/server";
import { getChannel, requestAvatarRefresh } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Queue an avatar refresh for a channel.
 *
 * Deliberately does no network work: the worker owns every platform call, and the DB is
 * the contract between the two. The response says "queued", never "refreshed" — the photo
 * changes when the worker next runs, which is what the UI tells the owner.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const channel = getChannel(Number(id));
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (!channel.remote_account_id || !channel.access_token) {
    return NextResponse.json(
      { error: "Add an account id and access token first." },
      { status: 400 }
    );
  }
  requestAvatarRefresh(channel.id);
  return NextResponse.json({ ok: true, queued: true });
}
