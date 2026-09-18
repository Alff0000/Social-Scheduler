"use client";

import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui";
import { humanBytes } from "@/lib/format";
import type { UserRow } from "@/lib/users";

type UserWithStorage = UserRow & { storage_bytes: number };

function StorageLimitEditor({
  user,
  onSaved,
}: {
  user: UserWithStorage;
  onSaved: (limitMb: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    user.storage_limit_mb != null ? String(user.storage_limit_mb) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usageMb = user.storage_bytes / (1024 * 1024);
  const overLimit = user.storage_limit_mb != null && usageMb > user.storage_limit_mb;

  async function save() {
    const trimmed = draft.trim();
    const limitMb = trimmed === "" ? null : Number(trimmed);
    if (limitMb !== null && (!Number.isFinite(limitMb) || limitMb <= 0)) {
      setError("Digite um número maior que zero, ou deixe vazio para sem limite.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_limit_mb: limitMb }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível salvar o limite.");
      return;
    }
    onSaved(limitMb);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Sem limite"
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-brand"
        />
        <span className="text-[11px] text-faint">MB</span>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-on-brand disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={busy}
          className="text-[11px] text-muted hover:text-ink"
        >
          Cancelar
        </button>
        {error ? <p className="text-[11px] text-status-failed">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-[12px] hover:underline ${overLimit ? "font-medium text-status-failed" : "text-muted"}`}
      title="Clique para mudar o limite de armazenamento"
    >
      {humanBytes(user.storage_bytes)}
      {user.storage_limit_mb != null ? ` de ${user.storage_limit_mb} MB` : " · sem limite"}
      {overLimit ? " · acima do limite" : ""}
    </button>
  );
}

export function UsersView({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserWithStorage[];
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
      setUsers((prev) => [...prev, { ...data.user, storage_bytes: 0 }]);
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
                <StorageLimitEditor
                  user={u}
                  onSaved={(limitMb) =>
                    setUsers((prev) =>
                      prev.map((p) => (p.id === u.id ? { ...p, storage_limit_mb: limitMb } : p))
                    )
                  }
                />
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
