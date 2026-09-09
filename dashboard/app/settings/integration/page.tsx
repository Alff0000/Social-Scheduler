import Link from "next/link";
import { listMetaApps } from "@/lib/meta-apps-queries";
import { config } from "@/lib/config";
import { EmptyState, PageHeader } from "@/components/ui";
import { IntegrationLinks } from "@/components/integration-links";

export const dynamic = "force-dynamic";

export default function IntegrationPage() {
  const apps = listMetaApps();

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
