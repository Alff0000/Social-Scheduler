"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelAvatar } from "@/components/ui";
import { platformBadge } from "@/lib/platforms";

interface ChannelOption {
  id: number;
  platform: string;
  account_name: string;
  color_hue: number | null;
  avatar_path: string | null;
  folder_id: number | null;
}

interface FolderOption {
  id: number;
  name: string;
}

interface UploadedAsset {
  id: number;
  media_kind: "image" | "video";
}

export function StoryComposer({
  channels,
  folders,
}: {
  channels: ChannelOption[];
  folders: FolderOption[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // Only folders that actually contain a story-capable account are worth offering — an
  // empty quick-select button would look like a bug, not an empty state.
  const foldersWithMembers = folders
    .map((f) => ({ folder: f, members: channels.filter((c) => c.folder_id === f.id) }))
    .filter((f) => f.members.length > 0);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setError(body.error ?? `Não foi possível enviar ${file.name}.`);
      return;
    }
    setAsset({ id: body.asset.id, media_kind: body.asset.media_kind });
  }

  function toggleChannel(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFolder(memberIds: number[]) {
    setSelected((prev) => {
      const allSelected = memberIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of memberIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!asset) {
      setError("Envie uma imagem ou vídeo primeiro.");
      return;
    }
    if (selected.size === 0) {
      setError("Escolha ao menos uma conta.");
      return;
    }
    setPosting(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: "",
        asset_ids: [asset.id],
        targets: [...selected].map((channel_id) => ({ channel_id, surface: "story" })),
        post_now: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setPosting(false);
    if (!res.ok) {
      setError(body.error ?? "Não foi possível postar o story.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="max-w-xl space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Mídia
        </h2>
        {asset ? (
          <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
            <span className="h-20 w-12 shrink-0 overflow-hidden rounded-md bg-surface-sunken">
              {asset.media_kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/media/${asset.id}?variant=thumb`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={`/api/media/${asset.id}`} className="h-full w-full object-cover" muted />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm text-ink-soft">
              {asset.media_kind === "image" ? "Imagem" : "Vídeo"} enviado
            </div>
            <button
              onClick={() => {
                setAsset(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              className="text-xs text-muted hover:text-status-failed"
            >
              Remover
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center hover:bg-surface-sunken/40">
            <span className="text-sm font-medium text-ink-soft">
              {uploading ? "Enviando…" : "Clique para escolher uma imagem ou vídeo"}
            </span>
            <span className="text-xs text-muted">Formato vertical (9:16) funciona melhor</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => onFile(e.target.files)}
            />
          </label>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Para onde vai
        </h2>

        {foldersWithMembers.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {foldersWithMembers.map(({ folder, members }) => {
              const ids = members.map((m) => m.id);
              const active = ids.every((id) => selected.has(id));
              return (
                <button
                  key={folder.id}
                  onClick={() => toggleFolder(ids)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-brand-weak text-brand-strong"
                      : "bg-surface-sunken text-muted hover:text-ink-soft"
                  }`}
                >
                  📁 {folder.name} · {ids.length}
                </button>
              );
            })}
          </div>
        ) : null}

        <ul className="space-y-1.5">
          {channels.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-sunken/40">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleChannel(c.id)}
                  className="accent-[var(--color-brand)]"
                />
                <ChannelAvatar
                  id={c.id}
                  name={c.account_name}
                  colorHue={c.color_hue}
                  avatarPath={c.avatar_path}
                  size={22}
                />
                <span className="text-sm text-ink">{c.account_name}</span>
                <span className="text-[10px] uppercase tracking-wide text-faint">
                  {platformBadge(c.platform)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {error ? <p className="text-sm text-status-failed">{error}</p> : null}

      <button
        onClick={submit}
        disabled={posting || uploading}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-60"
      >
        {posting ? "Postando…" : "Postar agora"}
      </button>
    </div>
  );
}
