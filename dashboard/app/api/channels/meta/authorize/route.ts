import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getMetaApp } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_SCOPES } from "@/lib/oauth-links";

export const runtime = "nodejs";

/**
 * Step one of connecting Instagram or Facebook automatically: send the owner to Meta's own
 * login/approve screen, same shape as TikTok's authorize route (see that file's comment).
 *
 * Meta apps are a registry (migration 0032), not a single .env pair, so the caller names
 * WHICH one to authorize with via ?appId=; it travels through the redirect in a cookie so
 * the callback knows which app's secret to exchange the code with.
 *
 * response_type=code, not token: unlike lib/oauth-links.ts's manual link (which points at
 * Meta's own success page because nothing here used to be able to receive a redirect), this
 * one lands on /api/channels/meta/callback and exchanges the code server-side — the whole
 * point of automating this flow is that a user access token never has to pass through the
 * owner's clipboard.
 */
export async function GET(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  }

  const appIdParam = req.nextUrl.searchParams.get("appId");
  const appId = Number(appIdParam);
  const app = appIdParam && Number.isInteger(appId) ? getMetaApp(appId) : undefined;
  if (!app || (!viewer.is_admin && app.owner_user_id !== viewer.id)) {
    return NextResponse.json(
      {
        error:
          "App Meta não encontrado. Cadastre um em Configurações → Apps Meta antes de " +
          "conectar automaticamente.",
      },
      { status: 400 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/channels/meta/callback", req.nextUrl.origin).toString();
  const version = app.graph_version?.startsWith("v")
    ? app.graph_version
    : `v${app.graph_version ?? "25.0"}`;

  const params = new URLSearchParams({
    client_id: app.app_id,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPES.join(","),
    response_type: "code",
    state,
  });
  const res = NextResponse.redirect(
    `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`,
  );
  // httpOnly: these never need to be read by page script. 600s mirrors the TikTok flow's
  // own window for "the owner is actually looking at the Meta login screen right now."
  const options = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("meta_oauth_state", state, options);
  res.cookies.set("meta_oauth_app_id", String(app.id), options);
  return res;
}
