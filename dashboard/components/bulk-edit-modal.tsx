"use client";

import { useEffect, useReducer, useState } from "react";
import { PeriodAttach } from "@/components/period-attach";
import { TagEditor } from "@/components/tag-editor";
import {
  bulkContextLoadReducer,
  bulkReviewReady,
  coverageLabel,
  coverageState,
  type BulkEditContext,
  type CoverageState,
} from "@/lib/bulk-edit-context";
import {
  buildBulkEditPayload,
  bulkEditChangeLabels,
  type BulkEditDraft,
} from "@/lib/bulk-edit-form";
import type { ContentKind, ContentStatus, Period, PeriodLink, Tag } from "@/lib/types";

interface BulkEditModalProps {
  postIds: number[];
  periods: Period[];
  timeOfDayTags: Tag[];
  topicTags: Tag[];
  onClose: () => void;
  onSaved: (labels: string[]) => void;
}

const coverageBadgeClass: Record<CoverageState, string> = {
  all: "border-status-posted/60 bg-status-posted/15 text-status-posted",
  some: "border-amber-500/60 bg-amber-500/10 text-amber-700",
  none: "border-border bg-surface text-faint",
};

function CoverageBadge({ count, total }: { count: number; total: number }) {
  const state = coverageState(count, total);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${coverageBadgeClass[state]}`}>
      {coverageLabel(count, total)}
    </span>
  );
}

function CurrentValueRow({
  label,
  values,
  total,
}: {
  label: string;
  values: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-20 shrink-0 font-medium text-ink-soft">{label}</span>
      {values.map((value) => (
        <span key={value.label} className="inline-flex items-center gap-1.5 text-ink">
          {value.label}
          <CoverageBadge count={value.count} total={total} />
        </span>
      ))}
    </div>
  );
}

export function CurrentSelectionSummary({ context }: { context: BulkEditContext }) {
  const total = context.post_count;
  return (
    <div className="mb-4 space-y-2 rounded-lg border border-border bg-surface-sunken p-4" aria-label="Valores atuais dos posts selecionados">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Seleção atual</p>
      <CurrentValueRow
        label="Status"
        total={total}
        values={context.content_statuses.map((row) => ({
          label: { ready: "Pronto", draft: "Rascunho", retired: "Aposentado" }[row.value],
          count: row.count,
        }))}
      />
      <CurrentValueRow
        label="Tipo"
        total={total}
        values={context.content_kinds.map((row) => ({
          label: row.value === "one_time" ? "Uma vez" : "Evergreen",
          count: row.count,
        }))}
      />
      <CurrentValueRow
        label="Cooldown"
        total={total}
        values={context.cooldowns.map((row) => ({
          label: row.value === null ? "Padrão da conta" : `${row.value} dia${row.value === 1 ? "" : "s"}`,
          count: row.count,
        }))}
      />
    </div>
  );
}

function withoutMatchingPeriodLinks(
  current: PeriodLink[],
  next: PeriodLink[],
): PeriodLink[] {
  const nextKeys = new Set(next.map((link) => `${link.periodId}:${link.mode}`));
  return current.filter((link) => !nextKeys.has(`${link.periodId}:${link.mode}`));
}

export function BulkEditModal({
  postIds,
  periods,
  timeOfDayTags,
  topicTags,
  onClose,
  onSaved,
}: BulkEditModalProps) {
  const [tagAdds, setTagAdds] = useState<number[]>([]);
  const [tagRemoves, setTagRemoves] = useState<number[]>([]);
  const [periodAdds, setPeriodAdds] = useState<PeriodLink[]>([]);
  const [periodRemoves, setPeriodRemoves] = useState<PeriodLink[]>([]);
  const [contentStatus, setContentStatus] = useState<ContentStatus | "unchanged">("unchanged");
  const [contentKind, setContentKind] = useState<ContentKind | "unchanged">("unchanged");
  const [cooldownMode, setCooldownMode] = useState<"unchanged" | "default" | "custom">(
    "unchanged"
  );
  const [cooldownDays, setCooldownDays] = useState(30);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [contextState, dispatchContext] = useReducer(bulkContextLoadReducer, {
    context: null,
    loading: true,
    error: null,
  });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const contextRequestBody = JSON.stringify({ post_ids: postIds });
  const { context, loading: contextLoading, error: contextError } = contextState;

  useEffect(() => {
    const controller = new AbortController();
    dispatchContext({ type: "start" });

    async function loadContext() {
      try {
        const response = await fetch("/api/posts/bulk-edit/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: contextRequestBody,
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error ?? "Não foi possível carregar os metadados existentes.");
        }
        if (
          typeof body.post_count !== "number" ||
          !Array.isArray(body.tags) ||
          !Array.isArray(body.periods) ||
          !Array.isArray(body.content_statuses) ||
          !Array.isArray(body.content_kinds) ||
          !Array.isArray(body.cooldowns)
        ) {
          throw new Error("A resposta dos metadados existentes veio incompleta.");
        }
        dispatchContext({ type: "success", context: body as BulkEditContext });
      } catch (loadError) {
        if (controller.signal.aborted) return;
        dispatchContext({
          type: "error",
          error: loadError instanceof Error ? loadError.message : "Não foi possível carregar os metadados existentes.",
        });
      }
    }

    loadContext();
    return () => controller.abort();
  }, [contextRequestBody, retryAttempt]);

  const draft: BulkEditDraft = {
    tagAdds,
    tagRemoves,
    periodAdds,
    periodRemoves,
    contentStatus,
    contentKind,
    cooldownMode,
    cooldownDays,
  };
  const allTags = [...timeOfDayTags, ...topicTags];
  const labels = bulkEditChangeLabels(draft, allTags, periods);
  const tagCoverage = Object.fromEntries(
    (context?.tags ?? []).map((row) => [row.tag_id, row.count]),
  ) as Record<number, number>;
  const periodCoverage = Object.fromEntries(
    (context?.periods ?? []).map((row) => [`${row.period_id}:${row.mode}`, row.count]),
  );
  const selectedPostCount = context?.post_count ?? 0;
  const cooldownInvalid =
    cooldownMode === "custom" && (!Number.isInteger(cooldownDays) || cooldownDays < 0);
  const reviewReady = bulkReviewReady(labels.length, cooldownInvalid, contextState);
  const field =
    "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand";

  function chooseTagAdds(ids: number[]) {
    setTagAdds(ids);
    setTagRemoves((current) => current.filter((id) => !ids.includes(id)));
  }

  function chooseTagRemoves(ids: number[]) {
    setTagRemoves(ids);
    setTagAdds((current) => current.filter((id) => !ids.includes(id)));
  }

  function choosePeriodAdds(next: PeriodLink[]) {
    setPeriodAdds(next);
    setPeriodRemoves((current) => withoutMatchingPeriodLinks(current, next));
  }

  function choosePeriodRemoves(next: PeriodLink[]) {
    setPeriodRemoves(next);
    setPeriodAdds((current) => withoutMatchingPeriodLinks(current, next));
  }

  function retryContext() {
    setRetryAttempt((attempt) => attempt + 1);
  }

  async function apply() {
    if (labels.length === 0 || cooldownInvalid || busy) return;
    setBusy(true);
    setApplyError(null);
    try {
      const response = await fetch("/api/posts/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBulkEditPayload(postIds, draft)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setApplyError(body.error ?? "Não foi possível aplicar a edição em massa.");
        return;
      }
      onSaved(labels);
    } catch {
      setApplyError("Não foi possível confirmar se a edição foi concluída. Atualize a Biblioteca antes de tentar de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-edit-title"
    >
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-xl">
        {reviewing ? (
          <>
            <h2 id="bulk-edit-title" className="font-display text-xl font-semibold text-ink">
              Aplicar {labels.length === 1 ? labels[0] : `${labels.length} mudanças`} em {postIds.length}{" "}
              post{postIds.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Isso atualiza cada post selecionado numa única operação atômica.
            </p>
            <ul className="mt-4 space-y-2 rounded-lg border border-border bg-surface-sunken p-4 text-sm text-ink">
              {labels.map((label) => (
                <li key={label}>• {label}</li>
              ))}
            </ul>
            {applyError ? <p className="mt-3 text-sm text-status-failed">{applyError}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewing(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface-sunken disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={busy}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-50"
              >
                {busy ? "Aplicando…" : "Confirmar edição em massa"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="bulk-edit-title" className="font-display text-xl font-semibold text-ink">
                  Editar {postIds.length} post{postIds.length === 1 ? "" : "s"} em massa
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Só os campos que você escolher abaixo vão mudar. Tags e períodos existentes não relacionados continuam anexados.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-sunken hover:text-ink"
                aria-label="Fechar edição em massa"
              >
                ✕
              </button>
            </div>

            {contextLoading ? (
              <div className="mt-6 rounded-lg border border-border bg-surface-sunken p-4 text-sm text-muted" role="status">
                Carregando metadados existentes…
              </div>
            ) : null}
            {contextError ? (
              <div className="mt-6 rounded-lg border border-status-failed/40 p-4" role="alert">
                <p className="text-sm text-status-failed">{contextError}</p>
                <p className="mt-1 text-xs text-muted">
                  Essa checagem só de leitura não alterou nenhum post.
                </p>
                <button
                  type="button"
                  onClick={retryContext}
                  className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken"
                >
                  Tentar de novo
                </button>
              </div>
            ) : null}

            {context ? (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-xs text-muted">
                  <span className="font-medium text-ink-soft">Cobertura</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CoverageBadge count={selectedPostCount} total={selectedPostCount} />
                    em todos os posts selecionados
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${coverageBadgeClass.some}`}>
                      Alguns (X de {selectedPostCount})
                    </span>
                    significa só aquela quantidade de posts selecionados
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CoverageBadge count={0} total={selectedPostCount} />
                    em nenhum post selecionado
                  </span>
                </div>

            <section className="mt-6 border-t border-border pt-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-ink">Tags</h3>
                <p className="text-xs text-muted">
                  As listas de adicionar e remover são separadas. Escolher uma tag numa lista a remove da outra.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-card border border-status-posted/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-status-posted">Adicionar tags</p>
                  <TagEditor
                    timeOfDayTags={timeOfDayTags}
                    topicTags={topicTags}
                    value={tagAdds}
                    onChange={chooseTagAdds}
                    allowCreateTopic={false}
                    coverage={tagCoverage}
                    selectedPostCount={selectedPostCount}
                    disableFullCoverage
                  />
                </div>
                <div className="rounded-card border border-border p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Remover tags</p>
                  <TagEditor
                    timeOfDayTags={timeOfDayTags}
                    topicTags={topicTags}
                    value={tagRemoves}
                    onChange={chooseTagRemoves}
                    allowCreateTopic={false}
                    coverage={tagCoverage}
                    selectedPostCount={selectedPostCount}
                    hideZeroCoverage
                    emptyCoverageMessage="Nenhum dos posts selecionados tem tags removíveis."
                  />
                </div>
              </div>
            </section>

            <section className="mt-6 border-t border-border pt-5">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-ink">Períodos</h3>
                <p className="text-xs text-muted">Escolha vínculos de verde ou bloqueio de forma independente para anexar e desanexar.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-status-posted">Anexar períodos</p>
                  <PeriodAttach
                    periods={periods}
                    exactValue={periodAdds}
                    onExactChange={choosePeriodAdds}
                    coverage={periodCoverage}
                    selectedPostCount={selectedPostCount}
                    disableFullCoverage
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Desanexar períodos</p>
                  <PeriodAttach
                    periods={periods}
                    exactValue={periodRemoves}
                    onExactChange={choosePeriodRemoves}
                    coverage={periodCoverage}
                    selectedPostCount={selectedPostCount}
                    hideZeroCoverage
                  />
                </div>
              </div>
            </section>

            <section className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-semibold text-ink">Definir valores compartilhados</h3>
              <p className="mb-3 text-xs text-muted">Deixe um campo sem alterar para preservar o valor atual de cada post.</p>
              <CurrentSelectionSummary context={context} />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-ink-soft">
                  <span className="mb-1 block">Status</span>
                  <select className={`${field} w-full`} value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | "unchanged")}>
                    <option value="unchanged">Deixar sem alterar</option>
                    <option value="draft">Rascunho</option>
                    <option value="ready">Pronto</option>
                    <option value="retired">Aposentado</option>
                  </select>
                </label>
                <label className="text-xs text-ink-soft">
                  <span className="mb-1 block">Tipo</span>
                  <select className={`${field} w-full`} value={contentKind} onChange={(e) => setContentKind(e.target.value as ContentKind | "unchanged")}>
                    <option value="unchanged">Deixar sem alterar</option>
                    <option value="evergreen">Evergreen</option>
                    <option value="one_time">Uma vez</option>
                  </select>
                </label>
                <label className="text-xs text-ink-soft">
                  <span className="mb-1 block">Cooldown</span>
                  <select className={`${field} w-full`} value={cooldownMode} onChange={(e) => setCooldownMode(e.target.value as typeof cooldownMode)}>
                    <option value="unchanged">Deixar sem alterar</option>
                    <option value="default">Usar padrão da conta</option>
                    <option value="custom">Definir dias customizados</option>
                  </select>
                </label>
              </div>
              {cooldownMode === "custom" ? (
                <label className="mt-3 block max-w-48 text-xs text-ink-soft">
                  <span className="mb-1 block">Dias de cooldown</span>
                  <input type="number" min={0} step={1} className={`${field} w-full`} value={cooldownDays} onChange={(e) => setCooldownDays(Number(e.target.value))} />
                </label>
              ) : null}
              {cooldownInvalid ? <p className="mt-2 text-xs text-status-failed">O cooldown deve ser zero ou um número inteiro positivo.</p> : null}
            </section>

              </>
            ) : null}

            {applyError ? <p className="mt-3 text-sm text-status-failed">{applyError}</p> : null}
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-xs text-muted">
                {labels.length === 0 ? "Escolha ao menos uma mudança." : `${labels.length} mudança${labels.length === 1 ? "" : "s"} pronta${labels.length === 1 ? "" : "s"} pra revisar.`}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface-sunken">Cancelar</button>
                <button
                  type="button"
                  onClick={() => setReviewing(true)}
                  disabled={!reviewReady}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-50"
                >
                  Revisar mudanças
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
