"use client";

import { useState, type FormEvent } from "react";

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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            className="inline-block h-6 w-6 rounded-md bg-brand"
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--color-brand) 40%, var(--color-accent))",
            }}
          />
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            InstaVips
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
              className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-ink"
              placeholder="voce@email.com"
              autoComplete="email"
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
              className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-ink"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-[13px] text-status-failed">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
