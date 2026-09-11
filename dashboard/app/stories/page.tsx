import Link from "next/link";
import { getActiveChannels, listFolders } from "@/lib/queries";
import { supportsStory } from "@/lib/platforms";
import { EmptyState, PageHeader } from "@/components/ui";
import { StoryComposer } from "@/components/story-composer";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
  Manual, one-off Story post — deliberately NOT the full /compose flow. A "story avulso"
  is a single piece of media going out to one or more accounts right now: no caption, no
  carousel, no scheduling grid, no periods/tags. Reusing ComposeSwitcher's full surface
  picker for this would drag in every other surface's rules for a page that only ever
  means "story, now". Posts through the SAME /api/posts endpoint compose.tsx uses, with
  surface fixed to 'story' and post_now always true.
*/

export default async function StoriesPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const channels = getActiveChannels(ownerId)
    .filter((c) => supportsStory(c.platform))
    .map((c) => ({
      id: c.id,
      platform: c.platform,
      account_name: c.account_name,
      color_hue: c.color_hue,
      avatar_path: c.avatar_path,
      folder_id: c.folder_id,
    }));
  const folders = listFolders(ownerId);

  return (
    <div>
      <PageHeader
        title="Stories"
        subtitle="Postagem manual de um story avulso — sem agendamento, vai para o worker publicar no próximo ciclo."
      />
      <div className="px-8 py-6">
        {channels.length === 0 ? (
          <EmptyState title="Nenhuma conta com Stories disponível">
            Só o Instagram tem Stories nesta plataforma. Conecte uma conta Instagram em{" "}
            <Link href="/channels" className="text-brand-strong underline">
              Contas
            </Link>
            .
          </EmptyState>
        ) : (
          <StoryComposer channels={channels} folders={folders} />
        )}
      </div>
    </div>
  );
}
