"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControls } from "@/components/theme-controls";
import { UpdateBanner } from "@/components/update-banner";

const NAV = [
  { href: "/", label: "Visão geral", hint: "Fila e status" },
  { href: "/calendar", label: "Calendário", hint: "Visão semanal e mensal" },
  { href: "/compose", label: "Compor", hint: "Nova publicação" },
  { href: "/import", label: "Importar", hint: "Adicionar imagens em massa" },
  { href: "/library", label: "Biblioteca", hint: "Publicações e agendamento em massa" },
  { href: "/insights", label: "Estatísticas", hint: "Desempenho das contas" },
  { href: "/insights/pool", label: "Pool BPP", hint: "Publicações que valem repetir" },
  { href: "/media", label: "Mídia", hint: "Arquivos armazenados e limpeza" },
  { href: "/periods", label: "Períodos", hint: "Janelas sazonais" },
  { href: "/tags", label: "Etiquetas", hint: "Tópicos e limpeza" },
  { href: "/channels", label: "Canais", hint: "Contas e configuração" },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const nav = isAdmin
    ? [...NAV, { href: "/users", label: "Usuários", hint: "Acesso à plataforma" }]
    : NAV;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    // sticky + self-start + h-screen: as a flex child it would otherwise stretch to the
    // full page height, and a stretched box has nothing to stick within. Pinned to one
    // viewport with its own scrollbar, so long pages scroll the content, not the nav.
    <aside className="sticky top-0 self-start h-screen w-60 shrink-0 overflow-y-auto border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
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
        <p className="mt-1.5 text-[11px] leading-tight text-faint">
          Auto-hospedado · somente local
        </p>
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {nav.map((item) => {
            // Exact match for /insights so the nested "BPP pool" page does not light up
            // its parent as well — two highlighted rows reads as a bug.
            const active =
              item.href === "/" || item.href === "/insights"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 transition-colors ${
                    active
                      ? "bg-brand-weak text-brand-strong"
                      : "text-ink-soft hover:bg-surface-sunken"
                  }`}
                >
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[11px] text-muted">{item.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-border space-y-3">
        <UpdateBanner />
        <ThemeControls />
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-border px-3 py-2 text-left text-[13px] text-ink-soft hover:bg-surface-sunken"
        >
          Sair
        </button>
        <p className="px-3 text-[11px] leading-relaxed text-faint">
          O worker roda separadamente.
          <br />
          Os interruptores de segurança ficam no{" "}
          <code className="data text-[10px] text-muted">.env</code>.
        </p>
      </div>
    </aside>
  );
}
