import { NextRequest, NextResponse } from "next/server";
import { deleteMetaApp, getMetaApp } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const appId = Number(id);
  const app = getMetaApp(appId);
  if (!app || (!viewer.is_admin && app.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "App not found." }, { status: 404 });
  }
  const ok = deleteMetaApp(appId);
  if (!ok) {
    return NextResponse.json({ error: "App not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
