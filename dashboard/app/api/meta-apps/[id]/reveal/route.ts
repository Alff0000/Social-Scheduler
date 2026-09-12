import { NextRequest, NextResponse } from "next/server";
import { getMetaApp, revealMetaAppSecret } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST, not GET — same reasoning as /api/stock/accounts/[id]/reveal: this returns a
// plaintext secret, and a GET's URL+status is the shape more tooling ends up logging.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const appId = Number(id);
  const app = getMetaApp(appId);
  if (!app || (!viewer.is_admin && app.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "App não encontrado." }, { status: 404 });
  }
  const secret = revealMetaAppSecret(appId);
  if (secret === null) {
    return NextResponse.json({ error: "App não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ app_secret: secret });
}
