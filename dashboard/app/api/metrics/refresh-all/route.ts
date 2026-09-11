import { NextResponse } from "next/server";
import { requestMetricsRefreshAll } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const requested = requestMetricsRefreshAll(viewer.is_admin ? null : viewer.id);
  return NextResponse.json({ requested });
}
