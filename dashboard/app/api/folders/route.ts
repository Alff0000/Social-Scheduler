import { NextRequest, NextResponse } from "next/server";
import { createFolder, listFolders } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ folders: listFolders(viewer.is_admin ? null : viewer.id) });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
  }
  try {
    const id = createFolder(name, viewer.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code ?? "")
        : "";
    if (code.includes("SQLITE_CONSTRAINT")) {
      return NextResponse.json(
        { error: `A folder named "${name}" already exists.` },
        { status: 400 }
      );
    }
    throw err;
  }
}
