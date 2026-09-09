import { NextRequest, NextResponse } from "next/server";
import { createMetaApp, listMetaApps } from "@/lib/meta-apps-queries";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ apps: listMetaApps() });
}

export async function POST(req: NextRequest) {
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
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the app.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
