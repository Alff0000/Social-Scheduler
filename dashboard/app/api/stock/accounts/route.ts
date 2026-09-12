import { NextRequest, NextResponse } from "next/server";
import { createStockAccounts, listStockAccounts, parseStockAccountLines } from "@/lib/stock-queries";
import { listFolders } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  return NextResponse.json({ accounts: listStockAccounts(viewer.is_admin ? null : viewer.id) });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }
  const raw = typeof body.raw === "string" ? body.raw : "";
  if (!raw.trim()) {
    return NextResponse.json({ error: "Cole ao menos uma linha usuario:senha[:2fa]." }, { status: 400 });
  }
  let folderId: number | null = null;
  if (body.folder_id !== undefined && body.folder_id !== null && body.folder_id !== "") {
    folderId = Number(body.folder_id);
    if (!listFolders(viewer.is_admin ? null : viewer.id).some((f) => f.id === folderId)) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 400 });
    }
  }
  const entries = parseStockAccountLines(raw);
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma linha válida encontrada. Formato: usuario:senha ou usuario:senha:2fa." },
      { status: 400 },
    );
  }
  try {
    const created = createStockAccounts(entries, folderId, viewer.id);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    // A missing/invalid CREDENTIALS_ENCRYPTION_KEY throws from lib/crypto.ts — surface
    // that setup error directly rather than a bare 500, since it names exactly the fix.
    const message = err instanceof Error ? err.message : "Could not save the accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
