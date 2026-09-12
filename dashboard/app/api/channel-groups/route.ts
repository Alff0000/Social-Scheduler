import { NextRequest, NextResponse } from "next/server";
import { createChannelGroup, listChannelGroups } from "@/lib/queries";
import { isValidTimezone } from "@/lib/timezones";
import { config } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  return NextResponse.json({ groups: listChannelGroups(viewer.is_admin ? null : viewer.id) });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  // A parsed JSON body genuinely has no known shape; every field below is validated
  // before use. Matches the .catch(() => ...) idiom the other routes use, and avoids an
  // explicit `any` for a value that is only ever read through those checks.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "O nome do grupo é obrigatório." }, { status: 400 });
  }
  // Same reasoning as POST /api/channels: an unvalidated zone is a render crash, not a
  // bad value — formatInTz() hands it straight to Intl.DateTimeFormat.
  // Falls back to the install's DEFAULT_TIMEZONE, not "UTC": this install's channels are
  // America/Los_Angeles, and a group silently created on UTC posts 7-8 hours off.
  const timezone = (body.timezone || config.defaultTimezone).trim();
  if (!isValidTimezone(timezone)) {
    return NextResponse.json(
      { error: `"${timezone}" isn't a timezone name. Use an IANA name like America/New_York.` },
      { status: 400 }
    );
  }
  try {
    const id = createChannelGroup({ name, timezone }, viewer.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    // better-sqlite3 hangs the SQLite error name off `code`. The catch binding is
    // `unknown`, so narrow to it rather than asserting the whole error's shape.
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code ?? "")
        : "";
    if (code.includes("SQLITE_CONSTRAINT")) {
      return NextResponse.json(
        { error: `A group named "${name}" already exists.` },
        { status: 400 }
      );
    }
    throw err;
  }
}
