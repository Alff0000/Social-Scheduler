import { getChannels, listPeriods, listTags } from "@/lib/queries";
import { BulkImport } from "@/components/bulk-import";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">Importação em massa</h1>
        <p className="mt-1 text-sm text-muted">
          Adicione várias imagens de uma vez — cada uma vira um rascunho que você pode etiquetar, direcionar e agendar.
        </p>
      </header>
      <BulkImport
        channels={getChannels(ownerId)}
        periods={listPeriods()}
        timeOfDayTags={listTags("time_of_day")}
        topicTags={listTags("topic")}
      />
    </div>
  );
}
