import { NextRequest, NextResponse } from "next/server";
import { listPages, type MetaAppConfig } from "@/lib/facebook-connect";
import { getMetaApp, revealMetaAppSecret } from "@/lib/meta-apps-queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Which Pages (and their linked Instagram accounts) the OAuth callback's token can see.
 *
 * Reads the user token from the httpOnly cookie the callback set — never from the request
 * body or a query param, so there is no way for a client-side call to supply an arbitrary
 * token here. listPages's own return shape already carries no tokens (see its docstring),
 * so this just forwards it.
 */
export async function GET(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });

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
  const result = await listPages(token, metaConfig);
  return NextResponse.json(result);
}
