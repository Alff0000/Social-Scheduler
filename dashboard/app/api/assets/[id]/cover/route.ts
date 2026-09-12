import { NextRequest, NextResponse } from "next/server";
import { getAsset, updateAssetCoverFrame } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Choose which frame of a video is its cover. Stored as a millisecond offset and sent
 *  to Instagram as thumb_offset — no cover image is generated. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const asset = getAsset(Number(id));
  if (!asset || (!viewer.is_admin && asset.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  if (asset.media_kind !== "video") {
    return NextResponse.json(
      { error: "Só um vídeo tem quadro de capa." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const ms = body?.cover_frame_ms;
  if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0) {
    return NextResponse.json(
      { error: "cover_frame_ms deve ser um inteiro não negativo (milissegundos)." },
      { status: 400 }
    );
  }
  // Bound against the asset's own duration. Instagram silently falls back to frame 0 for
  // an out-of-range offset, so an unchecked value would look saved but do nothing.
  if (asset.duration_ms !== null && ms > asset.duration_ms) {
    return NextResponse.json(
      {
        error: `Esse quadro está além do fim do vídeo (${(asset.duration_ms / 1000).toFixed(1)}s).`,
      },
      { status: 400 }
    );
  }

  updateAssetCoverFrame(asset.id, ms);
  return NextResponse.json({ asset: getAsset(asset.id) });
}
