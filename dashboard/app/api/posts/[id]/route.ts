import { NextResponse } from "next/server";
import { deletePost, getPost } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const postId = Number(id);
  const post = getPost(postId);
  if (!post || (!viewer.is_admin && post.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
  }
  const result = deletePost(postId);

  if (result === "not_found") {
    return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
  }
  if (result === "has_live") {
    return NextResponse.json(
      {
        error:
          "This post has sends already posted to Instagram — delete is blocked to protect their records (the Instagram post stays live).",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
