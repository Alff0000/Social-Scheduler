"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  channelId: number;
  folderId: number | null;
  folders: { id: number; name: string }[];
}

const NEW_FOLDER = "__new__";

/** Mirrors ChannelGroupSelect's shape exactly — same PATCH pattern, same select-and-go
 *  interaction — but for folders (migration 0030), a separate organizational concept with
 *  no auto-fill semantics of its own. Adds one thing groups don't need here: creating a
 *  folder inline, since (unlike groups) folders have no dedicated management page yet. */
export function ChannelFolderSelect({ channelId, folderId, folders }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(folderId === null ? "" : String(folderId));
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();

  async function moveTo(fid: number | null) {
    setValue(fid === null ? "" : String(fid));
    await fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: fid }),
    });
    startT(() => router.refresh());
  }

  async function change(next: string) {
    if (next === NEW_FOLDER) {
      setCreating(true);
      return;
    }
    await moveTo(next === "" ? null : Number(next));
  }

  async function createAndMove() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Não foi possível criar a pasta.");
      return;
    }
    setCreating(false);
    setNewName("");
    await moveTo(body.id as number);
  }

  if (creating) {
    return (
      <div className="mt-4 flex items-center gap-2 text-xs">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createAndMove();
            if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
            }
          }}
          placeholder="Nome da pasta"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink focus:border-brand"
        />
        <button
          type="button"
          onClick={createAndMove}
          className="rounded-md bg-brand px-2 py-1 font-medium text-on-brand hover:bg-brand-ink"
        >
          Criar
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setNewName("");
          }}
          className="text-muted hover:text-ink"
        >
          Cancelar
        </button>
        {error ? <p className="text-status-failed">{error}</p> : null}
      </div>
    );
  }

  return (
    <label className="mt-4 flex items-center justify-between gap-3 text-xs text-ink-soft">
      <span>Pasta</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink focus:border-brand disabled:opacity-50"
      >
        <option value="">Sem pasta</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value={NEW_FOLDER}>+ Nova pasta…</option>
      </select>
    </label>
  );
}
