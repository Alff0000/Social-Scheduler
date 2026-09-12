import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }
  const user = verifyCredentials(email, password);
  if (!user) {
    return NextResponse.json({ error: "Email ou senha incorretos." }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
