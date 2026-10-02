import { NextRequest, NextResponse } from "next/server";
import { selectPage, selectInstagram, type MetaAppConfig } from "@/lib/facebook-connect";
import { getMetaApp, revealMetaAppSecret } from "@/lib/meta-apps-queries";
import { upsertOAuthChannel } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Step three: the owner picked a Page (and whether to connect it as its Facebook Page or
 * its linked Instagram account) — verify the token end to end and create the channel.
 *
 * Unlike the existing manual FacebookConnect panel (POST /api/channels/facebook/connect),
 * this does not hand a verified token back to an unsaved form for the owner to Save — it
 * creates the channel directly, the same one-click-and-done shape as the TikTok callback.
 * There is no form here to fill in: the whole point of automating this flow is that it
 * ends at "connected," not at "now go fill in a token field."
 *
 * One Meta login can be used to connect BOTH a Page and its Instagram account as two
 * separate channels — each is its own POST, and the cookie is left alone (not consumed)
 * so a second call within the same ~10 minute window still works without re-authorizing.
 */
export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Esperado um corpo em JSON." }, { status: 400 });
  }
  const { pageId, platform, account_name } = (payload ?? {}) as {
    pageId?: unknown;
    platform?: unknown;
    account_name?: unknown;
  };
  if (typeof pageId !== "string" || pageId.trim() === "") {
    return NextResponse.json({ error: "Nenhuma Page foi escolhida." }, { status: 400 });
  }
  if (platform !== "facebook" && platform !== "instagram") {
    return NextResponse.json({ error: "Plataforma inválida." }, { status: 400 });
  }

  const token = req.cookies.get("meta_user_token")?.value;
  const appIdCookie = req.cookies.get("meta_user_app_id")?.value;
  if (!token || !appIdCookie) {
    return NextResponse.json(
      { error: "Essa conexão expirou. Clique em Conectar de novo." },
      { status: 400 },
    );
  }

  const app = getMetaApp(Number(appIdCookie));
  const appSecret = app ? revealMetaAppSecret(app.id) : null;
  if (!app || !appSecret) {
    return NextResponse.json({ error: "O app Meta usado nessa conexão não existe mais." }, { status: 400 });
  }
  const metaConfig: MetaAppConfig = {
    graphVersion: app.graph_version?.startsWith("v")
      ? app.graph_version
      : `v${app.graph_version ?? "25.0"}`,
    appId: app.app_id,
    appSecret,
  };

  const ownerId = viewer.is_admin ? null : viewer.id;
  const timezone = config.defaultTimezone;

  if (platform === "facebook") {
    const result = await selectPage(token, pageId, metaConfig);
    if (!result.ok) return NextResponse.json(result, { status: 200 });
    const { id, created } = upsertOAuthChannel(
      {
        platform: "facebook",
        account_name: typeof account_name === "string" && account_name.trim() ? account_name.trim() : result.name,
        timezone,
        remote_account_id: result.pageId,
        access_token: result.pageToken,
      },
      ownerId,
    );
    return NextResponse.json({ ok: true, id, created, name: result.name });
  }

  const result = await selectInstagram(token, pageId, metaConfig);
  if (!result.ok) return NextResponse.json(result, { status: 200 });
  const { id, created } = upsertOAuthChannel(
    {
      platform: "instagram",
      account_name:
        typeof account_name === "string" && account_name.trim() ? account_name.trim() : result.username,
      timezone,
      remote_account_id: result.igId,
      access_token: result.pageToken,
      linked_page_id: pageId,
    },
    ownerId,
  );
  return NextResponse.json({ ok: true, id, created, name: result.username });
}
