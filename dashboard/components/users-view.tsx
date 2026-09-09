"use client";

import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui";
import type { UserRow } from "@/lib/users";

export function UsersView({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Informe email e senha.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, is_admin: isAdmin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não foi possível criar o usuário.");
        setBusy(false);
        return;
      }
      setUsers((prev) => [...prev, data.user]);
      setEmail("");
      setPassword("");
      setIsAdmin(false);
      setShowForm(false);
    } catch {
      setError("Não foi possível criar o usuário.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: UserRow) {
    const nextActive = user.is_active ? false : true;
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive ? 1 : 0 } : u))
    );
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: nextActive }),
    });
    if (!res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: user.is_active } : u))
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Quem tem acesso a esta plataforma. Contas são criadas só por aqui."
        action={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand"
          >
            Novo usuário
          </button>
        }
      />
      <div className="p-8">
        {showForm ? (
          <form
            onSubmit={handleCreate}
            className="mb-6 rounded-card border border-border bg-surface p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-ink"
                  placeholder="pessoa@email.com"
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
                  placeholder="mínimo 8 caracteres"
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              Conta de administrador
            </label>
            {error ? (
              <p className="mt-2 text-[13px] text-status-failed">{error}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-60"
              >
                {busy ? "Criando…" : "Criar usuário"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-ink-soft"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="divide-y divide-border rounded-card border border-border bg-surface">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">{u.email}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {u.is_admin ? "admin" : "usuário"} · criado em{" "}
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    u.is_active
                      ? "text-[12px] font-medium text-status-posted"
                      : "text-[12px] font-medium text-status-failed"
                  }
                >
                  {u.is_active ? "ativo" : "revogado"}
                </span>
                {u.id !== currentUserId ? (
                  <button
                    onClick={() => toggleActive(u)}
                    className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-soft"
                  >
                    {u.is_active ? "Revogar" : "Reativar"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
