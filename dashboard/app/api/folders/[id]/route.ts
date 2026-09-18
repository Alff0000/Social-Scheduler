import { NextRequest, NextResponse } from "next/server";
import { deleteFolder, getFolder, renameFolder, DuplicateFolderNameError } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const folderId = Number(id);
  const existing = getFolder(folderId);
  if (!existing || (!viewer.is_admin && existing.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Dê um nome à pasta." }, { status: 400 });
  }
  try {
    const folder = renameFolder(folderId, name);
    if (!folder) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
    }
    return NextResponse.json(folder);
  } catch (e) {
    if (e instanceof DuplicateFolderNameError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

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
