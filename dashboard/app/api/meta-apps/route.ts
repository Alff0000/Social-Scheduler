import { NextRequest, NextResponse } from "next/server";
import { createMetaApp, listMetaApps } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ apps: listMetaApps(viewer.is_admin ? null : viewer.id) });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const name = (body.name || "").trim();
  const appId = (body.app_id || "").trim();
  const appSecret = (body.app_secret || "").trim();
  if (!name || !appId || !appSecret) {
    return NextResponse.json(
      { error: "Nome, App ID e App Secret são obrigatórios." },
      { status: 400 },
    );
  }
  try {
    const id = createMetaApp({
      name,
      app_id: appId,
      app_secret: appSecret,
      graph_version: body.graph_version,
    }, viewer.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the app.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
