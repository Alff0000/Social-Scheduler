import { NextRequest, NextResponse } from "next/server";
import { createChannel, getChannels, listFolders, setChannelFolder } from "@/lib/queries";
import { isPlatform, PLATFORMS } from "@/lib/platforms";
import { isValidTimezone } from "@/lib/timezones";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  return NextResponse.json({ channels: getChannels(viewer.is_admin ? null : viewer.id) });
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
  const account_name = (body.account_name || "").trim();
  const platform = body.platform;
  if (!account_name) {
    return NextResponse.json({ error: "O nome da conta é obrigatório." }, { status: 400 });
  }
  if (!isPlatform(platform)) {
    return NextResponse.json(
      { error: `platform deve ser um destes: ${PLATFORMS.map((p) => p.value).join(", ")}.` },
      { status: 400 }
    );
  }
  // An unvalidated typo here is a render crash, not a bad value: formatInTz()
  // hands the string straight to Intl.DateTimeFormat, which throws RangeError on
  // an unknown zone and takes out the Channels and Queue pages.
  const timezone = (body.timezone || "UTC").trim();
  if (!isValidTimezone(timezone)) {
    return NextResponse.json(
      { error: `"${timezone}" isn't a timezone name. Use an IANA name like America/New_York.` },
      { status: 400 }
    );
  }
  if (
    body.color_hue !== undefined &&
    body.color_hue !== null &&
    (!Number.isInteger(body.color_hue) || body.color_hue < 0 || body.color_hue > 360)
  ) {
    return NextResponse.json(
      { error: "color_hue deve ser nulo ou um número inteiro entre 0 e 360." },
      { status: 400 }
    );
  }
  // Same validation PATCH /api/channels/[id] applies to folder_id — checked before the
  // insert so a bad folder never leaves the new channel half-created.
  let folderId: number | null = null;
  if (body.folder_id !== undefined && body.folder_id !== null && body.folder_id !== "") {
    folderId = Number(body.folder_id);
    const folder = listFolders(viewer.id).find((f) => f.id === folderId);
    if (!folder) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 400 });
    }
  }
  const id = createChannel({
    platform,
    account_name,
    business_label: body.business_label,
    timezone,
    remote_account_id: body.remote_account_id,
    linked_page_id: body.linked_page_id,
    access_token: body.access_token,
    requires_approval: !!body.requires_approval,
    color_hue: body.color_hue ?? null,
  }, viewer.id);
  if (folderId !== null) setChannelFolder(id, folderId);
  return NextResponse.json({ id }, { status: 201 });
}
