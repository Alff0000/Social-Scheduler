import { NextRequest, NextResponse } from "next/server";
import { revealMetaAppSecret } from "@/lib/meta-apps-queries";

export const runtime = "nodejs";

// POST, not GET — same reasoning as /api/stock/accounts/[id]/reveal: this returns a
// plaintext secret, and a GET's URL+status is the shape more tooling ends up logging.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = revealMetaAppSecret(Number(id));
  if (secret === null) {
    return NextResponse.json({ error: "App not found." }, { status: 404 });
  }
  return NextResponse.json({ app_secret: secret });
}
