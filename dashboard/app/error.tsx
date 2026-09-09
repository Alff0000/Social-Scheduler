"use client";

import { useEffect } from "react";

/*
  Catches any client-side exception thrown while rendering a route segment. Before this
  file existed, the app had NO error boundary anywhere — any unhandled exception left the
  page fully blank with no way back, which is exactly what a stale JS chunk throws right
  after a deploy (the browser still has the OLD page loaded, referencing a chunk hash the
  new deploy no longer serves — Next.js's own ChunkLoadError). That case self-heals with a
  single reload, so it gets one automatically; everything else gets a plain retry button.
*/
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      `${error.name} ${error.message}`,
    );

  useEffect(() => {
    if (!isChunkError) return;
    // A stale chunk means THIS load of the app is out of date, not that anything is
    // broken — reload once to pick up the current deploy. Guarded by sessionStorage so a
    // genuinely broken deploy fails visibly instead of reload-looping forever.
    const key = "ss-chunk-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [isChunkError]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm rounded-card border border-border bg-surface p-6 text-center">
        <p className="font-display text-base font-semibold text-ink">
          {isChunkError ? "Atualizando…" : "Algo deu errado nesta página"}
        </p>
        <p className="mt-1.5 text-sm text-muted">
          {isChunkError
            ? "Uma nova versão foi publicada — recarregando automaticamente."
            : "Nada foi perdido. Tente de novo, ou volte para o início."}
        </p>
        {!isChunkError ? (
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={reset}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-ink"
            >
              Tentar de novo
            </button>
            <a
              href="/"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-sunken"
            >
              Ir para o início
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
