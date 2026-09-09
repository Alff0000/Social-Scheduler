"use client";

import { useEffect } from "react";

/*
  Only fires when the ROOT layout itself throws (error.tsx can't catch that — it renders
  INSIDE the layout). Must render its own <html>/<body>: the real ones never mounted.
  Deliberately plain, inline-styled, no theme tokens — globals.css and the theme
  attributes come from the layout that just failed, so this cannot assume either exists.
*/
export default function GlobalError({
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
    const key = "ss-chunk-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [isChunkError]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0910",
          color: "#f5eef0",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {isChunkError ? "Atualizando…" : "Algo deu errado"}
          </p>
          <p style={{ marginTop: 8, fontSize: 14, color: "#a98d93" }}>
            {isChunkError
              ? "Uma nova versão foi publicada — recarregando automaticamente."
              : "Nada foi perdido. Tente recarregar a página."}
          </p>
          {!isChunkError ? (
            <button
              onClick={reset}
              style={{
                marginTop: 16,
                borderRadius: 8,
                background: "#ff2d55",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
          ) : null}
        </div>
      </body>
    </html>
  );
}
