"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

export function ChannelToggle({
  id,
  field,
  value,
  labelOn,
  labelOff,
  /**
   * Asked (via window.confirm, matching every other destructive control in this app —
   * tags, periods, channel groups, Meta apps, the queue's own cancel button) only on the
   * ON -> OFF transition. Deactivating is the closest thing to "disconnect" a channel has
   * (there is no delete route) — it silently stops the channel from ever being scheduled
   * to again, which used to fire on a single click with no confirmation at all, unlike
   * every other state-changing control in the app.
   */
  confirmOffMessage,
}: {
  id: number;
  field: "requires_approval" | "is_active";
  value: boolean;
  labelOn: string;
  labelOff: string;
  confirmOffMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  async function toggle() {
    if (value && confirmOffMessage && !window.confirm(confirmOffMessage)) return;
    const res = await fetch(`/api/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !value }),
    });
    if (!res.ok) {
      showToast("Não foi possível salvar essa alteração.", "error");
      return;
    }
    showToast(!value ? `${labelOn}.` : `${labelOff}.`);
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        value
          ? "border-brand/30 bg-brand-weak text-brand-strong"
          : "border-border bg-surface text-muted hover:bg-surface-sunken"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${value ? "bg-brand" : "bg-faint"}`}
        aria-hidden
      />
      {value ? labelOn : labelOff}
    </button>
  );
}
