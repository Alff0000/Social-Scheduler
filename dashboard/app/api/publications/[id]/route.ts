import { NextResponse } from "next/server";
import { deletePublication } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getPublicationOwnerId, isOwnedByOrAdmin } from "@/lib/ownership";

export const runtime = "nodejs";

export async function DELETE(
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
  const ok = deletePublication(pubId);
  if (!ok) {
    return NextResponse.json(
      { error: "Só um envio que ainda não foi publicado pode ser excluído." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
