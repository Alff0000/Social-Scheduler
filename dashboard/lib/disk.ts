import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

export interface DiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export function usageFromStatfs(stats: { bsize: number; blocks: number; bavail: number }): DiskUsage {
  const totalBytes = stats.bsize * stats.blocks;
  const freeBytes = stats.bsize * stats.bavail;
  const usedBytes = totalBytes - freeBytes;
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  return { totalBytes, freeBytes, usedBytes, usedPercent };
}

/**
 * Real free space on the volume the database lives on, read straight from the
 * filesystem — never a configured number. A Railway volume can be resized without this
 * app ever being told the new size, so anything hardcoded (or read from an env var set
 * once at install time) would just go stale exactly like the disk it's supposed to be
 * watching. statfs works the same way on the owner's own Windows machine in local dev,
 * so this needs no env var either way.
 */
export function getDiskUsage(): DiskUsage | null {
  try {
    return usageFromStatfs(fs.statfsSync(path.dirname(config.databasePath)));
  } catch {
    // Some filesystems don't support statfs -- the banner just doesn't show rather
    // than breaking the Overview page over a nicety.
    return null;
  }
}

export type DiskBannerLevel = "none" | "warn" | "critical";

// The 500 MB volume that motivated this feature was already failing writes (uploads,
// deletes, even a schema migration) at 99% full, and had been sitting unnoticed above
// 90% for a while before anyone looked. WARN fires early enough (75%) to be a heads-up
// with time to act; CRITICAL (90%) means "go free space now."
const WARN_AT = 75;
const CRITICAL_AT = 90;

export function diskBannerLevel(usedPercent: number): DiskBannerLevel {
  if (usedPercent >= CRITICAL_AT) return "critical";
  if (usedPercent >= WARN_AT) return "warn";
  return "none";
}
