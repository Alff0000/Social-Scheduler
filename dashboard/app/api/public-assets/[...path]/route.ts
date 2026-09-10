import { NextRequest } from "next/server";
import { serveFile } from "@/lib/serve-file";

export const runtime = "nodejs";

/**
 * The ONE deliberately unauthenticated route in this app: Meta downloads media from here
 * at publish time, and Meta has no session cookie to send.
 *
 * Exists because PUBLIC_ASSET_BASE_URL, when set to this app's OWN public URL (the
 * documented alternative to the default per-publish Cloudflare quick tunnel — see
 * .env.example — and the only real option on a host like Railway, where the deployed app
 * already has a stable public domain and spinning up a second, separate tunnel from
 * inside that same container buys nothing), produces links of exactly this shape:
 * `{PUBLIC_ASSET_BASE_URL}/{relative path}` (worker/publisher.py's _resolve_url). Before
 * this route existed, that path had nowhere to land — middleware.ts requires a session
 * for every route it doesn't explicitly exempt, so Meta's request was redirected to
 * /login and served that page's HTML instead of the asset, which is exactly what a real
 * deploy hit: Meta refused a video with "the image format is not supported" because the
 * body it downloaded was a login page, not a video.
 *
 * PUBLIC_ASSET_BASE_URL must be set to this route's OWN prefix (`.../api/public-assets`),
 * not the bare app domain, and middleware.ts must exempt this exact prefix — both are
 * required together, and either one alone still 404s or still hits the login redirect.
 *
 * Reuses serveFile (lib/serve-file.ts) — the same path-traversal guard, MIME mapping and
 * Range support the authenticated dashboard preview route already relies on, so this
 * public route can't diverge from that one's safety properties over time.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  return serveFile(segments.join("/"), req);
}
