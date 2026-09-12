import { NextRequest, NextResponse } from "next/server";
import { deleteFolder, getFolder } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const folderId = Number(id);
  const folder = getFolder(folderId);
  if (!folder || (!viewer.is_admin && folder.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  }
  const ok = deleteFolder(folderId);
  if (!ok) {
    return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
