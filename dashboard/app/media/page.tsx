import Link from "next/link";
import { listAssetsWithUsage } from "@/lib/queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { MediaManager } from "@/components/media-manager";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const assets = listAssetsWithUsage(ownerId);

  return (
    <div>
      <PageHeader
        title="Biblioteca"
        subtitle="Todos os arquivos no seu banco de mídia. Qualquer coisa que não está mais em uso pode ser excluída para liberar espaço."
      />
      <div className="px-8 py-6">
        {assets.length === 0 ? (
          <EmptyState title="Nenhuma mídia ainda">
            Envie algo em{" "}
            <Link href="/compose" className="text-brand underline underline-offset-2">
              Postar Reels
            </Link>
            .
          </EmptyState>
        ) : (
          <MediaManager assets={assets} />
        )}
      </div>
    </div>
  );
}
