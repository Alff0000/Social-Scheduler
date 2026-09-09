import { listPeriods } from "@/lib/queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { PeriodAdd, PeriodCard } from "@/components/period-manager";

export const dynamic = "force-dynamic";

export default function PeriodsPage() {
  const periods = listPeriods();

  return (
    <div>
      <PageHeader
        title="Períodos"
        subtitle="Janelas sazonais reutilizáveis. Vincule qualquer uma a uma publicação como ativa (dentro da temporada) ou bloqueada (excluída) na hora de compor."
      />

      <div className="px-8 py-6 space-y-6">
        <PeriodAdd />

        {periods.length === 0 ? (
          <EmptyState title="Nenhum período ainda">
            Crie janelas como <em>Verão</em>, <em>Black Friday</em>, ou um intervalo pra
            um evento único. Aí um post marcado com essa janela só posta automaticamente
            enquanto estiver na temporada.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {periods.map((p) => (
              <PeriodCard key={p.id} period={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
