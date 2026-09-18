import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { setUserActive, setUserStorageLimit } from "@/lib/users";

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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Informe is_active (true ou false)." }, { status: 400 });
    }
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "Você não pode desativar sua própria conta." },
        { status: 400 }
      );
    }
    setUserActive(targetId, body.is_active);
  }

  // Admin-set, not self-service — see migration 0039's own comment for why. No self-lockout
  // risk here the way deactivating yourself has, so unlike is_active this is allowed on the
  // admin's own row too.
  if ("storage_limit_mb" in body) {
    const raw = body.storage_limit_mb;
    if (raw !== null && (!Number.isFinite(raw) || raw <= 0)) {
      return NextResponse.json(
        { error: "storage_limit_mb deve ser nulo (sem limite) ou um número maior que zero." },
        { status: 400 }
      );
    }
    setUserStorageLimit(targetId, raw === null ? null : Math.trunc(raw));
  }

  return NextResponse.json({ ok: true });
}
