import { NextRequest, NextResponse } from "next/server";
import { getChannel, getPublication, restoreCanceledPublication } from "@/lib/queries";
import { intervalSlots } from "@/lib/scheduling";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Bring a canceled send back to 'scheduled' at a new date/time — the Cancelados
 *  section's only way back in, mirroring reschedule/route.ts's own date/time handling. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const pubId = Number(id);
  const pub = getPublication(pubId);
  if (!pub) {
    return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const date: string = body.date || "";
  const time: string = body.time || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Escolha uma data." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Digite um horário no formato HH:MM." }, { status: 400 });
  }

  const channel = getChannel(pub.channel_id);
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });
  }

  const scheduledAtUtc = intervalSlots(date, time, 1, 1, channel.timezone)[0];
  const ok = restoreCanceledPublication(pubId, scheduledAtUtc);
  if (!ok) {
    return NextResponse.json(
      { error: "Só um envio cancelado pode ser restaurado." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
