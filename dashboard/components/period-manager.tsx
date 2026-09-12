"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Period } from "@/lib/types";
import { describePeriod } from "@/lib/format";
import { useToast } from "@/components/toast";

type PeriodWithUsage = Period & { post_count: number };

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand";
const label = "block text-xs font-medium text-ink-soft mb-1";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type FormState = {
  name: string;
  recurs_yearly: boolean;
  single_day: boolean;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  start_date: string;
  end_date: string;
};

function initialForm(period?: Period): FormState {
  if (period) {
    const singleDay = period.recurs_yearly
      ? period.start_month === period.end_month && period.start_day === period.end_day
      : !!period.start_date && period.start_date === period.end_date;
    return {
      name: period.name,
      recurs_yearly: !!period.recurs_yearly,
      single_day: singleDay,
      start_month: period.start_month ?? 1,
      start_day: period.start_day ?? 1,
      end_month: period.end_month ?? 1,
      end_day: period.end_day ?? 1,
      start_date: period.start_date ?? "",
      end_date: period.end_date ?? "",
    };
  }
  // A sensible default: a winter-ish yearly window the user will rename.
  return {
    name: "", recurs_yearly: true, single_day: false,
    start_month: 12, start_day: 1, end_month: 2, end_day: 28,
    start_date: "", end_date: "",
  };
}

function MonthDay({
  monthValue, dayValue, onMonth, onDay,
}: {
  monthValue: number; dayValue: number;
  onMonth: (v: number) => void; onDay: (v: number) => void;
}) {
  return (
    <div className="flex gap-2">
      <select className={field} value={monthValue} onChange={(e) => onMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select className={`${field} w-20`} value={dayValue} onChange={(e) => onDay(Number(e.target.value))}>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i} value={i + 1}>{i + 1}</option>
        ))}
      </select>
    </div>
  );
}

function PeriodForm({ period, onDone }: { period?: Period; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(() => initialForm(period));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // When "single day" is on, the end mirrors the start.
  const endMonth = f.single_day ? f.start_month : f.end_month;
  const endDay = f.single_day ? f.start_day : f.end_day;
  const endDate = f.single_day ? f.start_date : f.end_date;

  const preview = describePeriod({
    recurs_yearly: f.recurs_yearly ? 1 : 0,
    start_month: f.start_month, start_day: f.start_day,
    end_month: endMonth, end_day: endDay,
    start_date: f.start_date || null, end_date: endDate || null,
  });

  async function save() {
    setError(null);
    if (!f.name.trim()) {
      setError("Dê um nome ao período.");
      return;
    }
    const body = f.recurs_yearly
      ? {
          name: f.name.trim(), recurs_yearly: true,
          start_month: f.start_month, start_day: f.start_day,
          end_month: endMonth, end_day: endDay,
        }
      : {
          name: f.name.trim(), recurs_yearly: false,
          start_date: f.start_date, end_date: endDate,
        };
    const res = await fetch(period ? `/api/periods/${period.id}` : "/api/periods", {
      method: period ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Não foi possível salvar o período.");
      return;
    }
    onDone();
    startTransition(() => router.refresh());
  }

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-brand-weak font-medium text-brand-strong" : "text-muted hover:text-ink"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Nome</label>
        <input
          className={field}
          placeholder="Inverno, 7 de setembro, Temporada de festas…"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="inline-flex rounded-lg border border-border p-0.5">
        <button type="button" className={segBtn(f.recurs_yearly)} onClick={() => set("recurs_yearly", true)}>
          Recorrente todo ano
        </button>
        <button type="button" className={segBtn(!f.recurs_yearly)} onClick={() => set("recurs_yearly", false)}>
          Datas avulsas
        </button>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={f.single_day}
          onChange={(e) => set("single_day", e.target.checked)}
        />
        Um único dia <span className="text-faint">(ex.: 7 de setembro — sem intervalo)</span>
      </label>

      {f.recurs_yearly ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>{f.single_day ? "Dia" : "De"}</label>
            <MonthDay
              monthValue={f.start_month} dayValue={f.start_day}
              onMonth={(v) => set("start_month", v)} onDay={(v) => set("start_day", v)}
            />
          </div>
          {f.single_day ? null : (
            <div>
              <label className={label}>Até</label>
              <MonthDay
                monthValue={f.end_month} dayValue={f.end_day}
                onMonth={(v) => set("end_month", v)} onDay={(v) => set("end_day", v)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>{f.single_day ? "Dia" : "De"}</label>
            <input type="date" className={field} value={f.start_date}
              onChange={(e) => set("start_date", e.target.value)} />
          </div>
          {f.single_day ? null : (
            <div>
              <label className={label}>Até</label>
              <input type="date" className={field} value={f.end_date}
                onChange={(e) => set("end_date", e.target.value)} />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        ⤷ <span className="data text-ink-soft">{preview}</span>
      </p>

      {error ? <p className="text-sm text-status-failed">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
        >
          {pending ? "Salvando…" : period ? "Salvar alterações" : "Salvar período"}
        </button>
      </div>
    </div>
  );
}

export function PeriodAdd() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-ink"
      >
        Adicionar período
      </button>
    );
  }
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h3 className="mb-4 font-display text-base font-semibold text-ink">Novo período</h3>
      <PeriodForm onDone={() => setOpen(false)} />
    </div>
  );
}

function PeriodCard({
  period,
  selected,
  onToggleSelect,
}: {
  period: PeriodWithUsage;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  async function remove() {
    const usage =
      period.post_count === 0
        ? "Nenhum post usa essa janela."
        : `${period.post_count} post${period.post_count === 1 ? "" : "s"} que a usa${period.post_count === 1 ? "" : "m"} perderá${period.post_count === 1 ? "" : "ão"} essa janela.`;
    if (!confirm(`Excluir "${period.name}"? ${usage}`)) return;
    const res = await fetch(`/api/periods/${period.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.error ?? "Não foi possível excluir o período.", "error");
      return;
    }
    showToast(`"${period.name}" excluído.`);
    startTransition(() => router.refresh());
  }

  if (editing) {
    return (
      <div className="rounded-card border border-border bg-surface p-5 md:col-span-2">
        <h3 className="mb-4 font-display text-base font-semibold text-ink">Editar "{period.name}"</h3>
        <PeriodForm period={period} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Selecionar ${period.name}`}
            className="mt-1"
          />
          <div>
            <h3 className="font-display text-base font-semibold text-ink">{period.name}</h3>
            <p className="data mt-1 text-xs text-ink-soft">{describePeriod(period)}</p>
            {period.post_count > 0 ? (
              <Link
                href={`/library?period=${period.id}`}
                className="mt-0.5 block text-xs text-brand underline underline-offset-2"
              >
                Em {period.post_count} post{period.post_count === 1 ? "" : "s"}
              </Link>
            ) : (
              <p className="mt-0.5 text-xs text-muted">Em nenhum post</p>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-muted">
          {period.recurs_yearly ? "Anual" : "Avulso"}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-sunken"
        >
          Editar
        </button>
        <button
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

export function PeriodManager({ periods }: { periods: PeriodWithUsage[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { showToast } = useToast();

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Excluir ${ids.length} período${ids.length === 1 ? "" : "s"}? Os posts que os usam perderão essas janelas. Isso não pode ser desfeito.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/periods/${id}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false)),
    );
    setBulkDeleting(false);
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      showToast(`${failed} de ${ids.length} não puderam ser excluídos.`, "error");
    } else {
      showToast(`${ids.length} período${ids.length === 1 ? "" : "s"} excluído${ids.length === 1 ? "" : "s"}.`);
    }
    setSelectedIds(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div>
      {selectedIds.size > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-medium text-ink-soft">
            {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="rounded-md border border-status-failed/40 px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50"
          >
            {bulkDeleting ? "Excluindo…" : "Excluir selecionados"}
          </button>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {periods.map((p) => (
          <PeriodCard
            key={p.id}
            period={p}
            selected={selectedIds.has(p.id)}
            onToggleSelect={() => toggleSelected(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
