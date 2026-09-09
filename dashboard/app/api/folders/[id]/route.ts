import { NextRequest, NextResponse } from "next/server";
import { deleteFolder } from "@/lib/queries";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = deleteFolder(Number(id));
  if (!ok) {
    return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
