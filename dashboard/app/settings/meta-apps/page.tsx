import { listMetaApps } from "@/lib/meta-apps-queries";
import { PageHeader } from "@/components/ui";
import { MetaAppsManager } from "@/components/meta-apps-manager";

export const dynamic = "force-dynamic";

/*
  A registry of Meta for Developers apps this install knows about — see migration
  0032_meta_apps.sql for why this lives in the database rather than .env (a deliberate,
  narrow exception, made explicitly with the owner: a LIST of apps has no meaning under
  the single-app-per-.env assumption the rest of this app's credentials follow).

  Registering an app here does not connect anything by itself — it only makes that app
  available to /settings/integration's OAuth link generator. Channels still connect the
  existing way (paste a token on /channels); nothing here changes that.
*/

export default function MetaAppsPage() {
  const apps = listMetaApps();

  return (
    <div>
      <PageHeader
        title="Apps Meta"
        subtitle="Apps cadastrados no Meta for Developers, usados para gerar os links de autenticação em Integração."
      />
      <div className="px-8 py-6">
        <MetaAppsManager apps={apps} />
      </div>
    </div>
  );
}
