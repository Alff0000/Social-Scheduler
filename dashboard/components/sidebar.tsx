"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeControls } from "@/components/theme-controls";
import { UpdateBanner } from "@/components/update-banner";

const NAV_GROUPS = [
  {
    group: "Visão Geral",
    items: [
      { href: "/", label: "Dashboard", hint: "Fila e status" },
      { href: "/calendar", label: "Calendário", hint: "Visão semanal e mensal" },
    ],
  },
  {
    group: "Conteúdo",
    items: [
      { href: "/compose", label: "Postar Reel", hint: "Nova publicação" },
      { href: "/stories", label: "Stories", hint: "Story avulso, na hora" },
      { href: "/import", label: "Importar", hint: "Adicionar imagens em massa" },
      { href: "/library", label: "Agendamento em Massa", hint: "Publicações e agendamento em massa" },
      { href: "/media", label: "Biblioteca", hint: "Arquivos armazenados e limpeza" },
      { href: "/periods", label: "Períodos", hint: "Janelas sazonais" },
      { href: "/tags", label: "Etiquetas", hint: "Tópicos e limpeza" },
    ],
  },
  {
    group: "Desempenho",
    items: [
      { href: "/insights", label: "Relatório", hint: "Desempenho das contas" },
      { href: "/insights/reels", label: "Métricas de Reels", hint: "Views, likes e comentários por reel" },
      { href: "/insights/funnel", label: "Funil de Stories", hint: "Publicado → visualizado → toque → link → resposta" },
    ],
  },
  {
    group: "Publicação Automática",
    items: [
      { href: "/insights/pool", label: "Loop", hint: "Publicações que valem repetir" },
      { href: "/queue", label: "Status da Fila", hint: "Ok, pendentes, erros e progresso" },
      { href: "/queue/control", label: "Controle", hint: "Ritmo por conta e término estimado" },
    ],
  },
  {
    group: "Configuração",
    items: [
      { href: "/channels", label: "Contas", hint: "Contas e configuração" },
      { href: "/accounts/stock", label: "Estoque", hint: "Contas do Instagram em lotes" },
      { href: "/settings/meta-apps", label: "Apps Meta", hint: "Apps cadastrados no Meta for Developers" },
      { href: "/settings/integration", label: "Integração", hint: "Links de OAuth por app Meta" },
      { href: "/settings/notifications", label: "Notificações", hint: "Alertas de erro, relatório e bloqueio" },
    ],
  },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const groups = isAdmin
    ? NAV_GROUPS.map((g) =>
        g.group === "Configuração"
          ? { ...g, items: [...g.items, { href: "/users", label: "Usuários", hint: "Acesso à plataforma" }] }
          : g,
      )
    : NAV_GROUPS;

  // The longest href that matches the current path wins — so a parent route (e.g.
  // /insights) does not light up alongside a nested one (e.g. /insights/reels) that
  // also matches. Generalises the old one-off exact-match special case to every route
  // that gains children as more pages are added.
  const matches = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const activeHref = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];

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

      <nav className="flex-1 space-y-5 p-3">
        {groups.map((group) => (
          <div key={group.group}>
            <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {group.group}
            </h2>
            <ul className="space-y-1">
              {group.items.map((item) => {
                // The most specific href that matches wins, so a parent (e.g. /insights)
                // does not also light up while a nested page (e.g. /insights/reels) is
                // open — two highlighted rows reads as a bug.
                const active = item.href === activeHref;
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
          </div>
        ))}
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
