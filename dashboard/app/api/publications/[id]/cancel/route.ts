import { NextResponse } from "next/server";
import { cancelPublication } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getPublicationOwnerId, isOwnedByOrAdmin } from "@/lib/ownership";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const pubId = Number(id);
  if (!isOwnedByOrAdmin(getPublicationOwnerId(pubId), viewer)) {
    return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });
  }
  const ok = cancelPublication(pubId);
  if (!ok) {
    return NextResponse.json(
      { error: "Só um envio agendado ou aguardando aprovação pode ser cancelado." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
