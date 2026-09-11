import { NextRequest, NextResponse } from "next/server";
import {
  deleteStockAccount,
  getStockAccount,
  setStockAccountFolder,
  setStockAccountUsed,
} from "@/lib/stock-queries";
import { listFolders } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const accountId = Number(id);
  const account = getStockAccount(accountId);
  if (!account || (!viewer.is_admin && account.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if ("is_used" in body) {
    setStockAccountUsed(accountId, Boolean(body.is_used));
  }
  if ("folder_id" in body) {
    const fid = body.folder_id === null || body.folder_id === "" ? null : Number(body.folder_id);
    if (fid !== null && !listFolders(viewer.is_admin ? null : viewer.id).some((f) => f.id === fid)) {
      return NextResponse.json({ error: "Folder not found." }, { status: 400 });
    }
    setStockAccountFolder(accountId, fid);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const accountId = Number(id);
  const account = getStockAccount(accountId);
  if (!account || (!viewer.is_admin && account.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const ok = deleteStockAccount(accountId);
  if (!ok) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
