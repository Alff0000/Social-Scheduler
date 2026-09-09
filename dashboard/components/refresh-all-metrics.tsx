"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshAllMetrics({ workerOnline = true }: { workerOnline?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    const res = await fetch("/api/metrics/refresh-all", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(body.error ?? "Algo deu errado.");
      return;
    }
    setMsg(
      workerOnline
        ? `${body.requested} enfileirado${body.requested === 1 ? "" : "s"} — atualiza após a próxima execução do worker.`
        : `${body.requested} enfileirado${body.requested === 1 ? "" : "s"}, mas o worker parece offline — inicie-o para aplicar.`
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      {msg ? (
        <span
          className={`data text-[11px] ${msg && !workerOnline ? "text-status-scheduled" : "text-muted"}`}
        >
          {msg}
        </span>
      ) : null}
      <button
        onClick={run}
        disabled={pending}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface-sunken disabled:opacity-50"
      >
        {pending ? "Enfileirando…" : "Atualizar todas as métricas"}
      </button>
    </div>
  );
}
