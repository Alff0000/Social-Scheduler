import { NextResponse } from "next/server";
import { getInsightsChannel, requestInsightsRefresh } from "@/lib/insights-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) {
    return NextResponse.json({ error: "Invalid channel id." }, { status: 400 });
  }
  const channel = getInsightsChannel(channelId);
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  // Raises a flag for the worker; the dashboard never calls the Graph API itself.
  requestInsightsRefresh(channelId);
  return NextResponse.json({ ok: true });
}
