import { NextResponse } from "next/server";
import { getInsightsChannel, requestInsightsRefresh } from "@/lib/insights-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) {
    return NextResponse.json({ error: "Id de conta inválido." }, { status: 400 });
  }
  const channel = getInsightsChannel(channelId);
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  // Raises a flag for the worker; the dashboard never calls the Graph API itself.
  requestInsightsRefresh(channelId);
  return NextResponse.json({ ok: true });
}
