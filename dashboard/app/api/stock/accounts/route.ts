import { NextRequest, NextResponse } from "next/server";
import { createStockAccounts, listStockAccounts, parseStockAccountLines } from "@/lib/stock-queries";
import { listFolders } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// NOTE: stock_accounts itself is not yet owner-scoped (tracked separately — migrations/
// 0034_owner_scoping.sql added the column, but listStockAccounts/createStockAccounts in
// lib/stock-queries.ts still read/write it install-wide). The folder lookup below IS
// scoped now that folders are: a stock account can only be filed into a folder its owner
// can actually see.
export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ accounts: listStockAccounts() });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
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
    const created = createStockAccounts(entries, folderId);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    // A missing/invalid CREDENTIALS_ENCRYPTION_KEY throws from lib/crypto.ts — surface
    // that setup error directly rather than a bare 500, since it names exactly the fix.
    const message = err instanceof Error ? err.message : "Could not save the accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
