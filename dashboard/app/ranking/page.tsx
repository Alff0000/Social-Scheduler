import { getChannelRanking } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ChannelRankingTable } from "@/components/channel-ranking-table";
import { DateRangeFilter } from "@/components/date-range-filter";
import { getSessionUser } from "@/lib/auth";
import { parseRangeParams, rangeLabel } from "@/lib/date-range";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { preset, range } = parseRangeParams(query, config.defaultTimezone);
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const rows = getChannelRanking(range, ownerId);

  return (
    <div>
      <PageHeader
        title="Ranking de contas"
        subtitle={`Quem mais performou ${rangeLabel(preset, range)} — clique numa coluna pra ordenar por ela.`}
        action={
          <DateRangeFilter
            preset={preset}
            start={range.start}
            end={range.end}
            timeZone={config.defaultTimezone}
          />
        }
      />
      <div className="px-8 py-6">
        <ChannelRankingTable rows={rows} />
      </div>
    </div>
  );
}
