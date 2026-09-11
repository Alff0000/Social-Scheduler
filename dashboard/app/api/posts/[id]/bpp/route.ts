import { NextResponse } from "next/server";
import { setPostBpp } from "@/lib/insights-queries";
import { getPost } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Mark or unmark a library post as a BPP.
 *
 * A person's decision, always — the app never sets this itself, so there is no
 * "auto-mark" path here on purpose.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }
  const post = getPost(postId);
  if (!post || (!viewer.is_admin && post.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const isBpp = Boolean(body.is_bpp);
  if (!setPostBpp(postId, isBpp)) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, is_bpp: isBpp });
}
