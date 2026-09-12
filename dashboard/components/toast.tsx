"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * A confirmation the owner can actually see.
 *
 * Before this, every save/approve/edit confirmation was inline text tied to one panel
 * (e.g. a `{notice}` paragraph next to a save button) — invisible the moment that panel
 * scrolled out of view, which on a long page (Fila, Biblioteca) is most of the time. A
 * toast is fixed to the viewport, so the confirmation is seen regardless of scroll
 * position, and it disappears on its own rather than needing to be dismissed.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, kind }]);
  }, []);

  function dismiss(id: number) {
    setToasts((current) => current.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Fixed to the viewport, not to any scrolling container — the whole point is being
          visible no matter where the page happens to be scrolled. Bottom-right stays clear
          of the sidebar (left) and the page header (top). */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-status-posted/40 text-status-posted",
  error: "border-status-failed/40 text-status-failed",
  info: "border-border-strong text-ink-soft",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Auto-dismisses on its own — a toast the owner has to click to get rid of is a second
  // chore, not a confirmation. 4s is enough to read a short line without lingering.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2 rounded-card border bg-surface px-4 py-3 text-sm shadow-lg ${KIND_STYLES[toast.kind]}`}
    >
      <span className="flex-1 text-ink">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="text-faint hover:text-ink-soft"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Throws outside a ToastProvider on purpose — a toast call site that silently no-ops when
 * misplaced would look like the feature was never wired up rather than tell you why.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside a <ToastProvider>.");
  return ctx;
}
