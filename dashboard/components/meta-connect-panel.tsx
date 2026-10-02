"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PageOption = {
  id: string;
  name: string;
  missingTasks: string[];
  instagram: { id: string; username: string } | null;
};

/**
 * Shown on /channels right after the Meta OAuth redirect lands back
 * (/api/channels/meta/callback -> here with ?meta_connect=1). The user token that made this
 * list possible lives only in an httpOnly cookie (see that callback's own comment) — this
 * component never sees it, only the safe id/name/instagram summary GET /meta/pages returns.
 *
 * Each Page can become a Facebook channel, its linked Instagram channel, or both — picking
 * either calls POST /meta/select, which creates the channel directly server-side. There is
 * no form to fill in afterwards; `created` channels show up on this same page on refresh.
 */
export function MetaConnectPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/channels/meta/pages")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setPages(data.pages);
        else setError(data.error ?? "Não foi possível listar suas Pages.");
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível contatar a Meta.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect(pageId: string, platform: "facebook" | "instagram", name: string) {
    const key = `${pageId}:${platform}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/channels/meta/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, platform, account_name: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setError(data.error ?? "Não foi possível conectar.");
        return;
      }
      setDone((d) => [...d, key]);
      router.refresh();
    } catch {
      setError("Não foi possível contatar o servidor.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-surface-muted p-4 text-sm text-ink-soft">
        Buscando suas Pages na Meta…
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="rounded-card border border-status-failed bg-surface-muted p-4 text-sm text-status-failed">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h3 className="mb-1 font-display text-base font-semibold text-ink">
        Escolha o que conectar
      </h3>
      <p className="mb-4 text-xs text-muted">
        Cada Page pode virar uma conta do Facebook, a conta do Instagram vinculada a ela, ou
        as duas — cada uma entra na fila como uma conta separada.
      </p>
      {error ? <p className="mb-3 text-sm text-status-failed">{error}</p> : null}
      <div className="space-y-3">
        {pages.map((p) => {
          const fbKey = `${p.id}:facebook`;
          const igKey = p.instagram ? `${p.id}:instagram` : null;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                {p.instagram ? (
                  <p className="text-xs text-muted">
                    Instagram vinculado: @{p.instagram.username}
                  </p>
                ) : (
                  <p className="text-xs text-faint">Sem Instagram vinculado</p>
                )}
                {p.missingTasks.length > 0 ? (
                  <p className="text-xs text-status-failed">
                    Faltam permissões: {p.missingTasks.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => connect(p.id, "facebook", p.name)}
                  disabled={busy === fbKey || done.includes(fbKey)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
                >
                  {done.includes(fbKey)
                    ? "Conectado"
                    : busy === fbKey
                      ? "Conectando…"
                      : "Conectar Facebook"}
                </button>
                {p.instagram && igKey ? (
                  <button
                    onClick={() => connect(p.id, "instagram", p.instagram!.username)}
                    disabled={busy === igKey || done.includes(igKey)}
                    className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-on-brand hover:bg-brand-ink disabled:opacity-50"
                  >
                    {done.includes(igKey)
                      ? "Conectado"
                      : busy === igKey
                        ? "Conectando…"
                        : "Conectar Instagram"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
