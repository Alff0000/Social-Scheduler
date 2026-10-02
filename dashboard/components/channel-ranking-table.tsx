"use client";

import { useMemo, useState } from "react";
import { ChannelAvatar } from "@/components/ui";
import { channelColor } from "@/lib/format";
import { compact } from "@/lib/insights";
import { platformBadge } from "@/lib/platforms";
import type { ChannelRankingRow } from "@/lib/queries";

type SortKey = "views" | "reach" | "likes" | "comments" | "saves" | "shares" | "followers" | "posts";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "views", label: "Views" },
  { key: "reach", label: "Alcance" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "saves", label: "Salvos" },
  { key: "shares", label: "Compart." },
  { key: "followers", label: "Seguidores" },
];

/**
 * Every active account with its totals for the chosen period, sortable by any column.
 *
 * Sorting is client-side on purpose: DateRangeFilter navigates by replacing the URL's query
 * string with only its own range params, so a sort kept in the URL would be wiped every time
 * the period changed. The rows are already all here (one per account), so there is nothing
 * for the server to add.
 *
 * An account with no metrics at all in the period shows "—" and sinks to the bottom of
 * every sort, never "0": no data yet is not the same claim as zero views.
 */
export function ChannelRankingTable({ rows }: { rows: ChannelRankingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");

  const folders = useMemo(
    () => [...new Set(rows.map((r) => r.folder_name).filter((f): f is string => !!f))].sort(),
    [rows],
  );
  const hasUnfoldered = rows.some((r) => !r.folder_name);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (folder === "" ||
          (folder === "__none__" ? !r.folder_name : r.folder_name === folder)) &&
        (!q || r.account_name.toLowerCase().includes(q)),
    );
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return a.account_name.localeCompare(b.account_name);
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av || a.account_name.localeCompare(b.account_name);
    });
  }, [rows, sortKey, folder, query]);

  const max = Math.max(...shown.map((r) => r[sortKey] ?? 0), 1);
  const withData = rows.filter((r) => r.days_with_data > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar conta…"
          className="w-56 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand"
        />
        {folders.length > 0 ? (
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            aria-label="Filtrar por pasta"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand"
          >
            <option value="">Todas as pastas</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {hasUnfoldered ? <option value="__none__">Sem pasta</option> : null}
          </select>
        ) : null}
        <p className="text-xs text-muted">
          {rows.length} conta{rows.length === 1 ? "" : "s"} · {withData} com dados no período
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center text-sm text-muted">
          {rows.length === 0 ? "Nenhuma conta ativa ainda." : "Nenhuma conta corresponde ao filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                <th className="w-10 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Conta</th>
                {COLUMNS.map((c) => {
                  const active = c.key === sortKey;
                  return (
                    <th
                      key={c.key}
                      aria-sort={active ? "descending" : "none"}
                      className="px-3 py-2.5 text-right font-medium"
                    >
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        title={`Ordenar por ${c.label.toLowerCase()}`}
                        className={`uppercase tracking-wide hover:text-ink ${active ? "font-semibold text-brand-strong" : ""}`}
                      >
                        {c.label}
                        {active ? " ↓" : ""}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r, i) => {
                const color = channelColor(r.id, r.color_hue);
                const noData = r.days_with_data === 0;
                return (
                  <tr key={r.id} className="hover:bg-surface-sunken/50">
                    <td
                      className={`data px-3 py-2.5 text-xs ${i < 3 && !noData ? "font-semibold text-brand-strong" : "text-faint"}`}
                    >
                      {i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ChannelAvatar
                          id={r.id}
                          name={r.account_name}
                          colorHue={r.color_hue}
                          avatarPath={r.avatar_path}
                          size={26}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink">{r.account_name}</p>
                          <p className="truncate text-[10px] uppercase tracking-wide text-faint">
                            {platformBadge(r.platform)}
                            {r.folder_name ? ` · ${r.folder_name}` : ""}
                            {noData ? " · sem dados no período" : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map((c) => {
                      const v = r[c.key];
                      const active = c.key === sortKey;
                      return (
                        <td key={c.key} className="px-3 py-2.5 text-right">
                          <span
                            className={`data text-[13px] ${active ? "font-semibold text-ink" : "text-ink-soft"}`}
                            title={v === null ? undefined : v.toLocaleString("pt-BR")}
                          >
                            {v === null ? "—" : compact(v)}
                          </span>
                          {active && v !== null ? (
                            <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-surface-sunken">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%`,
                                  backgroundColor: color.dot,
                                }}
                              />
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
