"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface StockAccountRow {
  id: number;
  folder_id: number | null;
  username: string;
  hasTwofa: boolean;
  notes: string | null;
  is_used: number;
  created_at: string;
}

interface FolderOption {
  id: number;
  name: string;
}

type Revealed = { password: string; twofa: string | null };

export function StockManager({
  accounts,
  folders,
}: {
  accounts: StockAccountRow[];
  folders: FolderOption[];
}) {
  const router = useRouter();
  const [, startT] = useTransition();
  const [revealed, setRevealed] = useState<Record<number, Revealed | undefined>>({});
  const [revealing, setRevealing] = useState<Set<number>>(new Set());

  const [addFolderId, setAddFolderId] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");
  const [raw, setRaw] = useState("");
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
    const res = await fetch(`/api/stock/accounts/${id}/reveal`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setRevealing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (res.ok) {
      setRevealed((prev) => ({ ...prev, [id]: body }));
    }
  }

  async function toggleUsed(id: number, used: boolean) {
    await fetch(`/api/stock/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_used: used }),
    });
    refresh();
  }

  async function moveFolder(id: number, folderId: string) {
    await fetch(`/api/stock/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId === "" ? null : Number(folderId) }),
    });
    refresh();
  }

  async function remove(id: number) {
    if (!window.confirm("Remover esta conta do estoque? Não pode ser desfeito.")) return;
    await fetch(`/api/stock/accounts/${id}`, { method: "DELETE" });
    refresh();
  }

  async function createFolderInline(): Promise<number | null> {
    if (!newFolderName.trim()) return null;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Não foi possível criar a pasta.");
      return null;
    }
    return body.id as number;
  }

  async function submitBatch() {
    setError(null);
    if (!raw.trim()) {
      setError("Cole ao menos uma linha usuario:senha[:2fa].");
      return;
    }
    setBusy(true);
    let folderId = addFolderId;
    if (folderId === "__new__") {
      const created = await createFolderInline();
      if (created === null) {
        setBusy(false);
        return;
      }
      folderId = String(created);
    }
    const res = await fetch("/api/stock/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, folder_id: folderId || null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Não foi possível salvar as contas.");
      return;
    }
    setRaw("");
    setNewFolderName("");
    setAddFolderId("");
    refresh();
  }

  const groups = [
    ...folders.map((f) => ({ folder: f, rows: accounts.filter((a) => a.folder_id === f.id) })),
    { folder: null, rows: accounts.filter((a) => a.folder_id === null) },
  ].filter((g) => g.rows.length > 0 || g.folder !== null);

  return (
    <div className="space-y-8">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Adicionar lote
        </h2>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <select
              value={addFolderId}
              onChange={(e) => setAddFolderId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Sem pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="__new__">+ Nova pasta…</option>
            </select>
            {addFolderId === "__new__" ? (
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
              />
            ) : null}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"usuario:senha\nusuario2:senha2:2fa_seed"}
            rows={5}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-ink"
          />
        </div>
        {error ? <p className="mt-2 text-sm text-status-failed">{error}</p> : null}
        <button
          onClick={submitBatch}
          disabled={busy}
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Adicionar ao estoque"}
        </button>
      </section>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma conta no estoque ainda.</p>
      ) : (
        groups.map(({ folder, rows }) => (
          <section key={folder?.id ?? "none"} className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-5 py-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
                {folder ? `📁 ${folder.name}` : "Sem pasta"} · {rows.length}
              </h2>
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Nenhuma conta nesta pasta.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                      <th className="px-5 py-2 font-medium">Usuário</th>
                      <th className="py-2 font-medium">Senha</th>
                      <th className="py-2 font-medium">2FA</th>
                      <th className="py-2 font-medium">Usada</th>
                      <th className="py-2 font-medium">Pasta</th>
                      <th className="px-5 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((a) => (
                      <tr key={a.id} className={a.is_used ? "opacity-50" : undefined}>
                        <td className="data px-5 py-2.5 text-ink">{a.username}</td>
                        <td className="data py-2.5 text-ink-soft">
                          <button
                            onClick={() => toggleReveal(a.id)}
                            className="hover:underline"
                            disabled={revealing.has(a.id)}
                          >
                            {revealing.has(a.id)
                              ? "…"
                              : revealed[a.id]
                                ? revealed[a.id]!.password
                                : "••••••••"}
                          </button>
                        </td>
                        <td className="data py-2.5 text-ink-soft">
                          {a.hasTwofa ? (
                            <button
                              onClick={() => toggleReveal(a.id)}
                              className="hover:underline"
                              disabled={revealing.has(a.id)}
                            >
                              {revealed[a.id] ? revealed[a.id]!.twofa ?? "—" : "••••••"}
                            </button>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <input
                            type="checkbox"
                            checked={Boolean(a.is_used)}
                            onChange={(e) => toggleUsed(a.id, e.target.checked)}
                            className="accent-[var(--color-brand)]"
                          />
                        </td>
                        <td className="py-2.5">
                          <select
                            value={a.folder_id ?? ""}
                            onChange={(e) => moveFolder(a.id, e.target.value)}
                            className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-ink"
                          >
                            <option value="">Sem pasta</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <button
                            onClick={() => remove(a.id)}
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
        ))
      )}
    </div>
  );
}
