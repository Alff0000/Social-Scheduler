import { NextRequest, NextResponse } from "next/server";
import {
  bulkEditPosts,
  getPeriod,
  getPost,
  listTags,
  type BulkEditPostsInput,
} from "@/lib/queries";
import { parsePeriodLinks, parseTagIds } from "@/lib/content-model-validation";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Apply local Library metadata to several posts only after the full request validates. */
export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const ownerId = viewer.is_admin ? null : viewer.id;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  // 1. Validate every selected post before looking at any requested edit.
  if (!Array.isArray(body.post_ids) || body.post_ids.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um post." }, { status: 400 });
  }
  if (body.post_ids.some((id: unknown) => typeof id !== "number" || !Number.isInteger(id))) {
    return NextResponse.json({ error: "post_ids deve conter apenas números inteiros." }, { status: 400 });
  }
  const postIds = [...new Set<number>(body.post_ids)];
  const unknownPostId = postIds.find((id) => {
    const post = getPost(id);
    return !post || (ownerId !== null && post.owner_user_id !== ownerId);
  });
  if (unknownPostId !== undefined) {
    return NextResponse.json({ error: `Post desconhecido ${unknownPostId}.` }, { status: 400 });
  }

  // 2. Validate tag add/remove lists using the same shared parser as per-post writes.
  let tags: BulkEditPostsInput["tags"];
  if (body.tags !== undefined) {
    if (!body.tags || typeof body.tags !== "object" || Array.isArray(body.tags)) {
      return NextResponse.json({ error: "tags deve conter as listas add/remove." }, { status: 400 });
    }
    const validTagIds = new Set(listTags(undefined, ownerId).map((tag) => tag.id));
    const add = parseTagIds(body.tags.add === undefined ? [] : body.tags.add, (id) => validTagIds.has(id));
    const remove = parseTagIds(body.tags.remove === undefined ? [] : body.tags.remove, (id) => validTagIds.has(id));
    if (add === "invalid" || remove === "invalid") {
      return NextResponse.json({ error: "Lista de etiquetas para adicionar/remover inválida." }, { status: 400 });
    }
    tags = { add: add ?? [], remove: remove ?? [] };
  }

  // 3. Validate period add/remove links with the shared period parser.
  let periods: BulkEditPostsInput["periods"];
  if (body.periods !== undefined) {
    if (!body.periods || typeof body.periods !== "object" || Array.isArray(body.periods)) {
      return NextResponse.json(
        { error: "periods deve conter as listas add/remove." },
        { status: 400 }
      );
    }
    const scopedGetPeriod = (pid: number) => {
      const p = getPeriod(pid);
      return p && (ownerId === null || p.owner_user_id === ownerId) ? p : undefined;
    };
    const add = parsePeriodLinks(body.periods.add === undefined ? [] : body.periods.add, scopedGetPeriod);
    const remove = parsePeriodLinks(
      body.periods.remove === undefined ? [] : body.periods.remove,
      scopedGetPeriod
    );
    if (add === "invalid" || remove === "invalid") {
      return NextResponse.json({ error: "Lista de períodos para adicionar/remover inválida." }, { status: 400 });
    }
    periods = { add: add ?? [], remove: remove ?? [] };
  }

  // 4. Validate scalar fields last. No write has happened above this line.
  const edit: BulkEditPostsInput = { post_ids: postIds, tags, periods };
  if (body.content_status !== undefined) {
    if (!['draft', 'ready', 'retired'].includes(body.content_status)) {
      return NextResponse.json(
        { error: "content_status deve ser draft, ready ou retired." },
        { status: 400 }
      );
    }
    edit.content_status = body.content_status;
  }
  if (body.content_kind !== undefined) {
    if (body.content_kind !== "one_time" && body.content_kind !== "evergreen") {
      return NextResponse.json(
        { error: "content_kind deve ser one_time ou evergreen." },
        { status: 400 }
      );
    }
    edit.content_kind = body.content_kind;
  }
  if ("cooldown_days" in body) {
    if (body.cooldown_days === null || body.cooldown_days === undefined) {
      edit.cooldown_days = null;
    } else {
      const cooldownDays = Number(body.cooldown_days);
      if (!Number.isInteger(cooldownDays) || cooldownDays < 0) {
        return NextResponse.json(
          { error: "cooldown_days deve ser um inteiro não negativo ou null." },
          { status: 400 }
        );
      }
      edit.cooldown_days = cooldownDays;
    }
  }

  return NextResponse.json(bulkEditPosts(edit), { status: 200 });
}
