"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Two-click confirm, same shape as publication-actions.tsx's own delete control — this
 *  is the more serious of the two (an account's entire history goes with it, not one
 *  send), so the confirm step spells out what that actually means rather than just
 *  naming the action. */
export function ChannelDeleteButton({
  channelId,
  accountName,
}: {
  channelId: number;
  accountName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível excluir a conta.");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (confirming) {
    return (
      <div className="mt-3 rounded-lg border border-status-failed/40 bg-status-failed/10 p-3">
        <p className="text-xs text-status-failed">
          Excluir <span className="font-medium">{accountName}</span> apaga a conta e todo o
          histórico dela — publicações, métricas e configuração de preenchimento
          automático. Não afeta a conta de verdade no Instagram/Facebook/etc, só remove o
          que está registrado aqui. Essa ação não pode ser desfeita.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={doDelete}
            disabled={busy || pending}
            className="rounded-md bg-status-failed px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Excluindo…" : "Confirmar exclusão"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
          >
            Manter
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-status-failed">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-3 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-status-failed hover:text-status-failed"
    >
      Excluir conta
    </button>
  );
}
