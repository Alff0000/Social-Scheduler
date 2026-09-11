import { NextRequest, NextResponse } from "next/server";
import { getBulkEditContext, getPost } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Return current metadata coverage for a validated selection without changing any posts. */
export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ownerId = viewer.is_admin ? null : viewer.id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.post_ids) || body.post_ids.length === 0) {
    return NextResponse.json({ error: "Select at least one post." }, { status: 400 });
  }
  if (body.post_ids.some((id: unknown) => typeof id !== "number" || !Number.isInteger(id))) {
    return NextResponse.json({ error: "post_ids must contain integers." }, { status: 400 });
  }

  // A post that exists but belongs to someone else answers exactly like one that does not
  // exist at all — same convention as posts/bulk-edit/route.ts's own selection check.
  const postIds = [...new Set<number>(body.post_ids)];
  const unknownPostId = postIds.find((id) => {
    const post = getPost(id);
    return !post || (ownerId !== null && post.owner_user_id !== ownerId);
  });
  if (unknownPostId !== undefined) {
    return NextResponse.json({ error: `Unknown post ${unknownPostId}.` }, { status: 400 });
  }

  return NextResponse.json(getBulkEditContext(postIds), { status: 200 });
}
