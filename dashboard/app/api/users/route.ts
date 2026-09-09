import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listUsers, createUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  return NextResponse.json({ users: listUsers() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Informe email e senha." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 8 caracteres." },
      { status: 400 }
    );
  }
  try {
    const created = createUser(email, password, !!body.is_admin);
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Não foi possível criar o usuário." },
      { status: 400 }
    );
  }
}
