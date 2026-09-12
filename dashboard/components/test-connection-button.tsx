"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";

/**
 * A read-only check that a channel's stored token still works, run on demand instead of
 * only being discovered when a scheduled send actually fails on the queue.
 */
export function TestConnectionButton({ channelId }: { channelId: number }) {
  const [testing, setTesting] = useState(false);
  const { showToast } = useToast();

  async function test() {
    setTesting(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/test-connection`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        showToast(body.message ?? "Conexão funcionando.", "success");
      } else {
        showToast(body.error ?? "Não foi possível verificar essa conexão.", "error");
      }
    } catch {
      showToast("Não foi possível conectar ao servidor.", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={test}
      disabled={testing}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface-sunken disabled:opacity-50"
    >
      {testing ? "Testando…" : "Testar conexão"}
    </button>
  );
}
