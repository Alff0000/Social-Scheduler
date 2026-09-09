"use client";

import { useCallback, useEffect, useState } from "react";

// Reads the read-only /api/update-check endpoint and, when this copy is behind the latest
// code, tells the user how to update: close the app and double-click the Update script.
// Applying the update is NOT done here — a running server can't cleanly replace its own
// code and restart. This component only surfaces "you're behind + here's what to do".

type Platform = "mac" | "windows" | "other";

type UpdateState =
  | { state: "behind"; behind: number; currentSha: string; latestSha: string; platform: Platform }
  | { state: "current"; currentSha: string; platform: Platform }
  | { state: "unknown"; reason: string; platform: Platform };

function scriptName(p: Platform): string {
  if (p === "windows") return "Update-Windows";
  if (p === "mac") return "Update-Mac";
  return "o script de atualização";
}

export function UpdateBanner() {
  const [data, setData] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async (force: boolean) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/update-check${force ? "?force=1" : ""}`);
      setData(await res.json());
      if (force) setDismissed(false);
    } catch {
      setData({ state: "unknown", reason: "Não foi possível verificar atualizações.", platform: "other" });
    } finally {
      setChecking(false);
    }
  }, []);

  // Check once when the app loads (uses the server-side cache, so it's cheap).
  //
  // check() flips `checking` synchronously before awaiting, which costs one extra render
  // on mount. Restructuring to avoid it would mean duplicating the fetch/error handling
  // that the manual "Check again" button shares — a worse trade for a banner that renders
  // nothing until the request returns.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above.
    check(false);
  }, [check]);

  // Prominent, actionable banner when there's actually an update to install.
  if (data?.state === "behind" && !dismissed) {
    const label = data.behind === 1 ? "1 atualização" : `${data.behind} atualizações`;
    return (
      <div className="rounded-lg border border-status-scheduled/40 bg-status-scheduled/10 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-semibold text-ink">Atualização disponível</p>
          <button
            onClick={() => setDismissed(true)}
            className="-mt-0.5 text-muted hover:text-ink"
            aria-label="Dispensar"
            title="Dispensar até a próxima abertura"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
          Você está {label} atrás. Para instalar: feche este app e dê duplo clique em{" "}
          <code className="data text-[10px] text-muted">{scriptName(data.platform)}</code>.
        </p>
      </div>
    );
  }

  // Otherwise stay quiet: a single muted line with a manual re-check.
  let text = "Verificar atualizações";
  if (checking) text = "Verificando…";
  else if (data?.state === "current") text = "Atualizado";
  else if (data?.state === "unknown") text = "Verificação de atualização indisponível";

  return (
    <button
      onClick={() => check(true)}
      disabled={checking}
      title={data?.state === "unknown" ? data.reason : "Verificar se há uma versão mais nova"}
      className="px-3 text-left text-[11px] text-faint hover:text-ink-soft disabled:opacity-60"
    >
      {data?.state === "current" ? "✓ " : ""}
      {text}
    </button>
  );
}
