"use client";

import { useState, type FormEvent } from "react";
import { LoginScene } from "@/components/login-scene";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Informe email e senha.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível entrar.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      {/* min-h-dvh, not min-h-screen: on mobile Safari/Chrome, 100vh includes the address
          bar that then hides itself, so the page grows after first paint and shoves the
          card around — dvh tracks the ACTUAL visible viewport instead. */}
      <LoginScene />
      <div className="glass-card relative w-full max-w-sm rounded-card p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            className="inline-block h-6 w-6 shrink-0 rounded-md bg-brand"
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--color-brand) 40%, var(--color-accent))",
            }}
          />
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            xxxxx
          </span>
        </div>
        <h1 className="font-display text-lg font-semibold text-ink">Entrar</h1>
        <p className="mt-1 text-[13px] text-muted">
          Plataforma fechada — o acesso é criado pelo administrador.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // text-base (16px), not text-sm: anything smaller makes iOS Safari zoom the
              // whole page in on focus, which then has to be manually zoomed back out.
              className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-base text-ink sm:text-sm"
              placeholder="voce@email.com"
              autoComplete="email"
              inputMode="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-base text-ink sm:text-sm"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-[13px] text-status-failed">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            // py-3 gives this a ~44px tap target, the accepted minimum for a comfortable
            // touch target — py-2 (the old value) measured closer to 36px.
            className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
