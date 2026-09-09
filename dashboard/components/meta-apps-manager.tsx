"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface MetaAppRow {
  id: number;
  name: string;
  app_id: string;
  graph_version: string | null;
  created_at: string;
}

export function MetaAppsManager({ apps }: { apps: MetaAppRow[] }) {
  const router = useRouter();
  const [, startT] = useTransition();
  const [revealed, setRevealed] = useState<Record<number, string | undefined>>({});
  const [revealing, setRevealing] = useState<Set<number>>(new Set());

  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [graphVersion, setGraphVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    startT(() => router.refresh());
  }

  async function toggleReveal(id: number) {
    if (revealed[id]) {
      setRevealed((prev) => ({ ...prev, [id]: undefined }));
      return;
    }
    setRevealing((prev) => new Set(prev).add(id));
    const res = await fetch(`/api/meta-apps/${id}/reveal`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setRevealing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (res.ok) setRevealed((prev) => ({ ...prev, [id]: body.app_secret }));
  }

  async function remove(id: number, label: string) {
    if (!window.confirm(`Remover o app "${label}"? Isso não desconecta nenhuma conta já conectada.`)) return;
    await fetch(`/api/meta-apps/${id}`, { method: "DELETE" });
    refresh();
  }

  async function create() {
    setError(null);
    if (!name.trim() || !appId.trim() || !appSecret.trim()) {
      setError("Nome, App ID e App Secret são obrigatórios.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/meta-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        app_id: appId.trim(),
        app_secret: appSecret.trim(),
        graph_version: graphVersion.trim() || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Não foi possível salvar o app.");
      return;
    }
    setName("");
    setAppId("");
    setAppSecret("");
    setGraphVersion("");
    refresh();
  }

  const field =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink";

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Novo app
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pessoal" className={field} />
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block">App ID</span>
            <input value={appId} onChange={(e) => setAppId(e.target.value)} className={field} />
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block">App Secret</span>
            <input
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              type="password"
              className={field}
            />
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block">Versão do Graph (opcional)</span>
            <input
              value={graphVersion}
              onChange={(e) => setGraphVersion(e.target.value)}
              placeholder="v25.0"
              className={field}
            />
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-status-failed">{error}</p> : null}
        <button
          onClick={create}
          disabled={busy}
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Adicionar app"}
        </button>
      </section>

      <section className="rounded-card border border-border bg-surface">
        {apps.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nenhum app cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-5 py-2 font-medium">Nome</th>
                  <th className="py-2 font-medium">App ID</th>
                  <th className="py-2 font-medium">App Secret</th>
                  <th className="py-2 font-medium">Versão</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2.5 text-ink">{a.name}</td>
                    <td className="data py-2.5 text-ink-soft">{a.app_id}</td>
                    <td className="data py-2.5 text-ink-soft">
                      <button
                        onClick={() => toggleReveal(a.id)}
                        className="hover:underline"
                        disabled={revealing.has(a.id)}
                      >
                        {revealing.has(a.id) ? "…" : revealed[a.id] ?? "••••••••••••"}
                      </button>
                    </td>
                    <td className="data py-2.5 text-ink-soft">{a.graph_version ?? "padrão"}</td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => remove(a.id, a.name)}
                        className="text-xs text-muted hover:text-status-failed"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
