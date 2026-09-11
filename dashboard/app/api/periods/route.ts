import { NextRequest, NextResponse } from "next/server";
import { createPeriod, listPeriods } from "@/lib/queries";
import { hasValidOneOffPeriodDates } from "@/lib/periods";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ periods: listPeriods(viewer.is_admin ? null : viewer.id) });
}

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  // Default to yearly (matches the periods.recurs_yearly column default).
  const recursYearly = body.recurs_yearly !== false;

  if (recursYearly) {
    const startMonth = Number(body.start_month);
    const startDay = Number(body.start_day);
    const endMonth = Number(body.end_month);
    const endDay = Number(body.end_day);
    if (![startMonth, endMonth].every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
      return NextResponse.json(
        { error: "start_month/end_month must be 1-12." },
        { status: 400 }
      );
    }
    if (![startDay, endDay].every((d) => Number.isInteger(d) && d >= 1 && d <= 31)) {
      return NextResponse.json(
        { error: "start_day/end_day must be 1-31." },
        { status: 400 }
      );
    }
    const id = createPeriod({
      name,
      recurs_yearly: true,
      start_month: startMonth,
      start_day: startDay,
      end_month: endMonth,
      end_day: endDay,
    }, viewer.id);
    return NextResponse.json({ id }, { status: 201 });
  }

  if (!hasValidOneOffPeriodDates(body)) {
    return NextResponse.json(
      { error: "One-off periods require valid start_date/end_date calendar dates." },
      { status: 400 }
    );
  }
  const id = createPeriod({
    name,
    recurs_yearly: false,
    start_date: body.start_date,
    end_date: body.end_date,
  }, viewer.id);
  return NextResponse.json({ id }, { status: 201 });
}
