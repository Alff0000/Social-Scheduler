"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChannelAvatar } from "@/components/ui";
import { platformBadge } from "@/lib/platforms";
import { useToast } from "@/components/toast";

interface ChannelLite {
  id: number;
  account_name: string;
  platform: string;
  color_hue: number | null;
  avatar_path: string | null;
  folder_id: number | null;
}

interface FolderLite {
  id: number;
  name: string;
}

const secondaryBtn =
  "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-sunken disabled:opacity-50";

/** One channel row with a "mover para" select — reused inside a folder card and inside
 *  the Sem pasta section, so moving a channel is always the same one control regardless
 *  of where it currently sits. */
function ChannelMoveRow({
  channel,
  folders,
}: {
  channel: ChannelLite;
  folders: FolderLite[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  async function move(value: string) {
    setPending(true);
    await fetch(`/api/channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: value === "" ? null : Number(value) }),
    });
    setPending(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
      <ChannelAvatar
        id={channel.id}
        name={channel.account_name}
        colorHue={channel.color_hue}
        avatarPath={channel.avatar_path}
        size={22}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{channel.account_name}</p>
        <p className="text-[10px] uppercase tracking-wide text-faint">
          {platformBadge(channel.platform)}
        </p>
      </div>
      <select
        value={channel.folder_id ?? ""}
        disabled={pending}
        onChange={(e) => move(e.target.value)}
        className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-brand disabled:opacity-50"
      >
        <option value="">Sem pasta</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function FolderCard({
  folder,
  members,
  allFolders,
}: {
  folder: FolderLite;
  members: ChannelLite[];
  allFolders: FolderLite[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "renaming" | "deleting">("idle");
  const [draft, setDraft] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setDraft(folder.name);
    setError(null);
  }

  async function rename() {
    const name = draft.trim();
    if (!name || busy) return;
    if (name === folder.name) {
      reset();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível renomear a pasta.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setMode("idle");
    startTransition(() => router.refresh());
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível excluir a pasta.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setMode("idle");
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        {mode === "renaming" ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                rename();
              }
              if (e.key === "Escape") reset();
            }}
          />
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{folder.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {members.length} conta{members.length === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {mode === "idle" ? (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setMode("renaming")} className={secondaryBtn}>
              Renomear
            </button>
            <button
              onClick={() => setMode("deleting")}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken"
            >
              Excluir
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={reset}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
            >
              Cancelar
            </button>
            {mode === "renaming" ? (
              <button
                onClick={rename}
                disabled={busy || !draft.trim()}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Salvar"}
              </button>
            ) : (
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-md bg-status-failed px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            )}
          </div>
        )}
      </div>

      {mode === "deleting" ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-ink-soft">
          {members.length === 0 ? (
            <>
              Excluir <span className="font-medium text-ink">{folder.name}</span>? Ela está
              vazia, então nada mais muda.
            </>
          ) : (
            <>
              Excluir <span className="font-medium text-ink">{folder.name}</span>?{" "}
              <span className="font-medium text-ink">
                {members.length} conta{members.length === 1 ? "" : "s"}
              </span>{" "}
              volta{members.length === 1 ? "" : "m"} para Sem pasta — nenhuma conta, publicação
              ou credencial é afetada. Isso não pode ser desfeito.
            </>
          )}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-status-failed">{error}</p> : null}

      {members.length > 0 ? (
        <div className="mt-4 space-y-1.5 border-t border-border pt-3">
          {members.map((c) => (
            <ChannelMoveRow key={c.id} channel={c} folders={allFolders} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FolderManager({
  folders,
  channels,
}: {
  folders: FolderLite[];
  channels: ChannelLite[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const byFolder = new Map<number, ChannelLite[]>();
  for (const f of folders) byFolder.set(f.id, []);
  const unfoldered: ChannelLite[] = [];
  for (const c of channels) {
    if (c.folder_id != null && byFolder.has(c.folder_id)) {
      byFolder.get(c.folder_id)!.push(c);
    } else {
      unfoldered.push(c);
    }
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível criar a pasta.");
      return;
    }
    setNewName("");
    showToast(`Pasta "${name}" criada.`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-surface p-4">
        <label className="mb-1 block text-xs font-medium text-ink-soft">Nova pasta</label>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createFolder();
            }}
            placeholder="Ex: Clientes VIP"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand"
          />
          <button
            onClick={createFolder}
            disabled={creating || !newName.trim()}
            className="shrink-0 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
          >
            {creating ? "Criando…" : "Criar"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-status-failed">{error}</p> : null}
      </div>

      {folders.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center text-sm text-muted">
          Nenhuma pasta ainda. Crie uma acima pra começar a organizar suas contas.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {folders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              members={byFolder.get(f.id) ?? []}
              allFolders={folders}
            />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-ink">
          Sem pasta ({unfoldered.length})
        </h2>
        {unfoldered.length === 0 ? (
          <p className="text-sm text-muted">Toda conta já está em alguma pasta.</p>
        ) : (
          <div className="grid gap-1.5 md:grid-cols-2">
            {unfoldered.map((c) => (
              <ChannelMoveRow key={c.id} channel={c} folders={folders} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
