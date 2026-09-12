"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bandLabel } from "@/lib/cadence";
import type { Tag } from "@/lib/types";
import { useToast } from "@/components/toast";

type TopicTag = Tag & { post_count: number };

function usageLabel(n: number): string {
  if (n === 0) return "Não usada em nenhum post";
  return `Em ${n} post${n === 1 ? "" : "s"}`;
}

const secondaryBtn =
  "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-sunken disabled:opacity-50";

function TagRow({
  tag,
  selected,
  onToggleSelect,
}: {
  tag: TopicTag;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "renaming" | "deleting">("idle");
  const [draft, setDraft] = useState(tag.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setDraft(tag.name);
    setError(null);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível excluir a etiqueta.");
      setBusy(false);
      return;
    }
    setMode("idle");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function rename() {
    const name = draft.trim();
    if (!name || busy) return;
    if (name === tag.name) {
      reset();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível renomear a etiqueta.");
      setBusy(false);
      return;
    }
    setMode("idle");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
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
          <div className="flex min-w-0 items-start gap-2.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Selecionar ${tag.name}`}
              className="mt-1"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{tag.name}</p>
              {tag.post_count > 0 ? (
                <Link
                  href={`/library?tag=${encodeURIComponent(tag.name)}`}
                  className="mt-0.5 block text-xs text-brand underline underline-offset-2"
                >
                  {usageLabel(tag.post_count)}
                </Link>
              ) : (
                <p className="mt-0.5 text-xs text-muted">{usageLabel(tag.post_count)}</p>
              )}
            </div>
          </div>
        )}

        {mode === "idle" ? (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setMode("renaming")} disabled={pending} className={secondaryBtn}>
              Renomear
            </button>
            <button
              onClick={() => setMode("deleting")}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50"
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
                disabled={busy || pending || !draft.trim()}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-ink disabled:opacity-50"
              >
                {busy ? "Salvando…" : "Salvar"}
              </button>
            ) : (
              <button
                onClick={remove}
                disabled={busy || pending}
                className="rounded-md bg-status-failed px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            )}
          </div>
        )}
      </div>

      {mode === "renaming" ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-ink-soft">
          Corrige a grafia em todo lugar de uma vez.{" "}
          {tag.post_count === 0 ? (
            <>Ela ainda não está em nenhum post.</>
          ) : (
            <>
              Todos os{" "}
              <span className="font-medium text-ink">
                {tag.post_count} post{tag.post_count === 1 ? "" : "s"}
              </span>{" "}
              mantêm a etiqueta com o novo nome.
            </>
          )}
        </p>
      ) : null}

      {mode === "deleting" ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-ink-soft">
          {tag.post_count === 0 ? (
            <>
              Excluir <span className="font-medium text-ink">{tag.name}</span>? Ela não está
              em nenhum post, então nada mais muda.
            </>
          ) : (
            <>
              Excluir <span className="font-medium text-ink">{tag.name}</span>? Ela sai de{" "}
              <span className="font-medium text-ink">
                {tag.post_count} post{tag.post_count === 1 ? "" : "s"}
              </span>
              . Os posts em si — legendas, imagens, agendamentos — não são afetados, e
              qualquer outra etiqueta que carreguem permanece. Isso não pode ser desfeito.{" "}
              <span className="text-muted">
                Corrigindo um erro de digitação? Cancele e use Renomear em vez disso — isso
                mantém os posts vinculados.
              </span>
            </>
          )}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-status-failed">{error}</p> : null}
    </div>
  );
}

export function TagManager({
  topicTags,
  bandTags,
}: {
  topicTags: TopicTag[];
  bandTags: Tag[];
}) {
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
        `Excluir ${ids.length} etiqueta${ids.length === 1 ? "" : "s"}? Elas saem de qualquer post que as carregue — os posts em si não são afetados. Isso não pode ser desfeito.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/tags/${id}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false)),
    );
    setBulkDeleting(false);
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      showToast(`${failed} de ${ids.length} não puderam ser excluídas.`, "error");
    } else {
      showToast(`${ids.length} etiqueta${ids.length === 1 ? "" : "s"} excluída${ids.length === 1 ? "" : "s"}.`);
    }
    setSelectedIds(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Tópicos</h2>
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="rounded-md border border-status-failed/40 px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50"
            >
              {bulkDeleting ? "Excluindo…" : `Excluir ${selectedIds.size} selecionada${selectedIds.size === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-sm text-muted">
          Suas próprias etiquetas. Adicione novas ao criar um post; renomeie ou retire-as
          aqui. Renomear corrige um erro de digitação em todo lugar de uma vez e mantém os
          posts vinculados — excluir tira a etiqueta deles.
        </p>
        {topicTags.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center text-sm text-muted">
            Ainda sem etiquetas de tópico. Adicione uma no seletor de etiquetas ao criar um post.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {topicTags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                selected={selectedIds.has(tag.id)}
                onToggleSelect={() => toggleSelected(tag.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-base font-semibold text-ink">
          Horário do dia
        </h2>
        <p className="mb-3 text-sm text-muted">
          Um conjunto fixo que o agendador de preenchimento automático usa por nome, então
          essas não podem ser excluídas. Deixe um post sem etiqueta (ou em Qualquer hora)
          para usar o horário padrão da conta.
        </p>
        <div className="flex flex-wrap gap-2">
          {bandTags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-border bg-surface-sunken px-3 py-1 text-sm capitalize text-muted"
            >
              {bandLabel(tag.name)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
