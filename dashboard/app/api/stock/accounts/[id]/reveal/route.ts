import { NextRequest, NextResponse } from "next/server";
import { getStockAccount, revealStockSecrets } from "@/lib/stock-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST, not GET: this returns a plaintext password/2FA seed, and a GET response is the
// shape that ends up cached by intermediaries and logged (URL + status) by more tooling
// than a POST body ever is. Same reasoning as the refresh-request actions elsewhere in
// this app that mutate via POST rather than a "safe" verb.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const accountId = Number(id);
  const account = getStockAccount(accountId);
  if (!account || (!viewer.is_admin && account.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  const secrets = revealStockSecrets(accountId);
  if (!secrets) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  return NextResponse.json(secrets);
}
