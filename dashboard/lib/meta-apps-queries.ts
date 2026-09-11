import "server-only";
import { getDb } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";

/*
  Reads/writes for the meta_apps registry (migration 0032) — see that file's header for
  why this exists as a database table at all. Same discipline as stock-queries.ts: the
  secret is decrypted in exactly one place, and a list read never carries it.
*/

export interface MetaAppRow {
  id: number;
  name: string;
  app_id: string;
  graph_version: string | null;
  /** See Channel.owner_user_id in lib/types.ts for what this means and why it's nullable. */
  owner_user_id: number | null;
  created_at: string;
}

export function listMetaApps(ownerId: number | null): MetaAppRow[] {
  const where = ownerId === null ? "" : "WHERE owner_user_id = ?";
  return getDb()
    .prepare(
      `SELECT id, name, app_id, graph_version, owner_user_id, created_at
       FROM meta_apps ${where} ORDER BY created_at ASC, id ASC`,
    )
    .all(...(ownerId === null ? [] : [ownerId])) as MetaAppRow[];
}

/** Single-row fetch used by the [id] routes to check existence + ownership before acting. */
export function getMetaApp(id: number): MetaAppRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, name, app_id, graph_version, owner_user_id, created_at
       FROM meta_apps WHERE id = ?`,
    )
    .get(id) as MetaAppRow | undefined;
}

export function createMetaApp(input: {
  name: string;
  app_id: string;
  app_secret: string;
  graph_version?: string | null;
}, ownerUserId: number): number {
  const info = getDb()
    .prepare(
      `INSERT INTO meta_apps (name, app_id, app_secret_enc, graph_version, owner_user_id)
       VALUES (@name, @app_id, @app_secret_enc, @graph_version, @owner_user_id)`,
    )
    .run({
      name: input.name.trim(),
      app_id: input.app_id.trim(),
      app_secret_enc: encryptSecret(input.app_secret),
      graph_version: input.graph_version?.trim() || null,
      owner_user_id: ownerUserId,
    });
  return info.lastInsertRowid as number;
}

/** The ONE place an app secret is decrypted — used only by the reveal action. */
export function revealMetaAppSecret(id: number): string | null {
  const row = getDb().prepare("SELECT app_secret_enc FROM meta_apps WHERE id = ?").get(id) as
    | { app_secret_enc: string }
    | undefined;
  return row ? decryptSecret(row.app_secret_enc) : null;
}

export function deleteMetaApp(id: number): boolean {
  const info = getDb().prepare("DELETE FROM meta_apps WHERE id = ?").run(id);
  return info.changes > 0;
}
