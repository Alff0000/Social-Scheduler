import { NextRequest, NextResponse } from "next/server";
import { revealStockSecrets } from "@/lib/stock-queries";

export const runtime = "nodejs";

// POST, not GET: this returns a plaintext password/2FA seed, and a GET response is the
// shape that ends up cached by intermediaries and logged (URL + status) by more tooling
// than a POST body ever is. Same reasoning as the refresh-request actions elsewhere in
// this app that mutate via POST rather than a "safe" verb.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secrets = revealStockSecrets(Number(id));
  if (!secrets) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  return NextResponse.json(secrets);
}
