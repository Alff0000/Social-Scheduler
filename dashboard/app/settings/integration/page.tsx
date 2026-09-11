import Link from "next/link";
import { listMetaApps } from "@/lib/meta-apps-queries";
import { config } from "@/lib/config";
import { EmptyState, PageHeader } from "@/components/ui";
import { IntegrationLinks } from "@/components/integration-links";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IntegrationPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const apps = listMetaApps(ownerId);

  return (
    <div>
      <PageHeader
        title="Integração"
        subtitle="Links de OAuth do Instagram/Facebook para cada app Meta cadastrado."
      />
      <div className="px-8 py-6">
        {apps.length === 0 ? (
          <EmptyState title="Nenhum app Meta cadastrado ainda">
            Cadastre um app em{" "}
            <Link href="/settings/meta-apps" className="text-brand-strong underline">
              Apps Meta
            </Link>{" "}
            para gerar links de autenticação.
          </EmptyState>
        ) : (
          <IntegrationLinks apps={apps} defaultGraphVersion={config.graphVersion} />
        )}
      </div>
    </div>
  );
}
