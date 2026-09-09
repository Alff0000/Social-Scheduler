import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { BppMark } from "@/components/bpp-mark";
import { getBppEntries, getBppUnits } from "@/lib/insights-queries";
import { exact } from "@/lib/insights";

export const dynamic = "force-dynamic";

/*
  The BPP pool — your keepers, as a set.

  Marking happens while reviewing stats, one post at a time, on the Insights leaderboard.
  This is the other half of that workflow: seeing the pool whole, so "do I have enough
  for the cadence I set" and "what is about to go out again" are answerable at a glance
  rather than inferred from the queue.

  Ordered exactly as auto-fill will use it — longest-since-posted first — so the order on
  screen is the running order, not an approximation of it.
*/

function sinceLabel(iso: string | null): string {
  if (!iso) return "nunca desde a marcação";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 60) return `há ${days} dias`;
  return `há ${Math.floor(days / 30)} meses`;
}

export default function BppPoolPage() {
  const entries = getBppEntries();
  const units = getBppUnits();

  return (
    <div>
      <PageHeader
        title="Loop"
        subtitle="As publicações que você marcou como boas para repetir — na ordem em que serão usadas."
      />

      <div className="space-y-6 px-8 py-6">
        {/* Cadence per account, with the consequence spelled out. The pool is shared, but
            what each account can SEND differs — a post targeted only at Instagram is not
            in the Threads rotation, and a cadence set against the raw count would quietly
            under-deliver. */}
        <section className="rounded-card border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Rotação
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {units.map((unit) => {
              const period = unit.everyDays > 0 ? unit.usable * unit.everyDays : null;
              return (
                <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="text-sm text-ink">{unit.label}</span>
                  <span className="text-[11px] text-muted">
                    {unit.everyDays === 0 ? (
                      <>
                        rotação desligada —{" "}
                        <Link href="/channels" className="text-brand-strong underline">
                          defina uma cadência
                        </Link>
                      </>
                    ) : unit.usable === 0 ? (
                      <span className="text-status-publishing">
                        a cada <span className="data">{unit.everyDays}</span> dias, mas
                        nada no pool pode sair por aqui
                      </span>
                    ) : (
                      <>
                        <span className="data">{unit.usable}</span> utilizáveis · um a cada{" "}
                        <span className="data">{unit.everyDays}</span> dias ·{" "}
                        <span className={period !== null && period < 90 ? "text-status-publishing" : ""}>
                          cada um repete a cada <span className="data">{period}</span> dias
                        </span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {entries.length === 0 ? (
          <EmptyState title="Nada marcado ainda">
            Marque posts em{" "}
            <Link href="/insights" className="text-brand-strong underline">
              Relatório
            </Link>{" "}
            → uma conta → Melhores publicações. O filtro ★ Destaques restringe a lista
            aos posts que superaram seus contemporâneos, que é a lista curta que vale a
            pena revisar.
          </EmptyState>
        ) : (
          <section className="rounded-card border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
                {exact(entries.length)} marcados · próximo primeiro
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {entries.map((entry, index) => (
                <li key={entry.post_id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`data w-6 shrink-0 text-center text-[11px] ${
                      index === 0 ? "font-semibold text-brand-strong" : "text-faint"
                    }`}
                    title={index === 0 ? "Próximo na rotação" : undefined}
                  >
                    {index + 1}
                  </span>
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken" aria-hidden>
                    {entry.asset_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media/${entry.asset_id}`}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/library/${entry.post_id}`}
                      className="block truncate text-[13px] text-ink-soft hover:underline"
                    >
                      {entry.caption?.trim().split("\n")[0] || "Sem legenda"}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-faint">
                      última publicação {sinceLabel(entry.last_posted)}
                      {entry.targets ? ` · ${entry.targets}` : " · nenhuma conta alvo"}
                      {entry.content_status !== "ready" ? (
                        <span className="text-status-publishing">
                          {" "}· não está pronto, então será pulado
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <BppMark postId={entry.post_id} initial />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
