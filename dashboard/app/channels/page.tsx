import { getBppPool } from "@/lib/insights-queries";
import {
  getChannels,
  listChannelGroups,
  getGroupMembers,
  getBandCounts,
  getAutofillLanes,
  listFolders,
} from "@/lib/queries";
import { config } from "@/lib/config";
import { toLanePanels } from "@/lib/autofill-lanes";
import type { Surface } from "@/lib/types";
import {
  accountIdLabel,
  anySupportsStory,
  oauthConnectPath,
  platformLabel,
  supportsAvatar,
  supportsStory,
  usesAccountId,
} from "@/lib/platforms";
import { PageHeader, ChannelChip, ChannelAvatar, EmptyState } from "@/components/ui";
import { ChannelForm } from "@/components/channel-form";
import { ChannelToggle } from "@/components/channel-toggles";
import { ChannelCredentials } from "@/components/channel-credentials";
import { ChannelAvatarRefresh } from "@/components/channel-avatar-refresh";
import { ChannelColor } from "@/components/channel-color";
import { ChannelName } from "@/components/channel-name";
import { ChannelTimezone } from "@/components/channel-timezone";
import { AutofillConfig } from "@/components/autofill-config";
import { ChannelGroups } from "@/components/channel-groups";
import { ChannelGroupSelect } from "@/components/channel-group-select";
import { ChannelFolderSelect } from "@/components/channel-folder-select";
import { TestConnectionButton } from "@/components/test-connection-button";
import { ChannelSearchGrid } from "@/components/channel-search-grid";
import { tzAbbrev, timeAgo } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Which auto-fill lanes an ungrouped channel can offer. Instagram is the only platform
 *  with a Story surface, so every other channel gets the single-lane panel it always had —
 *  no switch, nothing new to learn. */
function channelSurfaces(platform: string): Surface[] {
  return supportsStory(platform) ? ["feed", "story"] : ["feed"];
}

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tiktok_connected?: string;
    tiktok_reconnected?: string;
    tiktok_error?: string;
  }>;
}) {
  // The TikTok OAuth callback redirects here with an outcome. Without showing it, a failed
  // connection looks identical to a successful one that simply has not appeared yet.
  const params = await searchParams;
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const channels = getChannels(ownerId);
  const folders = listFolders(ownerId);
  const groups = listChannelGroups(ownerId).map((g) => {
    const members = getGroupMembers(g.id);
    const memberIds = members.map((m) => m.id);
    // A group offers a Story lane only when one of its members can actually post a Story —
    // otherwise the lane would be configurable and never fire.
    const surfaces: Surface[] = anySupportsStory(members.map((m) => m.platform))
      ? ["feed", "story"]
      : ["feed"];
    return {
      id: g.id,
      name: g.name,
      timezone: g.timezone,
      bpp_every_days: g.bpp_every_days,
      // Pool is measured against a MEMBER: a group sends what its members can send.
      bpp_pool_size: getBppPool(members[0]?.id ?? 0, ownerId).usable,
      surfaces,
      lanes: toLanePanels(surfaces, getAutofillLanes({ kind: "group", id: g.id }), (s) =>
        getBandCounts(memberIds, s),
      ),
      members: members.map((m) => ({
        id: m.id,
        account_name: m.account_name,
        platform: m.platform,
      })),
    };
  });
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const groupTimezones = new Map(groups.map((g) => [g.id, g.timezone]));

  return (
    <div>
      <PageHeader
        title="Contas"
        subtitle="Cada conta social é configurada de forma independente — suas próprias credenciais, fuso horário e regras."
      />

      <div className="px-8 py-6 space-y-6">
        {params.tiktok_connected ? (
          <div className="rounded-card border border-border bg-surface-muted p-4 text-sm text-ink-soft">
            {params.tiktok_reconnected === "1" ? (
              <>
                <span className="font-medium text-ink">TikTok reconectado.</span> A conta
                existente foi atualizada com novas credenciais — sua fila, histórico e
                nome permanecem intactos.
              </>
            ) : (
              <>
                <span className="font-medium text-ink">TikTok conectado.</span> Rode{" "}
                <code>python -m worker.preflight</code> pra confirmar, depois agende um
                vídeo. Lembrete: o TikTok entrega o vídeo na sua caixa de entrada — você
                escreve a legenda e publica no app.
              </>
            )}
          </div>
        ) : null}
        {params.tiktok_error ? (
          <div className="rounded-card border border-status-failed bg-surface-muted p-4 text-sm text-status-failed">
            {params.tiktok_error}
          </div>
        ) : null}
        <ChannelForm
          defaultTimezone={config.defaultTimezone}
          nextChannelId={channels.reduce((max, c) => Math.max(max, c.id), 0) + 1}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        />

        {channels.length === 0 ? (
          <EmptyState title="Nenhuma conta configurada">
            Adicione sua primeira conta acima — Instagram, Facebook, Threads, Discord,
            Telegram, ou TikTok. A maioria precisa de um id de conta e um access token de
            longa duração; o Discord só precisa de uma URL de webhook, e o TikTok conecta
            pelo seu navegador.
          </EmptyState>
        ) : (
          <>
          <ChannelGroups
            groups={groups}
            defaultTimezone={config.defaultTimezone}
            bandTimes={config.bandTimes}
          />
          <ChannelSearchGrid channels={channels}>
            {channels.map((c) => (
              <div
                key={c.id}
                className={`rounded-card border bg-surface p-5 ${
                  c.is_active ? "border-border" : "border-border opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <ChannelAvatar
                      id={c.id}
                      name={c.account_name}
                      colorHue={c.color_hue}
                      avatarPath={c.avatar_path}
                      size={40}
                    />
                    <div>
                      <ChannelChip id={c.id} platform={c.platform} name={c.account_name} colorHue={c.color_hue} />
                      {c.business_label ? (
                        <p className="mt-1.5 text-xs text-muted">{c.business_label}</p>
                      ) : null}
                      {/* usesAccountId was standing in for "has a profile photo", which
                          was true until TikTok: it has an account id AND no avatar this
                          worker reads. Offering the button there sets a flag the avatar
                          job excludes in SQL, so it is never acted on and never cleared —
                          it would read "Requested" forever. */}
                      {usesAccountId(c.platform) && supportsAvatar(c.platform) ? (
                        <ChannelAvatarRefresh
                          channelId={c.id}
                          avatarError={c.avatar_error}
                        />
                      ) : null}
                    </div>
                  </div>
                  <span className="data text-[11px] text-faint">#{c.id}</span>
                </div>

                {c.lost_at ? (
                  <p className="mt-3 rounded-lg border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-xs text-status-failed">
                    <span className="font-medium">Conexão perdida</span> ({timeAgo(c.lost_at)}) —{" "}
                    {c.lost_reason ?? "token de acesso inválido ou revogado."}
                  </p>
                ) : null}

                <dl className="mt-4 space-y-1.5 text-xs">
                  <Row label="Fuso horário">
                    <span className="data text-ink-soft">
                      {c.timezone} · {tzAbbrev(c.timezone)}
                    </span>
                  </Row>
                  {usesAccountId(c.platform) ? (
                    <Row label={accountIdLabel(c.platform)}>
                      <span className="data text-ink-soft">
                        {c.remote_account_id || <span className="text-faint">não definido</span>}
                      </span>
                    </Row>
                  ) : null}
                  <Row label="Access token">
                    <span className="text-ink-soft">
                      {c.access_token ? (
                        <span className="text-status-posted">configurado</span>
                      ) : (
                        <span className="text-status-failed">faltando</span>
                      )}
                    </span>
                  </Row>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <ChannelToggle
                    id={c.id}
                    field="requires_approval"
                    value={c.requires_approval === 1}
                    labelOn="Aprovação necessária"
                    labelOff="Sem aprovação"
                  />
                  <ChannelToggle
                    id={c.id}
                    field="is_active"
                    value={c.is_active === 1}
                    labelOn="Ativa"
                    labelOff="Inativa"
                    confirmOffMessage={`Desativar ${c.account_name}? Nada mais será agendado ou publicado nela até você reativar.`}
                  />
                  <TestConnectionButton channelId={c.id} />
                </div>

                <ChannelCredentials
                  channelId={c.id}
                  platform={c.platform}
                  remoteAccountId={c.remote_account_id}
                />

                {/* A grouped channel doesn't own its timezone — the group does, and
                    rebasing one member alone would desynchronize the group. The API
                    rejects it too; this just stops the control being offered. */}
                {c.group_id === null ? (
                  <ChannelTimezone target={{ kind: "channel", id: c.id }} timezone={c.timezone} />
                ) : (
                  <p className="mt-3 rounded-lg border border-border bg-surface-sunken/40 p-3 text-xs text-muted">
                    O fuso horário é alterado em{" "}
                    <span className="font-medium text-ink-soft">
                      {groupNames.get(c.group_id)}
                    </span>
                    , que preenche automaticamente em{" "}
                    <span className="data text-ink-soft">
                      {groupTimezones.get(c.group_id)}
                    </span>
                    . Mover esta conta sozinha tiraria seus envios dos horários que ela
                    compartilha com o resto do grupo.
                  </p>
                )}

                {/* Reconnect lives on the CARD, not only in the add form. A TikTok
                    channel needs re-authorizing when its yearly refresh token expires or
                    when a new scope is added, and routing that through "Add channel"
                    both hides it and implies it would create a duplicate. */}
                {oauthConnectPath(c.platform) ? (
                  <div className="mt-3 rounded-lg border border-border bg-surface-sunken/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink-soft">Conexão</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Reautorize com {platformLabel(c.platform)} — necessário anualmente
                          quando o refresh token expira, ou depois que uma nova permissão é
                          adicionada. Sua fila, histórico e nome são mantidos.
                        </p>
                      </div>
                      <a
                        /* eslint-disable-next-line @next/next/no-html-link-for-pages */
                        href={oauthConnectPath(c.platform) as string}
                        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                      >
                        Reconectar
                      </a>
                    </div>
                  </div>
                ) : null}
                <ChannelName channelId={c.id} accountName={c.account_name} />
                <ChannelColor
                  channelId={c.id}
                  platform={c.platform}
                  accountName={c.account_name}
                  colorHue={c.color_hue}
                />

                <ChannelGroupSelect
                  channelId={c.id}
                  groupId={c.group_id}
                  groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                />

                <ChannelFolderSelect
                  channelId={c.id}
                  folderId={c.folder_id}
                  folders={folders.map((f) => ({ id: f.id, name: f.name }))}
                />

                {c.group_id === null ? (
                  <AutofillConfig
                    target={{ kind: "channel", id: c.id }}
                    surfaces={channelSurfaces(c.platform)}
                    lanes={toLanePanels(
                      channelSurfaces(c.platform),
                      getAutofillLanes({ kind: "channel", id: c.id }),
                      (s) => getBandCounts([c.id], s),
                    )}
                    bppEveryDays={c.bpp_every_days ?? 0}
                    bppPoolSize={getBppPool(c.id, ownerId).usable}
                    bandTimes={config.bandTimes}
                  />
                ) : (
                  <p className="mt-4 rounded-lg border border-border bg-surface-sunken/50 p-3 text-xs text-muted">
                    Preenchida automaticamente como parte de{" "}
                    <span className="font-medium text-ink-soft">
                      {groupNames.get(c.group_id)}
                    </span>
                    . A cadência dela é definida no grupo acima.
                  </p>
                )}
              </div>
            ))}
          </ChannelSearchGrid>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
