import { NextResponse } from "next/server";
import { listTags, createTopicTag, ReservedTagNameError } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind && kind !== "topic" && kind !== "time_of_day") {
    return NextResponse.json({ error: "kind deve ser topic ou time_of_day." }, { status: 400 });
  }
  return NextResponse.json(
    listTags(kind as "topic" | "time_of_day" | undefined, viewer.is_admin ? null : viewer.id)
  );
}

export async function POST(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name é obrigatório." }, { status: 400 });
  }
  try {
    return NextResponse.json(createTopicTag(name, viewer.id), { status: 201 });
  } catch (e) {
    if (e instanceof ReservedTagNameError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
