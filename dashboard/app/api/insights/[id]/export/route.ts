import { NextRequest, NextResponse } from "next/server";
import { getAccountDays, getInsightsChannel } from "@/lib/insights-queries";
import { densify, windowRows, rangeDays, RANGES, type DayRow, type MetricKey } from "@/lib/insights";
import { toCsv } from "@/lib/csv";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// Every DayRow field except the day itself — deliberately every column this install has
// EVER recorded for the account, not just the ones the platform's own insights page
// currently shows. A CSV meant to leave the app for a spreadsheet or a client report
// should hand over everything on record, not re-apply the same platform-specific curation
// the on-screen page uses to keep a chart from looking broken.
const METRIC_COLUMNS: MetricKey[] = [
  "followers_count", "follows_count", "media_count", "reach", "views", "profile_views",
  "accounts_engaged", "total_interactions", "likes", "comments", "saves", "shares",
  "replies", "website_clicks", "follows_gained", "lifetime_likes",
];

/**
 * Daily metrics for one account as CSV — the one way data leaves this app for a
 * spreadsheet or a client report, short of screenshotting the page. Reuses exactly the
 * same densify/windowRows shaping the on-screen chart does, so the exported numbers can
 * never read differently from what the page just showed for the same range.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const channelId = Number(id);
  if (!Number.isInteger(channelId)) {
    return NextResponse.json({ error: "Invalid channel id." }, { status: 400 });
  }
  const channel = getInsightsChannel(channelId);
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const days = RANGES.some((r) => r.key === rangeParam) ? rangeDays(rangeParam) : rangeDays("30d");

  const allDays = getAccountDays(channelId);
  const rows: DayRow[] = densify(windowRows(allDays, days), days);

  const csv = toCsv(
    ["day", ...METRIC_COLUMNS],
    rows.map((r) => [r.day, ...METRIC_COLUMNS.map((k) => r[k])]),
  );

  const filename = `${channel.account_name.replace(/[^a-z0-9-_]+/gi, "_")}-${rangeParam}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
