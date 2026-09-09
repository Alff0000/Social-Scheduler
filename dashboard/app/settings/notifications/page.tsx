import { getNotificationSettings } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { NotificationToggles } from "@/components/notification-toggles";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  const settings = getNotificationSettings();

  return (
    <div>
      <PageHeader
        title="Notificações"
        subtitle="Liga/desliga de alertas — erro na fila, relatório automático, conta bloqueada."
      />
      <div className="px-8 py-6">
        <p className="mb-5 rounded-card border border-dashed border-border px-4 py-3 text-xs text-muted">
          Isso guarda a preferência, mas ainda não envia nada — este install não tem email
          nem push configurado. Fica pronto para o worker usar quando o envio (por exemplo
          via um canal Discord/Telegram já conectado) for implementado.
        </p>
        <NotificationToggles settings={settings} />
      </div>
    </div>
  );
}
