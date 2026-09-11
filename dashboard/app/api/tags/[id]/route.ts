import { NextRequest, NextResponse } from "next/server";
import {
  deleteTopicTag,
  getTag,
  renameTopicTag,
  DuplicateTagNameError,
  ProtectedTagError,
  ReservedTagNameError,
} from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) {
    return NextResponse.json({ error: "Invalid tag id." }, { status: 400 });
  }
  const existing = getTag(tagId);
  // time_of_day bands have owner_user_id NULL and are shared — renameTopicTag already
  // refuses them for a different reason (ProtectedTagError), so no owner check would
  // ever need to special-case them here even if one were added.
  if (!existing || (!viewer.is_admin && existing.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Give the tag a name." }, { status: 400 });
  }
  try {
    const tag = renameTopicTag(tagId, name);
    if (!tag) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }
    return NextResponse.json(tag);
  } catch (e) {
    if (
      e instanceof ProtectedTagError ||
      e instanceof ReservedTagNameError ||
      e instanceof DuplicateTagNameError
    ) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const tagId = Number(id);
  if (!Number.isInteger(tagId)) {
    return NextResponse.json({ error: "Invalid tag id." }, { status: 400 });
  }
  const existing = getTag(tagId);
  if (!existing || (!viewer.is_admin && existing.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  }
  try {
    const { deleted, postCount } = deleteTopicTag(tagId);
    if (!deleted) {
      return NextResponse.json({ error: "Tag not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, postCount });
  } catch (e) {
    if (e instanceof ProtectedTagError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
