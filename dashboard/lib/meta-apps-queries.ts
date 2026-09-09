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
  created_at: string;
}

export function listMetaApps(): MetaAppRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, app_id, graph_version, created_at
       FROM meta_apps ORDER BY created_at ASC, id ASC`,
    )
    .all() as MetaAppRow[];
}

export function createMetaApp(input: {
  name: string;
  app_id: string;
  app_secret: string;
  graph_version?: string | null;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO meta_apps (name, app_id, app_secret_enc, graph_version)
       VALUES (@name, @app_id, @app_secret_enc, @graph_version)`,
    )
    .run({
      name: input.name.trim(),
      app_id: input.app_id.trim(),
      app_secret_enc: encryptSecret(input.app_secret),
      graph_version: input.graph_version?.trim() || null,
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
