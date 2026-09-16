"use client";

import { useState, type ReactNode } from "react";

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

/**
 * A search box (and, when folders are in use, folder grouping) over the Channels grid,
 * without moving any of its rich (Server Component) card markup into client code.
 *
 * `children` is the SAME array the page already builds with `channels.map(...)` — passed
 * through as Server-rendered output, matching the standard Next.js pattern of a Client
 * Component accepting Server Component children. Matching each child to its channel is by
 * POSITION (both arrays come from the same `.map()` over the same list, so the order is
 * guaranteed to agree), rather than trying to inspect or re-render the markup — grouping by
 * folder reorders which INDEXES get pulled into which section, never the cards themselves.
 */
export function ChannelSearchGrid({
  channels,
  folders,
  children,
}: {
  channels: { id: number; account_name: string; platform: string; folder_id?: number | null }[];
  /** Omitted (or everything landing in one bucket), the grid stays flat exactly as
   *  before — grouping only kicks in once there's more than one group to tell apart,
   *  same rule the composer's own folder picker uses. */
  folders?: { id: number; name: string }[];
  children: ReactNode[];
}) {
  const [query, setQuery] = useState("");
  // Sections start EXPANDED here, unlike the composer's picker — this page is for
  // browsing/managing every account you have, not picking a few to send to, so hiding
  // everything by default would just add a click to the common case of "look at my
  // accounts." Collapsing is here for when a folder's list gets long, not as a filter.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const visible = channels
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) => !q || c.account_name.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q),
    );

  const folderList = folders ?? [];
  const byFolder = new Map<number, { i: number }[]>();
  const unfoldered: { i: number }[] = [];
  for (const { c, i } of visible) {
    const folder = c.folder_id != null ? folderList.find((f) => f.id === c.folder_id) : undefined;
    if (folder) {
      if (!byFolder.has(folder.id)) byFolder.set(folder.id, []);
      byFolder.get(folder.id)!.push({ i });
    } else {
      unfoldered.push({ i });
    }
  }
  const groups = [
    ...folderList
      .filter((f) => byFolder.has(f.id))
      .map((f) => ({ key: String(f.id), title: f.name, items: byFolder.get(f.id)! })),
    ...(unfoldered.length > 0 ? [{ key: "none", title: "Sem pasta", items: unfoldered }] : []),
  ];
  const grouped = groups.length > 1;

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {channels.length > 1 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome da conta ou plataforma…"
          className="mb-4 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand"
        />
      ) : null}
      {visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center text-sm text-muted">
          Nenhuma conta corresponde a essa busca.
        </p>
      ) : grouped ? (
        <div className="space-y-4">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  aria-expanded={!isCollapsed}
                  title={isCollapsed ? "Clique para expandir" : "Clique para recolher"}
                  className="group/toggle mb-3 flex items-center gap-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-soft transition-transform group-hover/toggle:border-brand group-hover/toggle:text-brand ${isCollapsed ? "-rotate-90" : ""}`}
                  >
                    <ChevronGlyph />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft group-hover/toggle:text-ink">
                    {g.title}
                  </span>
                  <span className="data text-[11px] text-faint">{g.items.length}</span>
                </button>
                {isCollapsed ? null : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {g.items.map(({ i }) => children[i])}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{visible.map(({ i }) => children[i])}</div>
      )}
    </div>
  );
}
