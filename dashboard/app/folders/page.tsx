import { getChannels, listFolders } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { FolderManager } from "@/components/folder-manager";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FoldersPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const folders = listFolders(ownerId);
  const channels = getChannels(ownerId);

  return (
    <div>
      <PageHeader
        title="Minhas Pastas"
        subtitle="Organize suas contas em pastas — crie, renomeie, exclua e mova contas entre elas."
      />
      <div className="px-8 py-6">
        <FolderManager
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          channels={channels.map((c) => ({
            id: c.id,
            account_name: c.account_name,
            platform: c.platform,
            color_hue: c.color_hue,
            avatar_path: c.avatar_path,
            folder_id: c.folder_id,
          }))}
        />
      </div>
    </div>
  );
}
