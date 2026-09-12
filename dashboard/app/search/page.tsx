import Link from "next/link";
import { globalSearch } from "@/lib/queries";
import { PageHeader, EmptyState, ChannelAvatar } from "@/components/ui";
import { platformLabel } from "@/lib/platforms";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function postLabel(caption: string | null, id: number): string {
  const firstLine = (caption ?? "").trim().split("\n")[0].trim();
  return firstLine || `post #${id}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? "";
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const results = query.trim() ? globalSearch(query, ownerId) : { posts: [], channels: [], assets: [] };
  const total = results.posts.length + results.channels.length + results.assets.length;

  return (
    <div>
      <PageHeader
        title="Busca"
        subtitle={query.trim() ? `Resultados para "${query}"` : "Digite algo na busca da barra lateral."}
      />
      <div className="px-8 py-6 space-y-6">
        {!query.trim() ? null : total === 0 ? (
          <EmptyState title="Nada encontrado">
            Nenhum post, conta ou arquivo de mídia corresponde a essa busca.
          </EmptyState>
        ) : (
          <>
            {results.channels.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Contas
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {results.channels.map((c) => (
                    <Link
                      key={c.id}
                      href="/channels"
                      className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5 hover:bg-surface-sunken"
                    >
                      <ChannelAvatar
                        id={c.id}
                        name={c.account_name}
                        colorHue={c.color_hue}
                        avatarPath={c.avatar_path}
                        size={28}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{c.account_name}</span>
                        <span className="block text-[11px] text-muted">{platformLabel(c.platform)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {results.posts.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Posts
                </h2>
                <div className="space-y-2">
                  {results.posts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/library/${p.id}`}
                      className="block truncate rounded-card border border-border bg-surface px-3 py-2.5 text-sm text-ink hover:bg-surface-sunken"
                    >
                      {postLabel(p.caption, p.id)}
                      <span className="ml-2 text-[11px] text-muted">
                        {p.post_type} · {p.status}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {results.assets.length > 0 ? (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Mídia
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {results.assets.map((a) => (
                    <Link
                      key={a.id}
                      href="/media"
                      className="overflow-hidden rounded-card border border-border bg-surface"
                    >
                      <span className="block aspect-square bg-surface-sunken">
                        {a.media_kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/media/${a.id}?variant=thumb`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="block truncate px-2 py-1.5 text-[11px] text-ink-soft">
                        {a.original_filename ?? `asset #${a.id}`}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
