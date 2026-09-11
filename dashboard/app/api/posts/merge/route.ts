import { NextResponse } from "next/server";
import { getPost, mergePostsIntoCarousel } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ownerId = viewer.is_admin ? null : viewer.id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const { post_ids, asset_order, caption } = body as Record<string, unknown>;
  if (!Array.isArray(post_ids) || !post_ids.every((n) => Number.isInteger(n))) {
    return NextResponse.json({ error: "post_ids must be an array of post ids." }, { status: 400 });
  }
  if (!Array.isArray(asset_order) || !asset_order.every((n) => Number.isInteger(n))) {
    return NextResponse.json({ error: "asset_order must be an array of asset ids." }, { status: 400 });
  }
  if (caption !== null && caption !== undefined && typeof caption !== "string") {
    return NextResponse.json({ error: "caption must be text or null." }, { status: 400 });
  }
  // A post that exists but belongs to someone else answers exactly like one that does not
  // exist at all — same convention as posts/targets/bulk/route.ts.
  const unknownIdx = (post_ids as number[]).findIndex((id) => {
    const post = getPost(id);
    return !post || (ownerId !== null && post.owner_user_id !== ownerId);
  });
  if (unknownIdx !== -1) {
    return NextResponse.json(
      { error: `Unknown post ${(post_ids as number[])[unknownIdx]}.` },
      { status: 400 },
    );
  }
  const result = mergePostsIntoCarousel(
    post_ids as number[], asset_order as number[], (caption as string) ?? null,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.problem.message }, { status: result.problem.status });
  }
  return NextResponse.json({ ok: true, post_id: result.post_id });
}
