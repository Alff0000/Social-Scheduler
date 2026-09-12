import { NextResponse } from "next/server";
import { requestFirstCommentRetry } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { getPublicationOwnerId, isOwnedByOrAdmin } from "@/lib/ownership";

export const runtime = "nodejs";

/**
 * Queue one more attempt at a failed first comment. Distinct from ../retry, which
 * re-queues the POST: this post is already live, so the only thing left to retry is the
 * comment, and the only safe way to do it is to ask the worker rather than act here.
 */
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
  const ok = requestFirstCommentRetry(pubId);
  if (!ok) {
    return NextResponse.json(
      { error: "Só é possível tentar de novo o primeiro comentário de um envio publicado, e apenas quando ele falhou." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
