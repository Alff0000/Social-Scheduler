import { listFolders } from "@/lib/queries";
import { listStockAccounts } from "@/lib/stock-queries";
import { PageHeader } from "@/components/ui";
import { StockManager } from "@/components/stock-manager";

export const dynamic = "force-dynamic";

/*
  Estoque — a bank of Instagram login credentials bought/gathered in bulk, organized into
  packs (folders — see migration 0030/0031). NOT the same thing as a connected `channel`:
  nothing here has an access_token or talks to the Graph API. It is inventory for a human
  to log into by hand, later becoming a real channel through the normal Connect flow on
  /channels once someone actually does that.

  Passwords and 2FA seeds are encrypted at rest (lib/crypto.ts) and never sent to the
  browser except through the explicit "mostrar" action — the list below carries only
  `hasTwofa`, never the secret itself.
*/

export default function StockPage() {
  const accounts = listStockAccounts();
  const folders = listFolders();

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Contas do Instagram compradas ou reunidas em lote, organizadas em pastas — antes de qualquer uma virar uma conta conectada de verdade."
      />
      <div className="px-8 py-6">
        <StockManager accounts={accounts} folders={folders} />
      </div>
    </div>
  );
}
