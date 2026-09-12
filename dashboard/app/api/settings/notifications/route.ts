import { NextRequest, NextResponse } from "next/server";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/queries";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getNotificationSettings());
}

const KEYS = ["queue_error_enabled", "auto_report_enabled", "account_blocked_enabled"] as const;

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }
  const patch: Partial<Record<(typeof KEYS)[number], boolean>> = {};
  for (const key of KEYS) {
    if (key in body) patch[key] = Boolean(body[key]);
  }
  updateNotificationSettings(patch);
  return NextResponse.json({ ok: true });
}
