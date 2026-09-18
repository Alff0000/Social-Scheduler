import { NextRequest, NextResponse } from "next/server";
import { assetFilePaths, unlinkInsideStore } from "@/lib/asset-files";
import { deleteAsset, forceDeleteAsset, getAsset } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  // Reclaiming disk space from old, already-posted content is exactly why this exists —
  // see forceDeleteAsset's own comment. Never the default: a plain delete still refuses
  // an in-use file outright, same as always.
  const force = req.nextUrl.searchParams.get("force") === "true";

  // Read the paths BEFORE the row disappears — after the DELETE there is nothing to
  // read them from.
  const asset = getAsset(Number(id));
  if (!asset || (!viewer.is_admin && asset.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const result = force ? forceDeleteAsset(Number(id)) : deleteAsset(Number(id));
  if (result === "not_found") {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  if (result === "in_use") {
    return NextResponse.json(
      {
        error:
          "Algo ainda referencia esse arquivo, então não pode ser excluído. Se está anexado a um post, remova-o do post primeiro.",
      },
      { status: 409 }
    );
  }
  if (result === "live_send") {
    return NextResponse.json(
      {
        error:
          "Um envio com esse arquivo está publicando agora mesmo — espere terminar antes de excluir.",
      },
      { status: 409 }
    );
  }

  // Row is gone — now the files. Order matters: a failed row delete must never leave
  // files deleted, but a failed file delete only leaves harmless bytes behind.
  // assetFilePaths() owns the list of what an asset writes to disk. Spelling it out here
  // instead is how the story canvas came to be missed when it was added.
  const leftover = (
    await Promise.all(assetFilePaths(asset).map(unlinkInsideStore))
  ).filter((p): p is string => p !== null);

  if (leftover.length > 0) {
    console.warn(`Asset ${id} row deleted, but these files remain: ${leftover.join(", ")}`);
  }
  return NextResponse.json({ ok: true, leftover });
}
