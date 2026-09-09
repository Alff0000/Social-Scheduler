"use client";

import { useState } from "react";

interface Settings {
  queue_error_enabled: boolean;
  auto_report_enabled: boolean;
  account_blocked_enabled: boolean;
}

const ITEMS: { key: keyof Settings; label: string; hint: string }[] = [
  {
    key: "queue_error_enabled",
    label: "Erro na fila",
    hint: "Uma publicação falhou ou ficou travada esperando retry.",
  },
  {
    key: "auto_report_enabled",
    label: "Relatório automático",
    hint: "Um resumo periódico de desempenho fica pronto.",
  },
  {
    key: "account_blocked_enabled",
    label: "Conta bloqueada",
    hint: "A plataforma sinalizou um problema de acesso numa conta conectada.",
  },
];

export function NotificationToggles({ settings }: { settings: Settings }) {
  const [state, setState] = useState(settings);
  const [saving, setSaving] = useState<Set<keyof Settings>>(new Set());

  async function toggle(key: keyof Settings) {
    const next = !state[key];
    setState((prev) => ({ ...prev, [key]: next }));
    setSaving((prev) => new Set(prev).add(key));
    await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    setSaving((prev) => {
      const copy = new Set(prev);
      copy.delete(key);
      return copy;
    });
  }

  return (
    <section className="rounded-card border border-border bg-surface">
      <ul className="divide-y divide-border">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted">{item.hint}</p>
            </div>
            <label className="flex shrink-0 items-center gap-2">
              <input
                type="checkbox"
                checked={state[item.key]}
                onChange={() => toggle(item.key)}
                disabled={saving.has(item.key)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
