import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, extendUserToken, type MetaAppConfig } from "@/lib/facebook-connect";
import { getMetaApp, revealMetaAppSecret } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Back to /channels with a message, never a rendered error page — same reasoning as the
 *  TikTok callback's own `back`: an OAuth error response can echo the authorization code,
 *  and a code in the address bar is a credential on screen. */
function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/channels", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete("meta_oauth_state");
  res.cookies.delete("meta_oauth_app_id");
  return res;
}

/**
 * Step two: Meta sends the owner back with a code; turn it into an extended user token and
 * park that token server-side for the page picker (GET .../meta/pages, POST .../meta/select)
 * to use next.
 *
 * The user token is NOT hoisted into a channel here, on purpose: one Meta login can
 * administer several Pages, and a Page's own Instagram account is a SEPARATE channel from
 * the Page itself — the owner picks which of those to actually connect on /channels, same
 * as the existing manual FacebookConnect panel's list-then-select shape. What changes is
 * WHERE the token obtained to list those Pages came from: an OAuth redirect instead of a
 * paste from the Graph API Explorer.
 *
 * The token never reaches the browser. It lives in an httpOnly cookie for the few minutes
 * the picker is open, exactly like the TikTok flow's PKCE verifier — see that route's own
 * comment for why a cookie is the right amount of state for something this short-lived.
 */
export async function GET(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return back(req, { meta_error: "Sua sessão expirou. Faça login de novo e tente conectar outra vez." });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) {
    const reason = req.nextUrl.searchParams.get("error_description") ?? denied;
    return back(req, { meta_error: `A Meta recusou a conexão: ${reason}` });
  }

  const expectedState = req.cookies.get("meta_oauth_state")?.value;
  const appIdCookie = req.cookies.get("meta_oauth_app_id")?.value;
  // A mismatched state is the CSRF check: without it, someone else's authorization code
  // could be walked into this install's database.
  if (!code || !state || !expectedState || state !== expectedState || !appIdCookie) {
    return back(req, {
      meta_error: "Esse login da Meta não corresponde a essa sessão do navegador. Tente conectar de novo.",
    });
  }

  const app = getMetaApp(Number(appIdCookie));
  const appSecret = app ? revealMetaAppSecret(app.id) : null;
  if (!app || !appSecret) {
    return back(req, { meta_error: "O app Meta usado para iniciar essa conexão não existe mais." });
  }

  const metaConfig: MetaAppConfig = {
    graphVersion: app.graph_version?.startsWith("v")
      ? app.graph_version
      : `v${app.graph_version ?? "25.0"}`,
    appId: app.app_id,
    appSecret,
  };
  const redirectUri = new URL("/api/channels/meta/callback", req.nextUrl.origin).toString();

  try {
    const shortLived = await exchangeCodeForToken(code, redirectUri, metaConfig);
    const extended = await extendUserToken(shortLived, metaConfig);

    const res = NextResponse.redirect(new URL("/channels?meta_connect=1", req.nextUrl.origin));
    res.cookies.delete("meta_oauth_state");
    res.cookies.delete("meta_oauth_app_id");
    // 600s: enough to look over a short Page list and click a couple of Connect buttons,
    // short enough that a long-lived Facebook user token never lingers on disk.
    const options = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
    res.cookies.set("meta_user_token", extended, options);
    res.cookies.set("meta_user_app_id", String(app.id), options);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha desconhecida.";
    return back(req, { meta_error: `Não foi possível concluir o login com a Meta: ${message}` });
  }
}
