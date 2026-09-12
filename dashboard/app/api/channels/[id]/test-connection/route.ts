import { NextResponse } from "next/server";
import { getChannel } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { lookupAccounts } from "@/lib/account-lookup";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * A live, read-only check that a channel's stored token still works — without publishing
 * anything. Before this, a broken/expired token was only discovered when a scheduled send
 * actually failed on the queue, sometimes hours or days after it stopped working.
 *
 * Meta platforms reuse lib/account-lookup.ts (the exact call the Add Channel form already
 * makes against a not-yet-saved token), and additionally cross-checks the id it gets back
 * against remote_account_id — a token can be perfectly valid and still point at the wrong
 * account, which a bare "is this token alive" check would miss entirely.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const channel = getChannel(Number(id));
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  if (!channel.access_token) {
    return NextResponse.json({ ok: false, error: "Nenhum access token configurado." });
  }

  switch (channel.platform) {
    case "instagram":
    case "threads":
    case "facebook": {
      const result = await lookupAccounts(channel.platform, channel.access_token, {
        graphVersion: config.graphVersion,
        threadsApiVersion: config.threadsApiVersion,
        graphBase: config.graphBase,
      });
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error });
      const matches = channel.remote_account_id
        ? result.accounts.some((a) => a.id === channel.remote_account_id)
        : true;
      if (!matches) {
        return NextResponse.json({
          ok: false,
          error:
            `O token funciona, mas nenhuma conta que ele acessa bate com o id salvo ` +
            `(${channel.remote_account_id}). Confira se o id não mudou.`,
        });
      }
      const found = result.accounts[0];
      return NextResponse.json({
        ok: true,
        message: found?.name
          ? `Conectado como ${found.isHandle ? "@" : ""}${found.name}.`
          : "Token válido.",
      });
    }
    case "telegram": {
      let res: Response;
      try {
        res = await fetch(`https://api.telegram.org/bot${channel.access_token}/getMe`, {
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
      } catch {
        return NextResponse.json({
          ok: false,
          error: "Não foi possível contatar o Telegram. Verifique sua conexão e tente de novo.",
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        return NextResponse.json({
          ok: false,
          error: "O token do bot foi recusado pelo Telegram — gere um novo com @BotFather.",
        });
      }
      const username = body.result?.username;
      return NextResponse.json({
        ok: true,
        message: username ? `Bot @${username} está ativo.` : "Bot ativo.",
      });
    }
    case "discord": {
      // A GET on the webhook URL returns its metadata with no side effect — unlike a POST,
      // which would actually send a message just to prove the webhook works.
      let res: Response;
      try {
        res = await fetch(channel.access_token, {
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
      } catch {
        return NextResponse.json({
          ok: false,
          error: "Não foi possível contatar o Discord. Verifique sua conexão e tente de novo.",
        });
      }
      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          error:
            res.status === 404
              ? "Esse webhook não existe mais — ele pode ter sido excluído no Discord."
              : `O Discord recusou o webhook (HTTP ${res.status}).`,
        });
      }
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        message: body?.name ? `Webhook "${body.name}" está ativo.` : "Webhook ativo.",
      });
    }
    default:
      // TikTok's API has no no-op "whoami" call this install can reach without a real
      // publish (its whole surface needs creator-scoped permissions tied to an actual
      // upload) — same "decline and say why" call lib/account-lookup.ts's
      // lookupUnavailableReason already makes, rather than guessing at a check that would
      // give a false sense of security.
      return NextResponse.json({
        ok: false,
        error:
          "A verificação de conexão ainda não está disponível para essa plataforma — " +
          "a forma confiável de saber é agendar um envio de teste.",
      });
  }
}
