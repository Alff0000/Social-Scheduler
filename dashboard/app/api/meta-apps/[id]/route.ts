import { NextRequest, NextResponse } from "next/server";
import { deleteMetaApp } from "@/lib/meta-apps-queries";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = deleteMetaApp(Number(id));
  if (!ok) {
    return NextResponse.json({ error: "App not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
