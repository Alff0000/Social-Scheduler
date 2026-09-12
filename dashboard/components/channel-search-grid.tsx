"use client";

import { useState, type ReactNode } from "react";

/**
 * A search box over the Channels grid, without moving any of its rich (Server Component)
 * card markup into client code.
 *
 * `children` is the SAME array the page already builds with `channels.map(...)` — passed
 * through as Server-rendered output, matching the standard Next.js pattern of a Client
 * Component accepting Server Component children. Filtering matches each child to its
 * channel by POSITION (both arrays come from the same `.map()` over the same list, so the
 * order is guaranteed to agree), rather than trying to inspect or re-render the markup.
 */
export function ChannelSearchGrid({
  channels,
  children,
}: {
  channels: { id: number; account_name: string; platform: string }[];
  children: ReactNode[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visibleIndexes = channels
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) => !q || c.account_name.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q),
    )
    .map(({ i }) => i);

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
      {visibleIndexes.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center text-sm text-muted">
          Nenhuma conta corresponde a essa busca.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleIndexes.map((i) => children[i])}
        </div>
      )}
    </div>
  );
}
