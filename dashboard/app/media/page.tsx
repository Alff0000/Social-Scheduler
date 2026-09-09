import Link from "next/link";
import { listAssetsWithUsage } from "@/lib/queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { MediaManager } from "@/components/media-manager";

export const dynamic = "force-dynamic";

export default function MediaPage() {
  const assets = listAssetsWithUsage();

  return (
    <div>
      <PageHeader
        title="Mídia"
        subtitle="Todos os arquivos no seu banco de mídia. Qualquer coisa que não está mais em uso pode ser excluída para liberar espaço."
      />
      <div className="px-8 py-6">
        {assets.length === 0 ? (
          <EmptyState title="No media yet">
            Upload something on{" "}
            <Link href="/compose" className="text-brand underline underline-offset-2">
              Compose
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
