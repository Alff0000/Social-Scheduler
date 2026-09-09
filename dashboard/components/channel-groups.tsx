"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AutofillConfig } from "./autofill-config";
import type { LanePanelData } from "@/lib/autofill-lanes";
import type { Surface } from "@/lib/types";
import { ChannelTimezone } from "./channel-timezone";
import { TimezonePicker } from "./timezone-picker";
import { tzAbbrev } from "@/lib/format";

export interface GroupRow {
  id: number;
  name: string;
  timezone: string;
  bpp_every_days: number;
  bpp_pool_size: number;
  /** The group's auto-fill lanes, one per surface it offers — see toLanePanels. Replaces
   *  the flat autofill_* columns, which nothing reads since migration 0028. */
  lanes: LanePanelData[];
  /** Which surfaces this group can offer — "story" only when a member can post one. */
  surfaces: Surface[];
  members: { id: number; account_name: string; platform: string }[];
}

export function ChannelGroups({
  groups,
  defaultTimezone,
  bandTimes,
}: {
  groups: GroupRow[];
  /** The install's DEFAULT_TIMEZONE (from lib/config). A new group starts here rather
   *  than at a hardcoded "UTC" — a group left on the wrong zone posts to real accounts
   *  at the wrong wall-clock hour. */
  defaultTimezone: string;
  /** config.bandTimes, passed down from the server page — this is a client component and
   *  lib/config.ts is server-only, so it cannot import it directly. */
  bandTimes: { morning: string; afternoon: string; evening: string };
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [tzValid, setTzValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startT] = useTransition();

  // Stable identity so TimezonePicker's effect doesn't re-fire every render.
  const handleTzValidity = useCallback((v: boolean) => setTzValid(v), []);

  async function create() {
    setError(null);
    const res = await fetch("/api/channel-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timezone }),
    });
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error || "Não foi possível criar o grupo.");
      return;
    }
    setName("");
    setTimezone(defaultTimezone);
    startT(() => router.refresh());
  }

  async function remove(id: number, label: string) {
    if (
      !window.confirm(
        `Excluir o grupo "${label}"?\n\nSuas contas voltam a preencher automaticamente sozinhas. ` +
          `Nada já agendado é alterado ou excluído.`
      )
    ) {
      return;
    }
    await fetch(`/api/channel-groups/${id}`, { method: "DELETE" });
    startT(() => router.refresh());
  }

  const field =
    "rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink focus:border-brand";

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink">Grupos de preenchimento automático</h2>
        <p className="mt-1 text-xs text-muted">
          Contas num grupo preenchem juntas — o mesmo conteúdo, no mesmo momento, numa única
          cadência. Uma conta que não pode publicar algo (Threads e vídeo, por exemplo) fica de
          fora naquele horário; qualquer coisa bloqueada por cooldown ou bloqueio segura o grupo todo.
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-card border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">{g.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="data">
                    {g.timezone} · {tzAbbrev(g.timezone)}
                  </span>{" "}
                  ·{" "}
                  {g.members.length
                    ? g.members.map((m) => m.account_name).join(" + ")
                    : "nenhuma conta ainda"}
                </p>
              </div>
              <button
                onClick={() => remove(g.id, g.name)}
                disabled={pending}
                className="text-xs text-muted hover:text-status-failed disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
            {/* The group owns its members' timezone: one preview, one confirm, every
                member's pending sends moved together. Same control the ungrouped
                channels use. */}
            <ChannelTimezone target={{ kind: "group", id: g.id }} timezone={g.timezone} />
            <AutofillConfig
              target={{ kind: "group", id: g.id }}
              surfaces={g.surfaces}
              lanes={g.lanes}
              bppEveryDays={g.bpp_every_days ?? 0}
              bppPoolSize={g.bpp_pool_size ?? 0}
              bandTimes={bandTimes}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start gap-3">
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block">Novo grupo</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pessoal"
              className={field}
            />
          </label>
          <div className="min-w-56 text-xs text-ink-soft">
            <span className="mb-1 block">Fuso horário</span>
            {/* Same picker the channel form uses, so an invalid zone can't be typed —
                and a group that silently stayed on "UTC" posted at the wrong hour. */}
            <TimezonePicker
              value={timezone}
              onChange={setTimezone}
              onValidityChange={handleTzValidity}
              className={`w-full ${field}`}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={create}
            disabled={pending || !name.trim() || !tzValid}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
          >
            Criar grupo
          </button>
          {error ? <span className="text-xs text-status-failed">{error}</span> : null}
        </div>
      </div>
    </section>
  );
}
