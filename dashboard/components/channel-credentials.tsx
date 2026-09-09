"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { accountIdLabel, usesAccountId } from "@/lib/platforms";

/**
 * Update a channel's credentials (IG user id + access token). Tokens expire / get
 * regenerated, so editing them is a routine need. The token is write-only here — we
 * never render the stored value back.
 */
export function ChannelCredentials({
  channelId,
  platform,
  remoteAccountId,
}: {
  channelId: number;
  platform: string;
  remoteAccountId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(remoteAccountId ?? "");
  const [token, setToken] = useState("");
  const [pending, startT] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    const body: Record<string, string> = { remote_account_id: accountId.trim() };
    // Only send the token if they typed a new one (leave it untouched otherwise).
    if (token.trim()) body.access_token = token.trim();
    const res = await fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("Não foi possível salvar.");
      return;
    }
    setToken("");
    setMsg("Salvo — rode a checagem preflight para verificar.");
    startT(() => router.refresh());
  }

  const field =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand";

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-sunken/40 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-medium text-ink-soft">Credenciais</span>
        {/* Says "Edit", not "Update token" — this panel also edits the account id, and
            labelling it by the token alone hides that. A wrong account id is a real and
            easy mistake (the Threads id is not the Instagram one). */}
        <span className="text-xs text-muted">{open ? "Ocultar" : "Editar"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2.5">
          {usesAccountId(platform) ? (
            <label className="block text-xs text-ink-soft">
              <span className="mb-1 block">
                {accountIdLabel(platform)}
              </span>
              <input
                className={field}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="1784140000..."
              />
            </label>
          ) : null}
          <label className="block text-xs text-ink-soft">
            <span className="mb-1 block">
              {usesAccountId(platform) ? (
                <>
                  Novo access token{" "}
                  {/* The "IGAA…" prefix is Instagram's; Threads and Page tokens look different,
                      so don't tell someone their valid token looks wrong. */}
                  <span className="text-faint">(longo — deixe em branco para manter o atual)</span>
                </>
              ) : (
                <>
                  Nova URL de webhook{" "}
                  <span className="text-faint">(a credencial inteira — deixe em branco para manter a atual)</span>
                </>
              )}
            </span>
            <input
              className={field}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                usesAccountId(platform)
                  ? "Cole o token recém-gerado"
                  : "Cole a URL completa do webhook do Discord"
              }
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Salvar credenciais"}
            </button>
            {msg ? <span className="text-xs text-status-posted">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
