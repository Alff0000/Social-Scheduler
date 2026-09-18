import { humanBytes } from "@/lib/format";
import { diskBannerLevel, type DiskUsage } from "@/lib/disk";

/**
 * Shown to everyone, not just admin: the volume is install-wide (see CLAUDE.md's
 * multi-tenancy note), so a login that isn't the admin can still be the one adding the
 * megabytes that tip it over, and can go clean up their own media in the Biblioteca
 * without needing the admin first.
 */
export function DiskUsageBanner({ usage }: { usage: DiskUsage }) {
  const level = diskBannerLevel(usage.usedPercent);
  if (level === "none") return null;
  const critical = level === "critical";
  return (
    <div
      className={
        "rounded-lg px-4 py-3 text-sm font-medium text-white " +
        (critical ? "bg-status-failed" : "bg-status-blocked")
      }
    >
      ⚠ Disco do servidor em {usage.usedPercent.toFixed(0)}% de uso — {humanBytes(usage.freeBytes)} livres.{" "}
      {critical
        ? "Uploads e exclusões podem começar a falhar a qualquer momento — apague mídia sem uso na Biblioteca agora."
        : "Vale ir limpando mídia sem uso na Biblioteca antes que fique crítico."}
    </div>
  );
}
