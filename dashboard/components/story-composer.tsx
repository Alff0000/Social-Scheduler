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

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
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

  // Same grouping/collapse pattern as the main composer's ChannelSurfacePicker: a folder
  // with no story-capable members here is skipped outright, and grouping only kicks in
  // once there's more than one group to tell apart — otherwise "Sem pasta" alone would
  // just be a redundant heading over the whole list.
  const byFolder = new Map<number, ChannelOption[]>();
  const unfoldered: ChannelOption[] = [];
  for (const c of channels) {
    if (c.folder_id != null && folders.some((f) => f.id === c.folder_id)) {
      if (!byFolder.has(c.folder_id)) byFolder.set(c.folder_id, []);
      byFolder.get(c.folder_id)!.push(c);
    } else {
      unfoldered.push(c);
    }
  }
  const groups = [
    ...folders
      .filter((f) => byFolder.has(f.id))
      .map((f) => ({ key: String(f.id), title: f.name, members: byFolder.get(f.id)! })),
    ...(unfoldered.length > 0 ? [{ key: "none", title: "Sem pasta", members: unfoldered }] : []),
  ];
  const grouped = groups.length > 1;

  // Starts collapsed — picking a folder to open is the point, not scrolling past every
  // account in every folder to find the one you want. See the matching comment in
  // channel-surface-picker.tsx.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.key))
  );
  function toggleCollapsed(key: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    // fetch() itself rejects on a dropped connection (not just a bad HTTP status) — a
    // real risk on a large upload over a flaky connection. Without this catch, that
    // throw skipped setUploading(false) and left the UI stuck showing "uploading"
    // forever with no error.
    let res: Response;
    try {
      res = await fetch("/api/assets/upload", { method: "POST", body: fd });
    } catch {
      setUploading(false);
      setError(
        `A conexão caiu durante o envio de ${file.name}. Verifique sua internet e tente de novo.`
      );
      return;
    }
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

        {grouped ? (
          <div className="space-y-2">
            {groups.map((g) => {
              const isCollapsed = collapsedFolders.has(g.key);
              const ids = g.members.map((m) => m.id);
              const selectedCount = ids.filter((id) => selected.has(id)).length;
              const allSelected = selectedCount === ids.length;
              return (
                <div key={g.key} className="rounded-lg border border-border">
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(g.key)}
                      aria-expanded={!isCollapsed}
                      title={isCollapsed ? "Clique para expandir" : "Clique para recolher"}
                      className="group/toggle flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-soft transition-transform group-hover/toggle:border-brand group-hover/toggle:text-brand ${isCollapsed ? "-rotate-90" : ""}`}
                      >
                        <ChevronGlyph />
                      </span>
                      <span className="truncate text-sm font-medium text-ink group-hover/toggle:text-brand-strong">
                        {g.title}
                      </span>
                      <span className="data shrink-0 text-[11px] text-faint">
                        {selectedCount > 0 ? `${selectedCount}/${ids.length}` : ids.length}
                      </span>
                    </button>
                    {ids.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => toggleFolder(ids)}
                        className="shrink-0 text-xs font-medium text-brand-strong hover:underline"
                      >
                        {allSelected ? "Limpar" : "Selecionar todas"}
                      </button>
                    ) : null}
                  </div>
                  {isCollapsed ? null : (
                    <ul className="space-y-1.5 border-t border-border p-3">
                      {g.members.map((c) => (
                        <ChannelRow key={c.id} channel={c} checked={selected.has(c.id)} onToggle={toggleChannel} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {channels.map((c) => (
              <ChannelRow key={c.id} channel={c} checked={selected.has(c.id)} onToggle={toggleChannel} />
            ))}
          </ul>
        )}
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

function ChannelRow({
  channel: c,
  checked,
  onToggle,
}: {
  channel: ChannelOption;
  checked: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-sunken/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(c.id)}
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
  );
}
