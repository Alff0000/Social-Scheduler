import { getChannels, listPeriods, listTags } from "@/lib/queries";
import { BulkImport } from "@/components/bulk-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">Importação em massa</h1>
        <p className="mt-1 text-sm text-muted">
          Adicione várias imagens de uma vez — cada uma vira um rascunho que você pode etiquetar, direcionar e agendar.
        </p>
      </header>
      <BulkImport
        channels={getChannels()}
        periods={listPeriods()}
        timeOfDayTags={listTags("time_of_day")}
        topicTags={listTags("topic")}
      />
    </div>
  );
}
