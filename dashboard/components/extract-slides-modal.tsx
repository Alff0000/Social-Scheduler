"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocusTrap } from "./use-modal-focus-trap";

export interface ExtractSlide {
  assetId: number;
  /** "image" | "video" — a video slide comes out as a Reel, which is worth showing. */
  mediaKind: string;
}

/**
 * The modal's computed copy, pulled out so it can be tested without a DOM — createPortal
 * needs a real document, so the component itself can't go through renderToStaticMarkup.
 * This is the sentence that has to be right: the counts move as boxes are ticked, and
 * getting either side wrong misdescribes a destructive-looking operation.
 */
export function extractSummary(totalSlides: number, selectedCount: number): string {
  if (selectedCount === 0) return "Marque as fotos que você quer separar.";
  const left = totalSlides - selectedCount;
  const posts = selectedCount === 1 ? "1 novo post" : `${selectedCount} novos posts`;
  const rest =
    left === 1
      ? "Este post mantém a foto restante e vira um post único."
      : `Este post mantém as outras ${left} fotos e continua um carrossel.`;
  return `Separando ${selectedCount === 1 ? "1 foto" : `${selectedCount} fotos`} em ${posts}. ${rest}`;
}

/**
 * Pick slides to pull out of a carousel. Nothing is written until
 * POST /api/posts/[id]/extract succeeds.
 *
 * Selection lives here and only here — the server re-derives everything from the asset ids,
 * and rejects a selection that no longer matches the post (guard 7), so a stale picker fails
 * loudly rather than extracting the wrong photos.
 */
export function ExtractSlidesModal({
  postId,
  slides,
  onClose,
  onExtracted,
}: {
  postId: number;
  slides: ExtractSlide[];
  onClose: () => void;
  onExtracted: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalFocusTrap({ panelRef, onClose });

  function toggle(assetId: number) {
    setPicked((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  }

  // Taking every slide would leave the original with zero photos. The server refuses it
  // (guard 8) and names the other action; blocking it here too means the owner finds out
  // before clicking, not after.
  const takesEverything = picked.length === slides.length;
  const canSubmit = picked.length > 0 && !takesEverything && !submitting;

  async function confirm() {
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/posts/${postId}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_ids: picked }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      // The server's message is the specific one (already published / send queued / that's
      // every photo), so it is shown verbatim rather than replaced with a generic failure.
      setError(body.error ?? "Não foi possível separar essas fotos.");
      return;
    }
    onExtracted();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Separar slides"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border-strong bg-surface p-5 shadow-lg"
      >
        <h2 className="font-display text-base font-semibold text-ink">Separar slides</h2>
        <p className="mt-1 text-sm text-muted">{extractSummary(slides.length, picked.length)}</p>
        <p className="mt-2 text-sm text-muted">
          Cada uma vira seu próprio post com uma cópia da legenda, contas, tags e
          períodos deste. Nenhuma foto é excluída.
        </p>

        <ul className="mt-4 flex flex-wrap gap-3">
          {slides.map((slide, i) => {
            const on = picked.includes(slide.assetId);
            return (
              <li key={slide.assetId}>
                <label className="group relative block cursor-pointer">
                  <input
                    type="checkbox"
                    className="absolute left-1 top-1 z-10"
                    checked={on}
                    onChange={() => toggle(slide.assetId)}
                    aria-label={`Separar foto ${i + 1}`}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${slide.assetId}?variant=thumb`}
                    alt={`Slide ${i + 1}`}
                    className={`h-24 w-24 rounded-lg border-2 object-cover ${
                      on ? "border-accent opacity-100" : "border-border opacity-60"
                    }`}
                  />
                  {slide.mediaKind === "video" ? (
                    <span className="absolute bottom-1 right-1 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Reel
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>

        {takesEverything ? (
          <p className="mt-4 text-sm text-status-failed">
            Isso é todas as fotos. Use Dividir em posts separados em vez disso — é exatamente
            o que isso faz.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-status-failed">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canSubmit}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-50"
          >
            {submitting ? "Separando…" : "Separar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
