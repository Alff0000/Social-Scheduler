import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { setUserActive } from "@/lib/users";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json(
      { error: "Você não pode desativar sua própria conta." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Informe is_active (true ou false)." }, { status: 400 });
  }
  setUserActive(targetId, body.is_active);
  return NextResponse.json({ ok: true });
}
