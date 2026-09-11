import "server-only";
import { getDb } from "./db";

/**
 * Owner lookups for child tables that have no owner_user_id column of their own (see
 * migrations/0034_owner_scoping.sql) and whose routes act on a bare id with no parent
 * row already fetched to read .owner_user_id off — every OTHER by-id route reuses a row
 * it already fetches for its own existence check, so it needs no helper here. These two
 * are the exceptions: publications/[id]/* calls straight into a state-transition
 * function with no prior fetch, and the media thumbnail route does a raw SELECT with no
 * existence-check scaffolding at all.
 *
 * Both return undefined for a row that does not exist, and null for one that exists but
 * has no owner (an admin-created or pre-migration row) — callers should treat either as
 * "not this viewer's," same as a root table's own null owner_user_id already means.
 */

export function getPublicationOwnerId(publicationId: number): number | null | undefined {
  const row = getDb()
    .prepare(
      `SELECT p.owner_user_id AS owner_user_id
         FROM publications pub
         JOIN posts p ON p.id = pub.post_id
        WHERE pub.id = ?`
    )
    .get(publicationId) as { owner_user_id: number | null } | undefined;
  return row?.owner_user_id;
}

export function getRemoteMediaOwnerId(remoteMediaId: number): number | null | undefined {
  const row = getDb()
    .prepare(
      `SELECT c.owner_user_id AS owner_user_id
         FROM remote_media rm
         JOIN channels c ON c.id = rm.channel_id
        WHERE rm.id = ?`
    )
    .get(remoteMediaId) as { owner_user_id: number | null } | undefined;
  return row?.owner_user_id;
}

/**
 * The shared ownership check every Pattern-B/D route makes: does this row belong to the
 * viewer, or is the viewer an admin? Returns true when access is allowed. A route still
 * decides its own response (404, not 403 — never confirm the id exists to someone who
 * doesn't own it) when this returns false.
 */
export function isOwnedByOrAdmin(
  ownerUserId: number | null | undefined,
  viewer: { id: number; is_admin: boolean }
): boolean {
  if (viewer.is_admin) return true;
  return ownerUserId !== undefined && ownerUserId === viewer.id;
}
