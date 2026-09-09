"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Refresh photo" for a channel.
 *
 * The button queues a request rather than fetching anything — the worker owns every
 * platform call. The copy says so plainly, because a button that appears to do nothing
 * for a minute is otherwise indistinguishable from a broken one.
 */
export function ChannelAvatarRefresh({
  channelId,
  avatarError,
}: {
  channelId: number;
  avatarError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    const res = await fetch(`/api/channels/${channelId}/avatar/refresh`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível enfileirar uma atualização.");
      return;
    }
    setQueued(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-2">
      <button
        onClick={refresh}
        disabled={pending}
        className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      >
        Atualizar foto
      </button>
      {queued ? (
        <p className="mt-1 text-xs text-muted">
          Enfileirado — o worker pega isso no próximo ciclo dele. Nada acontece enquanto
          o worker não estiver rodando.
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-status-failed">{error}</p> : null}
      {avatarError ? (
        <p className="mt-1 text-xs text-status-failed">
          Última busca falhou: {avatarError}
        </p>
      ) : null}
    </div>
  );
}
