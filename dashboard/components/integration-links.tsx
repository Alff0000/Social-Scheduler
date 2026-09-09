"use client";

import { useState } from "react";
import { buildFacebookOAuthUrl, DEFAULT_REDIRECT_URI, DEFAULT_SCOPES } from "@/lib/oauth-links";

interface MetaAppRow {
  id: number;
  name: string;
  app_id: string;
  graph_version: string | null;
}

function AppLink({ app, defaultGraphVersion }: { app: MetaAppRow; defaultGraphVersion: string }) {
  const [redirectUri, setRedirectUri] = useState(DEFAULT_REDIRECT_URI);
  const [scopes, setScopes] = useState(DEFAULT_SCOPES.join(","));
  const [copied, setCopied] = useState(false);

  const url = buildFacebookOAuthUrl(
    app.app_id,
    app.graph_version ?? defaultGraphVersion,
    redirectUri,
    scopes.split(",").map((s) => s.trim()).filter(Boolean),
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused — the link is still visible and selectable, so a
      // failed convenience must not look like a failed generation.
    }
  }

  const field =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink";

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">{app.name}</h3>
        <span className="data text-[11px] text-faint">{app.app_id}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block">Redirect URI</span>
          <input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block">Escopos (separados por vírgula)</span>
          <input value={scopes} onChange={(e) => setScopes(e.target.value)} className={field} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 truncate rounded-md bg-surface-sunken px-3 py-1.5 text-xs text-brand-strong hover:underline"
        >
          {url}
        </a>
        <button
          onClick={copy}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-sunken"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function IntegrationLinks({
  apps,
  defaultGraphVersion,
}: {
  apps: MetaAppRow[];
  defaultGraphVersion: string;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-card border border-dashed border-border px-4 py-3 text-xs text-muted">
        Abra o link, faça login com a conta que você quer conectar, e copie o{" "}
        <code className="data">access_token</code> que aparece na URL da página de sucesso
        do Facebook. Cole esse token na tela de{" "}
        <a href="/channels" className="text-brand-strong underline">
          Contas
        </a>{" "}
        ao conectar. Os escopos padrão cobrem publicação em Instagram Business via Facebook
        Login — confira se batem com os produtos que você ativou para este app em Meta for
        Developers, porque a Meta muda esses nomes com frequência.
      </p>
      {apps.map((app) => (
        <AppLink key={app.id} app={app} defaultGraphVersion={defaultGraphVersion} />
      ))}
    </div>
  );
}
