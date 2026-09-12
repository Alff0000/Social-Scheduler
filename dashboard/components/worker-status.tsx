"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Worker-liveness pill. The worker is a separate process; when it's not running,
 * scheduled publishing, auto-fill, and metrics refreshes silently don't happen. Surfacing
 * that here keeps the dashboard honest about what will and won't get picked up.
 *
 * A button, not a plain span with a title= tooltip: a tooltip is invisible on touch (no
 * hover), and even on desktop it never explained WHY it's offline or what to do about it —
 * only the last-seen time. Clicking now opens a short, concrete explanation instead.
 */
export function WorkerStatus({
  online,
  lastSeenAt,
}: {
  online: boolean;
  lastSeenAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const lastSeenLabel = lastSeenAt
    ? `visto pela última vez em ${new Date(lastSeenAt).toLocaleString("pt-BR")}`
    : "nunca deu sinal de vida";

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
          online
            ? "border-status-posted/40 text-status-posted"
            : "border-border-strong text-muted hover:bg-surface-sunken"
        }`}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: online ? "var(--color-status-posted)" : "var(--color-muted)",
          }}
        />
        Worker {online ? "online" : "offline"}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-card border border-border bg-surface p-3 text-xs text-ink-soft shadow-lg">
          <p className="font-medium text-ink">
            {online
              ? "O worker está rodando e verificando a fila normalmente."
              : `O worker está offline (${lastSeenLabel}).`}
          </p>
          {!online ? (
            <>
              <p className="mt-2">
                Enquanto ele estiver parado, nada agendado é publicado, o preenchimento
                automático não roda, e as métricas não são atualizadas — tudo fica
                enfileirado esperando ele voltar.
              </p>
              <p className="mt-2">
                Se você roda localmente: confira se o processo do worker (
                <code className="data rounded bg-surface-sunken px-1 py-0.5">
                  python -m worker.run
                </code>
                ) ainda está de pé. Se está no Railway: confira os logs do serviço do worker
                — um travamento ali não reinicia o container sozinho.
              </p>
            </>
          ) : (
            <p className="mt-2">{lastSeenLabel}.</p>
          )}
        </div>
      ) : null}
    </span>
  );
}
