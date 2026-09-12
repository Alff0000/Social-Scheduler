import { NextResponse } from "next/server";
import { requestMetricsRefresh } from "@/lib/queries";
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
  const result = requestMetricsRefresh(pubId);
  if (result === "not_found") {
    return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });
  }
  if (result === "not_posted") {
    return NextResponse.json(
      { error: "Só envios já publicados (fora do modo teste) podem atualizar métricas." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
