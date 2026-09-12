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
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const channel = getChannel(Number(id));
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  if (!channel.remote_account_id || !channel.access_token) {
    return NextResponse.json(
      { error: "Adicione um id de conta e um access token primeiro." },
      { status: 400 }
    );
  }
  requestAvatarRefresh(channel.id);
  return NextResponse.json({ ok: true, queued: true });
}
