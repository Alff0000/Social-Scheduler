import { NextResponse } from "next/server";
import { getPost, unmergeCarousel } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

// Thin passthrough, matching app/api/posts/merge/route.ts. Every real guard lives in
// lib/unmerge-plan.ts, reached through unmergeCarousel — the only thing validated here is
// that the URL segment is actually a number.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }
  // Same wording lib/unmerge-plan.ts's own not-found already uses for this route family —
  // a foreign-owned post answers exactly like one that was deleted.
  const post = getPost(postId);
  if (!post || (!viewer.is_admin && post.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "That post no longer exists." }, { status: 404 });
  }
  const result = unmergeCarousel(postId);
  if (!result.ok) {
    return NextResponse.json({ error: result.problem.message }, { status: result.problem.status });
  }
  return NextResponse.json({ ok: true, post_ids: result.post_ids });
}
